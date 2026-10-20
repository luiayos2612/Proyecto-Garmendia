import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';
import { tipoEvaluacionMateria } from '@/lib/evaluacionMaterias';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ✅ NUEVO: verifica que, si el actor es docente, el estudiante solicitado
// esté dentro de sus asignaciones activas. Si no, se responde 403 y no se
// filtra ningún dato (ni de pagos ni de otras materias) al docente.
async function docenteTieneAccesoAEstudiante(docenteId: string, estudianteId: string) {
  const res = await pool.query(
    `SELECT 1 FROM inscripciones_materias im
     JOIN asignaciones_docentes ad ON ad.materia_id = im.materia_id
       AND ad.periodo_id = im.periodo_id
       AND ad.activa = true
     WHERE im.estudiante_id = $1 AND im.activa = true AND ad.docente_id = $2
     LIMIT 1`,
    [estudianteId, docenteId]
  );
  return (res.rowCount ?? 0) > 0;
}

// GET - Obtener detalle del estudiante
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // ✅ NUEVO: bloqueo de acceso cruzado docente -> estudiante ajeno
    if (actor.rol === 'docente') {
      if (!actor.docenteId) {
        return NextResponse.json({ error: 'Perfil de docente no vinculado' }, { status: 403 });
      }
      const tieneAcceso = await docenteTieneAccesoAEstudiante(actor.docenteId, id);
      if (!tieneAcceso) {
        return NextResponse.json(
          { error: 'No tiene una asignación vigente que le permita ver este estudiante' },
          { status: 403 }
        );
      }
    }

    const estRes = await pool.query(
      `SELECT e.*, p.nombre as periodo_nombre
       FROM estudiantes e
       LEFT JOIN periodos p ON e.periodo_id = p.numero
       WHERE e.id = $1`,
      [id]
    );

    if (estRes.rows.length === 0) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    const estudiante = estRes.rows[0];

   const materiasRes = await pool.query(
    `
      SELECT
        m.id,
        m.nombre,
        m.codigo,
        im.id AS inscripcion_id,
        im.activa,
        im.tipo_inscripcion,
        im.tutoria_id,

        ia.id AS intento_id,
        ia.numero_intento,

        origen.periodo_id
          AS periodo_origen_tutoria,

        c.nota,
        c.resultado_cualitativo,

        (c.id IS NOT NULL)
          AS tiene_calificacion

      FROM inscripciones_materias im

      JOIN materias m
        ON m.id = im.materia_id

      JOIN intentos_academicos ia
        ON ia.id = im.intento_id

      LEFT JOIN tutorias_academicas t
        ON t.id = im.tutoria_id

      LEFT JOIN intentos_academicos origen
        ON origen.id = t.intento_origen_id

      LEFT JOIN calificaciones c
        ON c.inscripcion_id = im.id

      WHERE im.estudiante_id = $1::uuid
        AND ia.estado = 'en_curso'
        AND im.activa = true

      ORDER BY
        m.nombre,
        im.tipo_inscripcion,
        im.id
    `,
    [id]
  );

    // ✅ NUEVO: pagos, resumen financiero y cupo solo se consultan/devuelven
    // si el actor NO es docente. Un docente jamás debe ver info de pagos.
    let pagos: any[] = [];
    let resumen: any = null;
    let cupo_pendiente: any = null;

    if (actor.rol !== 'docente') {
      const pagosRes = await pool.query(
        `SELECT * FROM pagos WHERE estudiante_id = $1 ORDER BY created_at DESC`,
        [id]
      );
      pagos = pagosRes.rows;

    const resumenRes = await pool.query(
    `
      SELECT
        COALESCE(
          (
            SELECT SUM(p.monto)
            FROM pagos p
            WHERE p.estudiante_id = $1
              AND p.estado = 'confirmado'
          ),
          0
        ) AS total_pagado,

        COALESCE(
          (
            SELECT SUM(c.monto)
            FROM cuotas c
            WHERE c.estudiante_id = $1
              AND c.estado IN ('pendiente', 'vencida')
          ),
          0
        ) AS deuda_total,

        COUNT(*) FILTER (
          WHERE c.estado IN ('pendiente', 'vencida')
        ) AS cuotas_pendientes
      FROM cuotas c
      WHERE c.estudiante_id = $1
    `,
    [id]
  );
  resumen = resumenRes.rows[0];

      const cupoRes = await pool.query(
        `SELECT * FROM cupos WHERE estudiante_id = $1 AND estado = 'pendiente'`,
        [id]
      );
      cupo_pendiente = cupoRes.rows[0] || null;
    }

    return NextResponse.json({
      estudiante,
      materias: materiasRes.rows.map((materia) => ({
        ...materia,
        tipo_evaluacion: tipoEvaluacionMateria(materia.nombre),
      })),
      pagos,
      resumen,
      cupo_pendiente,
      // ✅ NUEVO: el frontend usa este flag para decidir si renderiza
      // pagos/acciones administrativas, sin tener que adivinar el rol.
      puede_editar: actor.rol !== 'docente',
    });

  } catch (error) {
    console.error('Error GET estudiante:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// PATCH - Actualizar estudiante
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ✅ NUEVO: bloqueo total de edición para docentes, sin excepción de campos.
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (actor.rol === 'docente') {
    return NextResponse.json({ error: 'No tiene permisos para editar estudiantes' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { nombres, apellidos, cedula, cedula_escolar, fecha_nacimiento, genero, email, activo, estado } = body;

    const result = await pool.query(
      `UPDATE estudiantes
       SET nombres = COALESCE($1, nombres),
           apellidos = COALESCE($2, apellidos),
           cedula = COALESCE($3, cedula),
           cedula_escolar = COALESCE($4, cedula_escolar),
           fecha_nacimiento = COALESCE($5, fecha_nacimiento),
           genero = COALESCE($6, genero),
           email = COALESCE($7, email),
           activo = COALESCE($8, activo),
           estado = COALESCE($9, estado),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [nombres, apellidos, cedula, cedula_escolar, fecha_nacimiento, genero, email, activo, estado, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('estudiantes','UPDATE',$1,$2)`,
      [actor.userId, JSON.stringify(result.rows[0])]
    );

    return NextResponse.json({ success: true, estudiante: result.rows[0] });

  } catch (error) {
    console.error('Error PATCH estudiante:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}


// DELETE - Eliminar definitivamente al estudiante
// y sus dependencias académicas y financieras.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = verifyToken(
    request.cookies.get('token')?.value ?? ''
  );

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (
    !['director', 'secretaria'].includes(actor.rol)
  ) {
    return NextResponse.json(
      {
        error:
          'No tiene permisos para eliminar estudiantes.',
      },
      { status: 403 }
    );
  }

  if (
    process.env.ALLOW_PERMANENT_STUDENT_DELETE !==
    'true'
  ) {
    return NextResponse.json(
      {
        error:
          'La eliminación definitiva no está habilitada en este entorno.',
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    return NextResponse.json(
      {
        error:
          'El identificador del estudiante no es válido.',
      },
      { status: 400 }
    );
  }

  let client: import('pg').PoolClient | undefined;
  let transaccionAbierta = false;

  try {
    client = await pool.connect();

    await client.query('BEGIN');
    transaccionAbierta = true;

    await client.query(
      "SET LOCAL lock_timeout = '5s'"
    );

    // Comprobar el estado y rol actual de la cuenta.
    const usuarioResult = await client.query(
      `
        SELECT id, rol
        FROM usuarios
        WHERE id = $1::uuid
          AND activo = true
        FOR SHARE
      `,
      [actor.userId]
    );

    const usuario = usuarioResult.rows[0];

    if (
      !usuario ||
      !['director', 'secretaria'].includes(
        usuario.rol
      )
    ) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;

      return NextResponse.json(
        {
          error:
            'La cuenta no está activa o ya no tiene permisos para eliminar estudiantes.',
        },
        { status: 403 }
      );
    }

    const estudianteResult = await client.query(
      `
        SELECT id
        FROM estudiantes
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      [id]
    );

    if (estudianteResult.rows.length !== 1) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;

      return NextResponse.json(
        {
          error: 'Estudiante no encontrado.',
        },
        { status: 404 }
      );
    }

    const eliminados: Record<string, number> = {};

    /*
     * Bloquear los intentos y las inscripciones del
     * estudiante antes de retirar sus dependencias.
     */
    await client.query(
      `
        SELECT id
        FROM intentos_academicos
        WHERE estudiante_id = $1::uuid
        ORDER BY id
        FOR UPDATE
      `,
      [id]
    );

    await client.query(
      `
        SELECT id
        FROM inscripciones_materias
        WHERE estudiante_id = $1::uuid
        ORDER BY id
        FOR UPDATE
      `,
      [id]
    );

    /*
     * 1. Evaluaciones.
     * Pueden referenciar una inscripción o una
     * calificación migrada.
     */
    const evaluacionesResult = await client.query(
      `
        DELETE FROM evaluaciones_academicas ea
        WHERE ea.inscripcion_id IN (
          SELECT im.id
          FROM inscripciones_materias im
          WHERE im.estudiante_id = $1::uuid
        )
        OR ea.calificacion_legacy_id IN (
          SELECT c.id
          FROM calificaciones c
          WHERE c.estudiante_id = $1::uuid
        )
      `,
      [id]
    );

    eliminados.evaluaciones_academicas =
      evaluacionesResult.rowCount ?? 0;

    // 2. Calificaciones vinculadas al estudiante.
    const calificacionesResult = await client.query(
      `
        DELETE FROM calificaciones
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.calificaciones =
      calificacionesResult.rowCount ?? 0;

    // 3. Historial académico.
    const historialResult = await client.query(
      `
        DELETE FROM historial_academico
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.historial_academico =
      historialResult.rowCount ?? 0;

    // 4. Cupos: referencian intentos de origen y destino.
    const cuposResult = await client.query(
      `
        DELETE FROM cupos
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.cupos =
      cuposResult.rowCount ?? 0;

    /*
     * 5. Romper el ciclo entre inscripciones y tutorías.
     * Solo se actualizan inscripciones del estudiante
     * que se está eliminando.
     */
    await client.query(
      `
        UPDATE inscripciones_materias
        SET tutoria_id = NULL
        WHERE estudiante_id = $1::uuid
          AND tutoria_id IS NOT NULL
      `,
      [id]
    );

    const tutoriasResult = await client.query(
      `
        DELETE FROM tutorias_academicas
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.tutorias_academicas =
      tutoriasResult.rowCount ?? 0;

    // 6. Inscripciones, ya sin sus dependencias.
    const inscripcionesResult = await client.query(
      `
        DELETE FROM inscripciones_materias
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.inscripciones_materias =
      inscripcionesResult.rowCount ?? 0;

    /*
     * 7. Vínculos de comprobantes con cuotas.
     * Deben borrarse antes de cuotas y pagos.
     */
    const vinculosResult = await client.query(
      `
        DELETE FROM pagos_cuotas
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.pagos_cuotas =
      vinculosResult.rowCount ?? 0;

    // 8. Cuotas antes de pagos.
    const cuotasResult = await client.query(
      `
        DELETE FROM cuotas
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.cuotas =
      cuotasResult.rowCount ?? 0;

    const pagosResult = await client.query(
      `
        DELETE FROM pagos
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.pagos =
      pagosResult.rowCount ?? 0;

    // 9. Intentos, sin dependencias académicas ni financieras.
    const intentosResult = await client.query(
      `
        DELETE FROM intentos_academicos
        WHERE estudiante_id = $1::uuid
      `,
      [id]
    );

    eliminados.intentos_academicos =
      intentosResult.rowCount ?? 0;

    // 10. Estudiante.
    const estudianteEliminado = await client.query(
      `
        DELETE FROM estudiantes
        WHERE id = $1::uuid
      `,
      [id]
    );

    eliminados.estudiantes =
      estudianteEliminado.rowCount ?? 0;

    /*
     * Se conserva la trazabilidad.
     * No se borran auditorías por coincidencias dentro
     * de un JSON, porque podrían contener operaciones
     * agrupadas con otros registros.
     */
    await client.query(
      `
        INSERT INTO auditoria (
          tabla_afectada,
          accion,
          usuario_id,
          datos_nuevos
        )
        VALUES (
          'estudiantes',
          'DELETE',
          $1,
          $2
        )
      `,
      [
        actor.userId,
        JSON.stringify({
          estudiante_id: id,
          eliminados,
          resumen:
            'Eliminación definitiva del estudiante y sus dependencias académicas y financieras.',
        }),
      ]
    );

    await client.query('COMMIT');
    transaccionAbierta = false;

    return NextResponse.json(
      {
        success: true,
        message:
          'Estudiante eliminado definitivamente.',
        eliminados,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: unknown) {
    if (client && transaccionAbierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Error revirtiendo eliminación del estudiante:',
          rollbackError
        );
      }
    }

    const codigo =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? String(error.code)
        : '';

    const restriccion =
      typeof error === 'object' &&
      error !== null &&
      'constraint' in error
        ? String(error.constraint)
        : '';

    console.error(
      'Error DELETE definitivo estudiante:',
      error
    );

    if (codigo === '23503') {
      return NextResponse.json(
        {
          error:
            'Existe una relación adicional que impide eliminar al estudiante. No se guardó ningún cambio.',
          restriccion,
        },
        { status: 409 }
      );
    }

    if (
      codigo === '55P03' ||
      codigo === '40P01'
    ) {
      return NextResponse.json(
        {
          error:
            'Otro proceso está utilizando los registros del estudiante. No se guardó la eliminación. Espere unos segundos antes de reintentar.',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          'No se pudo completar la eliminación. Revise la terminal del servidor.',
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}