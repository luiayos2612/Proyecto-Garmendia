import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const asignacionId = params.id;

    const asigRes = await pool.query(
      `SELECT
        a.docente_id,
        a.materia_id,
        a.periodo_id,
        d.apellidos || ' ' || d.nombres as docente_nombre,
        m.nombre as materia_nombre,
        m.codigo as materia_codigo
      FROM asignaciones_docentes a
      JOIN docentes d ON a.docente_id = d.id
      JOIN materias m ON a.materia_id = m.id
      WHERE a.id = $1`,
      [asignacionId]
    );

    if (asigRes.rows.length === 0) {
      return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 });
    }

    const asignacion = asigRes.rows[0];

    // ✅ NUEVO: si es docente, esta asignación debe ser la suya
    if (actor.rol === 'docente' && asignacion.docente_id !== actor.docenteId) {
      return NextResponse.json(
        { error: 'No tiene permiso para ver los estudiantes de esta asignación' },
        { status: 403 }
      );
    }

    const estudiantesRes = await pool.query(
      `SELECT
        e.id,
        e.apellidos,
        e.nombres,
        e.cedula,
        c.nota as nota_existente,
        c.observaciones as observaciones_existentes,
        c.id as calificacion_id
      FROM inscripciones_materias im
      JOIN estudiantes e ON im.estudiante_id = e.id
      LEFT JOIN calificaciones c
        ON c.estudiante_id = e.id
        AND c.materia_id = $1
        AND c.asignacion_id = $2
      WHERE im.materia_id = $1
        AND im.periodo_id = $3
        AND im.activa = true
      ORDER BY e.apellidos, e.nombres`,
      [asignacion.materia_id, asignacionId, asignacion.periodo_id]
    );

    return NextResponse.json({
      asignacion,
      estudiantes: estudiantesRes.rows,
      total: estudiantesRes.rows.length,
    });
  } catch (error) {
    console.error('Error GET asignaciones/[id]/estudiantes:', error);
    return NextResponse.json(
      { error: 'Error al cargar estudiantes de la asignación' },
      { status: 500 }
    );
  }
}