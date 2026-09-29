import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as tiempo, current_database() as base_datos');
    const usuarios = await client.query('SELECT count(*) as total FROM usuarios');
    client.release();
    
    return NextResponse.json({
      status: '✅ Conectado exitosamente',
      tiempo: result.rows[0].tiempo,
      base_datos: result.rows[0].base_datos,
      usuarios_registrados: usuarios.rows[0].total,
      mensaje: 'PostgreSQL funciona correctamente en tu Mac'
    });
  } catch (error) {
    return NextResponse.json({
      status: '❌ Error',
      error: error instanceof Error ? error.message : 'Desconocido',
      solucion: 'Verifica que PostgreSQL esté corriendo en pgAdmin y la contraseña en .env.local'
    }, { status: 500 });
  }
}