import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT * FROM materias WHERE activa = true ORDER BY nombre
    `);
    return NextResponse.json({ materias: result.rows });
  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar materias' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const body = await request.json();
    const { codigo, nombre, descripcion, grados } = body;

    if (!codigo || !nombre || !grados || grados.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Código, nombre y al menos un grado son obligatorios' }, { status: 400 });
    }

    // 1. Crear materia
    const result = await client.query(
      `INSERT INTO materias (codigo, nombre, descripcion, grados_aplicables)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [codigo, nombre, descripcion, grados.join(', ')]
    );
    const materiaId = result.rows[0].id;

    // 2. Insertar relación en materia_grado (para que funcione la inscripción automática)
    for (const grado of grados) {
      await client.query(
        `INSERT INTO materia_grado (materia_id, grado) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [materiaId, grado]
      );
    }

    await client.query('COMMIT');

    // 3. Auditoría con datos legibles
    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('materias','INSERT','sistema',$1)`,
      [JSON.stringify({
        ...result.rows[0],
        grados_asignados: grados,
        resumen: `Materia ${nombre} (${codigo}) creada para ${grados.length} grado(s)`
      })]
    );

    return NextResponse.json({ materia: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error POST materias:', error);
    return NextResponse.json({ error: 'Error al crear materia: ' + (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}