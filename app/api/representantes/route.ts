import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// GET - Listar representantes con sus estudiantes asignados
export async function GET() {
  try {
    const repResult = await pool.query(`
      SELECT r.* 
      FROM representantes r
      ORDER BY r.nombre_completo
    `);
    
    const representantes = repResult.rows;
    
    for (const rep of representantes) {
      const estResult = await pool.query(`
        SELECT id, nombres, apellidos, grado, seccion, cedula_escolar
        FROM estudiantes 
        WHERE representante_id = $1 AND activo = true
        ORDER BY apellidos, nombres
      `, [rep.id]);
      
      rep.estudiantes = estResult.rows;
    }
    
    return NextResponse.json({ representantes });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error al cargar representantes' }, { status: 500 });
  }
}

// POST - Crear nuevo representante (maneja duplicados)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nombre_completo, cedula, telefono, email, direccion } = body;

    if (!nombre_completo || !cedula) {
      return NextResponse.json(
        { error: 'Nombre y cédula son obligatorios' },
        { status: 400 }
      );
    }

    // Verificar si ya existe la cédula
    const existing = await pool.query(
      'SELECT id, nombre_completo, cedula, telefono, email, direccion FROM representantes WHERE cedula = $1',
      [cedula]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({ 
        success: true,
        representante: existing.rows[0],
        existente: true,
        message: 'Representante ya existe'
      });
    }

    // Crear nuevo
    const result = await pool.query(
      `INSERT INTO representantes (nombre_completo, cedula, telefono, email, direccion)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nombre_completo, cedula, telefono, email, direccion]
    );

    return NextResponse.json({ 
      success: true,
      representante: result.rows[0],
      existente: false,
      message: 'Representante creado exitosamente'
    });

  } catch (error: any) {
    console.error('Error:', error);
    
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un representante con esa cédula' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: 'Error al crear representante' },
      { status: 500 }
    );
  }
}