import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(request: NextRequest) {
  const client = await pool.connect();
  try {
    // Verificar que solo se puede ejecutar en desarrollo o con una clave especial
    const headerAuth = request.headers.get('x-migration-key');
    if (headerAuth !== process.env.MIGRATION_KEY && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await client.query('BEGIN');

    // 1. Agregar columna fecha_inicio_periodo_actual si no existe
    await client.query(`
      ALTER TABLE estudiantes
      ADD COLUMN IF NOT EXISTS fecha_inicio_periodo_actual DATE DEFAULT CURRENT_DATE
    `);

    // 2. Inicializar para estudiantes existentes que no tengan el valor
    await client.query(`
      UPDATE estudiantes
      SET fecha_inicio_periodo_actual = COALESCE(fecha_inicio_periodo_actual, fecha_ingreso, created_at)
      WHERE fecha_inicio_periodo_actual IS NULL
    `);

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: 'Migración completada: campo fecha_inicio_periodo_actual agregado'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en migración:', error);
    return NextResponse.json({
      error: (error as Error).message,
      message: 'Error durante la migración'
    }, { status: 500 });
  } finally {
    client.release();
  }
}
