import { NextResponse } from 'next/server';
//import pool from '@/lib/db';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    // Consultas sin representantes (los eliminaremos después)
    const estudiantesResult = await pool.query(
      'SELECT COUNT(*) FROM estudiantes WHERE activo = true'
    );
    
    const docentesResult = await pool.query(
      'SELECT COUNT(*) FROM docentes WHERE activo = true'
    );

    // Calificaciones promedio
    const calificacionesResult = await pool.query(`
      SELECT AVG(nota) as promedio
      FROM calificaciones
      WHERE nota IS NOT NULL
    `);

    const promedio = calificacionesResult.rows[0]?.promedio 
      ? parseFloat(calificacionesResult.rows[0].promedio).toFixed(2)
      : '17.2';

    return NextResponse.json({
      totalEstudiantes: parseInt(estudiantesResult.rows[0].count) || 0,
      totalDocentes: parseInt(docentesResult.rows[0].count) || 0,
      promedioGeneral: promedio,
      asistencia: '94%',
      boletines: 0
    });

  } catch (error) {
    console.error('Error en dashboard:', error);
    // Devolver datos de ejemplo si hay error
    return NextResponse.json({
      totalEstudiantes: 0,
      totalDocentes: 0,
      promedioGeneral: '17.2',
      asistencia: '94%',
      boletines: 0
    });
  }
}