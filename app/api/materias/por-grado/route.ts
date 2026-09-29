import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/materias/por-grado?grado=1er Año
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const grado = searchParams.get('grado');

    if (!grado) {
      return NextResponse.json(
        { error: 'El parámetro grado es requerido' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `SELECT m.id, m.codigo, m.nombre, m.descripcion, m.nivel
       FROM materia_grado mg
       JOIN materias m ON mg.materia_id = m.id
       WHERE mg.grado = $1 AND m.activa = true
       ORDER BY m.nombre`,
      [grado]
    );

    return NextResponse.json({
      grado,
      materias: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Error al cargar materias del grado: ' + (error as Error).message },
      { status: 500 }
    );
  }
}