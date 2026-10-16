import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    const estudiantesResult = await pool.query(`
      SELECT COUNT(*) AS total
      FROM estudiantes
      WHERE activo = true
    `);

    const docentesResult = await pool.query(`
      SELECT COUNT(*) AS total
      FROM docentes
      WHERE activo = true
    `);

    const calificacionesResult = await pool.query(`
      SELECT AVG(nota) AS promedio
      FROM calificaciones
      WHERE nota IS NOT NULL
    `);

    const promedioDb = calificacionesResult.rows[0]?.promedio;

    return NextResponse.json({
      totalEstudiantes: Number(estudiantesResult.rows[0]?.total ?? 0),
      totalDocentes: Number(docentesResult.rows[0]?.total ?? 0),
      promedioGeneral: promedioDb
        ? Number(parseFloat(promedioDb).toFixed(2))
        : 0,
    });
  } catch (error) {
    console.error('Error en dashboard:', error);

    return NextResponse.json(
      {
        totalEstudiantes: 0,
        totalDocentes: 0,
        promedioGeneral: 0,
      },
      { status: 500 }
    );
  }
}