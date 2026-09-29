import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT numero as id, nombre, descripcion, activo
      FROM periodos
      ORDER BY numero
    `);
    return NextResponse.json({
      periodos: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error GET periodos:', error);
    return NextResponse.json(
      { error: 'Error al cargar periodos: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { numero, nombre, descripcion } = body;

    if (!numero || !nombre) {
      return NextResponse.json(
        { error: 'Número y nombre son obligatorios' },
        { status: 400 }
      );
    }

    if (numero < 1 || numero > 6) {
      return NextResponse.json(
        { error: 'El número debe estar entre 1 y 6' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO periodos (numero, nombre, descripcion)
       VALUES ($1, $2, $3)
       ON CONFLICT (numero) DO UPDATE SET
       nombre = $2, descripcion = $3
       RETURNING *`,
      [numero, nombre, descripcion || null]
    );

    return NextResponse.json({ periodo: result.rows[0] });
  } catch (error) {
    console.error('Error POST periodos:', error);
    return NextResponse.json(
      { error: 'Error al crear periodo: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
