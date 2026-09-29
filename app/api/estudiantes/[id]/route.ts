import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

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
      `SELECT
        m.id,
        m.nombre,
        m.codigo,
        im.activa,
        COALESCE(c.nota, 0) as nota,
        CASE WHEN c.id IS NOT NULL THEN true ELSE false END as tiene_calificacion
      FROM inscripciones_materias im
      JOIN materias m ON m.id = im.materia_id
      LEFT JOIN calificaciones c ON c.estudiante_id = im.estudiante_id
        AND c.materia_id = im.materia_id
        AND c.asignacion_id IN (
          SELECT id FROM asignaciones_docentes
          WHERE periodo_id = im.periodo_id AND materia_id = im.materia_id
        )
      WHERE im.estudiante_id = $1 AND im.periodo_id = $2
      ORDER BY m.nombre`,
      [id, estudiante.periodo_id]
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
        `SELECT
          COALESCE(SUM(monto), 0) as total_pagado,
          COUNT(*) FILTER (WHERE tipo = 'inscripcion' AND estado = 'confirmado') as inscripciones_pagadas,
          COUNT(*) FILTER (WHERE tipo = 'mensualidad' AND estado = 'confirmado') as mensualidades_pagadas,
          COUNT(*) FILTER (WHERE estado = 'verificacion') as pagos_pendientes
        FROM pagos WHERE estudiante_id = $1`,
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
      materias: materiasRes.rows,
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

// DELETE - Desactivar estudiante (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ✅ NUEVO: bloqueo total para docentes
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (actor.rol === 'docente') {
    return NextResponse.json({ error: 'No tiene permisos para desactivar estudiantes' }, { status: 403 });
  }

  try {
    const { id } = await params;

    const result = await pool.query(
      `UPDATE estudiantes SET activo = false, estado = 'verificacion' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('estudiantes','DELETE',$1,$2)`,
      [actor.userId, JSON.stringify(result.rows[0])]
    );

    return NextResponse.json({ success: true, message: 'Estudiante desactivado correctamente' });

  } catch (error) {
    console.error('Error DELETE estudiante:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}