import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Misma función de recálculo (puedes crear un archivo compartido luego)
async function recalcularEstadoEstudiante(client: any, estudianteId: string) {
  const configRes = await client.query(
    `SELECT valor FROM configuracion WHERE clave = 'monto_mensualidad'`
  );
  const montoMensual = parseFloat(configRes.rows[0]?.valor || '50');

  const estRes = await client.query(
    `SELECT fecha_inicio_periodo_actual, fecha_ingreso, created_at FROM estudiantes WHERE id = $1`,
    [estudianteId]
  );
  if (estRes.rows.length === 0) return null;

  // Usar fecha_inicio_periodo_actual si existe, sino fecha_ingreso
  const fechaInicio = new Date(estRes.rows[0].fecha_inicio_periodo_actual || estRes.rows[0].fecha_ingreso || estRes.rows[0].created_at);
  const hoy = new Date();
  const diffMs = hoy.getTime() - fechaInicio.getTime();
  const mesesTranscurridos = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30)));
  const totalEsperado = mesesTranscurridos * montoMensual;

  const pagosRes = await client.query(
    `SELECT COALESCE(SUM(monto), 0) as total FROM pagos
     WHERE estudiante_id = $1 AND estado = 'confirmado'`,
    [estudianteId]
  );
  const totalPagado = parseFloat(pagosRes.rows[0].total);

  let nuevoEstado = 'verificacion';
  if (totalPagado <= 0) nuevoEstado = 'verificacion';
  else if (totalPagado >= totalEsperado) nuevoEstado = 'activo';
  else nuevoEstado = 'deuda';

  await client.query(`UPDATE estudiantes SET estado = $1 WHERE id = $2`, [nuevoEstado, estudianteId]);

  return { estado: nuevoEstado, deuda: Math.max(0, totalEsperado - totalPagado) };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const busqueda = searchParams.get('q');

    let query = `
      SELECT 
        e.id, e.nombres, e.apellidos, e.cedula, e.periodo_id, e.estado, e.created_at,
        p.nombre as periodo_nombre,
        COALESCE((
          SELECT SUM(monto) FROM pagos 
          WHERE estudiante_id = e.id AND estado = 'confirmado'
        ), 0) as total_pagado,
        COALESCE((
          SELECT COUNT(*) FROM pagos 
          WHERE estudiante_id = e.id AND tipo = 'mensualidad' AND estado = 'confirmado'
        ), 0) as mensualidades_pagadas,
        COALESCE((
          SELECT COUNT(*) FROM pagos 
          WHERE estudiante_id = e.id AND estado = 'verificacion'
        ), 0) as pagos_por_verificar,
        (
          SELECT json_build_object(
            'id', pg.id, 'concepto', pg.concepto, 'monto', pg.monto,
            'estado', pg.estado, 'fecha_pago', pg.fecha_pago
          )
          FROM pagos pg WHERE pg.estudiante_id = e.id 
          ORDER BY pg.created_at DESC LIMIT 1
        ) as ultimo_pago
      FROM estudiantes e
      LEFT JOIN periodos p ON e.periodo_id = p.numero
      WHERE 1=1
    `;

    const params: any[] = [];
    let i = 1;

    if (estado) { query += ` AND e.estado = $${i++}`; params.push(estado); }
    if (busqueda) {
      query += ` AND (e.nombres ILIKE $${i} OR e.apellidos ILIKE $${i} OR e.cedula ILIKE $${i})`;
      params.push(`%${busqueda}%`); i++;
    }

    query += ` ORDER BY e.created_at DESC`;

    const result = await pool.query(query, params);
    return NextResponse.json({ estudiantes: result.rows });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const body = await request.json();
    const { estudiante_id, tipo, concepto, monto, metodo_pago, referencia, fecha_pago } = body;

    if (!estudiante_id || !monto || !metodo_pago || !concepto) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    const result = await client.query(
      `INSERT INTO pagos (estudiante_id, tipo, concepto, monto, metodo_pago, referencia, fecha_pago, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'verificacion') RETURNING *`,
      [estudiante_id, tipo || 'mensualidad', concepto, monto, metodo_pago, referencia || null, fecha_pago || new Date()]
    );

    // Recalcular estado (aunque el pago esté en verificación, si ya tenía deuda, sigue en deuda)
    await recalcularEstadoEstudiante(client, estudiante_id);

    await client.query('COMMIT');

    // Auditoría
    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('pagos','INSERT','sistema',$1)`,
      [JSON.stringify(result.rows[0])]
    );

    return NextResponse.json({ success: true, pago: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}