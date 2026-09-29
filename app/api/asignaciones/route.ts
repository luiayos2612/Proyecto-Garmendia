import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ROLES_QUE_PUEDEN_CREAR = ['director', 'secretaria'];

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (actor.rol === 'docente' && !actor.docenteId) {
    return NextResponse.json({ error: 'Perfil de docente no vinculado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodoId = searchParams.get('periodo_id');
    if (periodoId && isNaN(parseInt(periodoId))) {
      return NextResponse.json(
        { error: 'periodo_id debe ser un número entre 1 y 6' },
        { status: 400 }
      );
    }

    const docenteId = actor.rol === 'docente' ? actor.docenteId : searchParams.get('docente_id');

    let query = `
      SELECT
        a.id,
        a.periodo_id,
        p.nombre as periodo_nombre,
        a.ano_escolar,
        a.docente_id,
        a.materia_id,
        d.apellidos || ' ' || d.nombres AS docente,
        m.nombre AS materia,
        m.nombre AS materia_nombre,
        m.codigo,
        m.codigo AS materia_codigo
      FROM asignaciones_docentes a
      JOIN periodos p ON a.periodo_id = p.numero
      JOIN docentes d ON a.docente_id = d.id
      JOIN materias m ON a.materia_id = m.id
      WHERE a.activa = true
    `;

    const values: Array<string | number> = [];

    if (periodoId) {
      values.push(parseInt(periodoId));
      query += ` AND a.periodo_id = $${values.length}`;
    }

    if (docenteId) {
      values.push(docenteId);
      query += ` AND a.docente_id = $${values.length}`;
    }

    query += ` ORDER BY a.periodo_id, m.nombre`;

    const result = await pool.query(query, values);

    return NextResponse.json({ asignaciones: result.rows });
  } catch (error) {
    console.error('Error GET asignaciones:', error);
    return NextResponse.json(
      { error: 'Error al cargar asignaciones', detalle: error },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!ROLES_QUE_PUEDEN_CREAR.includes(actor.rol)) {
    return NextResponse.json({ error: 'No tiene permisos para crear asignaciones' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { docente_id, materia_id, periodo_id } = body;

    if (!docente_id || !materia_id || !periodo_id) {
      return NextResponse.json(
        { error: 'Faltan datos obligatorios: docente_id, materia_id, periodo_id' },
        { status: 400 }
      );
    }

    if (periodo_id < 1 || periodo_id > 6) {
      return NextResponse.json({ error: 'Periodo debe estar entre 1 y 6' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO asignaciones_docentes (docente_id, materia_id, periodo_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [docente_id, materia_id, periodo_id]
    );

    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ($1, $2, $3, $4)`,
      ['asignaciones_docentes', 'INSERT', actor.userId, JSON.stringify({ docente_id, materia_id, periodo_id, timestamp: new Date() })]
    );

    return NextResponse.json({ asignacion: result.rows[0] });
  } catch (error) {
    console.error('Error POST asignaciones:', error);
    return NextResponse.json({ error: 'Error al asignar', detalle: error }, { status: 500 });
  }
}