import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tabla = searchParams.get('tabla');
    const accion = searchParams.get('accion');
    const limit = searchParams.get('limit') || '50';

    // Query sin JOIN (evitar error de tipos)
    let query = `
      SELECT 
        a.id,
        a.tabla_afectada,
        a.accion,
        a.usuario_id,
        a.datos_nuevos,
        a.fecha_hora,
        COALESCE(a.usuario_id, 'Sistema') AS usuario_email
      FROM auditoria a
      WHERE 1=1
    `;

    const params: any[] = [];
    let i = 1;

    if (tabla)  { query += ` AND a.tabla_afectada = $${i++}`; params.push(tabla); }
    if (accion) { query += ` AND a.accion = $${i++}`; params.push(accion); }

    query += ` ORDER BY a.fecha_hora DESC LIMIT $${i++}`;
    params.push(parseInt(limit));

    // Stats generales
    const statsQuery = `
      SELECT tabla_afectada, COUNT(*) as total, accion
      FROM auditoria
      GROUP BY tabla_afectada, accion
      ORDER BY tabla_afectada
    `;

    const [result, stats] = await Promise.all([
      pool.query(query, params),
      pool.query(statsQuery)
    ]);

    return NextResponse.json({
      registros: result.rows,
      stats: stats.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error GET auditoria:', error);
    return NextResponse.json({ 
      error: 'Error al cargar auditoría',
      details: (error as Error).message 
    }, { status: 500 });
  }
}