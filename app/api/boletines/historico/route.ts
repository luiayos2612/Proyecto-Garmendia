import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST /api/boletines/historico
// Body: { estudiante_id, periodo_id, materia_id, nota, ano_escolar, estado_materia? }
export async function POST(request: NextRequest) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const { estudiante_id, periodo_id, materia_id, nota, ano_escolar, estado_materia } = body;

    if (!estudiante_id || !periodo_id || !materia_id || nota === undefined || !ano_escolar) {
      return NextResponse.json(
        { error: 'Faltan datos obligatorios: estudiante_id, periodo_id, materia_id, nota, ano_escolar' },
        { status: 400 }
      );
    }

    const notaNum = parseFloat(nota);
    if (isNaN(notaNum) || notaNum < 0 || notaNum > 20) {
      return NextResponse.json({ error: 'Nota inválida (0-20)' }, { status: 400 });
    }

    const estado = estado_materia || (notaNum >= 10 ? 'aprobada' : 'reprobada');

    await client.query('BEGIN');

    // Verificar si ya existe (tu BD tiene UNIQUE en estudiante_id+periodo_id+materia_id+ano_escolar tras el fix)
    const existing = await client.query(
      `SELECT id FROM historial_academico 
       WHERE estudiante_id = $1 AND periodo_id = $2 AND materia_id = $3 AND ano_escolar = $4`,
      [estudiante_id, periodo_id, materia_id, ano_escolar]
    );

    let result;
    if (existing.rows.length > 0) {
      // Actualizar
      result = await client.query(
        `UPDATE historial_academico 
         SET nota = $1, promedio = $1, estado_materia = $2, created_at = CURRENT_TIMESTAMP
         WHERE id = $3 RETURNING *`,
        [notaNum, estado, existing.rows[0].id]
      );
    } else {
      // Insertar nuevo
      result = await client.query(
        `INSERT INTO historial_academico 
          (id, estudiante_id, periodo_id, materia_id, nota, promedio, estado_materia, ano_escolar, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $4, $5, $6, CURRENT_TIMESTAMP)
         RETURNING *`,
        [estudiante_id, periodo_id, materia_id, notaNum, estado, ano_escolar]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({ 
      success: true, 
      historico: result.rows[0],
      accion: existing.rows.length > 0 ? 'actualizado' : 'creado'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error POST historico:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// GET /api/boletines/historico?estudiante_id=xxx&periodo_id=1&ano_escolar=2023-2024
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const estudianteId = searchParams.get('estudiante_id');
    const periodoId = searchParams.get('periodo_id');
    const anoEscolar = searchParams.get('ano_escolar');

    if (!estudianteId) {
      return NextResponse.json({ error: 'estudiante_id requerido' }, { status: 400 });
    }

    const result = await pool.query(
      `SELECT h.*, m.nombre as materia_nombre, m.codigo
       FROM historial_academico h
       JOIN materias m ON m.id = h.materia_id
       WHERE h.estudiante_id = $1
         AND ($2::int IS NULL OR h.periodo_id = $2::int)
         AND ($3 IS NULL OR h.ano_escolar = $3)
       ORDER BY h.periodo_id, m.nombre`,
      [estudianteId, periodoId, anoEscolar]
    );

    return NextResponse.json({ 
      historico: result.rows,
      total: result.rows.length 
    });

  } catch (error) {
    console.error('Error GET historico:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}