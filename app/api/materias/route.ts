import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT *
      FROM materias
      WHERE activa = true
      ORDER BY nombre
    `);

    return NextResponse.json({
      materias: result.rows,
    });
  } catch (error) {
    console.error('Error al cargar materias:', error);

    return NextResponse.json(
      { error: 'Error al cargar materias' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        'La creación de materias está deshabilitada. El sistema utiliza el catálogo previamente registrado.',
    },
    { status: 405 }
  );
}