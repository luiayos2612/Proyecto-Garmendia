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

// DELETE - Eliminar definitivamente al estudiante y sus datos relacionados
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  // Lista explícita de roles administrativos autorizados.
  if (!['director', 'secretaria'].includes(actor.rol)) {
    return NextResponse.json(
      { error: 'No tiene permisos para eliminar estudiantes.' },
      { status: 403 }
    );
  }

  if (process.env.ALLOW_PERMANENT_STUDENT_DELETE !== 'true') {
    return NextResponse.json(
      {
        error:
          'La eliminación definitiva no está habilitada en este entorno.',
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  const esUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id
    );

  if (!esUuid) {
    return NextResponse.json(
      { error: 'El identificador del estudiante no es válido.' },
      { status: 400 }
    );
  }

  let client: import('pg').PoolClient | undefined;
  let transaccionAbierta = false;

  try {
    client = await pool.connect();

    await client.query('BEGIN');
    transaccionAbierta = true;

    const estudianteResult = await client.query(
      `
        SELECT id
        FROM estudiantes
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (estudianteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;

      return NextResponse.json(
        { error: 'Estudiante no encontrado.' },
        { status: 404 }
      );
    }

    const identificadoresEliminados = new Set<string>([id]);
    const eliminados: Record<string, number> = {};

    // Lista fija: los nombres de tabla no provienen del navegador.
    // Las cuotas se eliminan antes que los pagos porque pueden referenciarlos.
    const tablasRelacionadas = [
      'calificaciones',
      'historial_academico',
      'inscripciones_materias',
      'cupos',
      'cuotas',
      'pagos',
    ] as const;

    for (const tabla of tablasRelacionadas) {
      const resultado = await client.query<{ id: string }>(
        `
          DELETE FROM ${tabla}
          WHERE estudiante_id = $1
          RETURNING id
        `,
        [id]
      );

      eliminados[tabla] = resultado.rowCount ?? 0;

      for (const fila of resultado.rows) {
        identificadoresEliminados.add(String(fila.id));
      }
    }

    const estudianteEliminado = await client.query(
      `
        DELETE FROM estudiantes
        WHERE id = $1
        RETURNING id
      `,
      [id]
    );

    eliminados.estudiantes = estudianteEliminado.rowCount ?? 0;

    // Contempla JSON anidados, como { estudiante: { id: ... } },
    // y auditorías de los pagos u otros registros eliminados.
    const auditoriaResult = await client.query(
      `
        DELETE FROM auditoria AS a
        WHERE EXISTS (
          SELECT 1
          FROM unnest($1::text[]) AS objetivo(identificador)
          WHERE strpos(
            COALESCE(a.datos_nuevos::text, ''),
            objetivo.identificador
          ) > 0
        )
      `,
      [Array.from(identificadoresEliminados)]
    );

    eliminados.auditoria = auditoriaResult.rowCount ?? 0;

    await client.query('COMMIT');
    transaccionAbierta = false;

    return NextResponse.json(
      {
        success: true,
        message: 'Estudiante eliminado definitivamente.',
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

    console.error('Error DELETE definitivo estudiante:', error);

    if (codigo === '23503') {
      return NextResponse.json(
        {
          error:
            'Existe otra relación de datos que impide eliminar al estudiante. ' +
            'Se canceló la operación completa. Revise la restricción indicada ' +
            'en la terminal antes de agregar otra eliminación.',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          'No se pudo completar la eliminación. ' +
          'Revise la terminal del servidor para identificar la causa.',
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}