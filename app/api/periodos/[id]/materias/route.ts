import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const periodoId = parseInt(params.id);

    if (isNaN(periodoId) || periodoId < 1 || periodoId > 6) {
      return NextResponse.json(
        { error: 'ID de período inválido (debe ser 1-6)' },
        { status: 400 }
      );
    }

    // Obtener información del período
    const periodoResult = await pool.query(
      `SELECT numero as id, nombre, descripcion FROM periodos WHERE numero = $1`,
      [periodoId]
    );

    if (periodoResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Período no encontrado' },
        { status: 404 }
      );
    }

    const periodo = periodoResult.rows[0];

    // Obtener materias obligatorias y complementarias
    const materiasResult = await pool.query(
      `SELECT
        m.id,
        m.codigo,
        m.nombre,
        m.descripcion,
        pm.es_obligatoria,
        pm.orden
      FROM periodo_materia pm
      JOIN materias m ON pm.materia_id = m.id
      WHERE pm.periodo_id = $1 AND m.activa = true
      ORDER BY pm.es_obligatoria DESC, pm.orden`,
      [periodoId]
    );

    // Separar obligatorias y complementarias
    const obligatorias = materiasResult.rows.filter(m => m.es_obligatoria);
    const complementarias = materiasResult.rows.filter(m => !m.es_obligatoria);

    return NextResponse.json({
      periodo,
      obligatorias,
      complementarias,
      total: materiasResult.rows.length,
      resumen: {
        obligatorias: obligatorias.length,
        complementarias: complementarias.length
      }
    });
  } catch (error) {
    console.error('Error GET periodos/[id]/materias:', error);
    return NextResponse.json(
      { error: 'Error al cargar materias del período: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
