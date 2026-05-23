import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * 🧮 FUNCIÓN CENTRAL: Recalcula el estado REAL del estudiante
 * basado en: (meses activo × mensualidad) vs (total pagado confirmado)
 */
async function recalcularEstadoEstudiante(client: any, estudianteId: string) {
  // 1. Obtener configuración de mensualidad
  const configRes = await client.query(
    `SELECT valor FROM configuracion WHERE clave = 'monto_mensualidad'`
  );
  const montoMensual = parseFloat(configRes.rows[0]?.valor || '50');

  // 2. Obtener fecha de inicio del periodo actual (o la de ingreso como fallback)
  const estRes = await client.query(
    `SELECT fecha_inicio_periodo_actual, fecha_ingreso, created_at FROM estudiantes WHERE id = $1`,
    [estudianteId]
  );
  if (estRes.rows.length === 0) return null;

  // Usar fecha_inicio_periodo_actual si existe, sino fecha_ingreso
  const fechaInicio = new Date(estRes.rows[0].fecha_inicio_periodo_actual || estRes.rows[0].fecha_ingreso || estRes.rows[0].created_at);
  const hoy = new Date();

  // Calcular meses transcurridos (mínimo 1 para cubrir el mes actual)
  const diffMs = hoy.getTime() - fechaInicio.getTime();
  const mesesTranscurridos = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30)));

  // Total que debería haber pagado
  const totalEsperado = mesesTranscurridos * montoMensual;

  // 3. Sumar SOLO pagos confirmados
  const pagosRes = await client.query(
    `SELECT COALESCE(SUM(monto), 0) as total FROM pagos
     WHERE estudiante_id = $1 AND estado = 'confirmado'`,
    [estudianteId]
  );
  const totalPagado = parseFloat(pagosRes.rows[0].total);

  // 4. Lógica de estado basada en matemática, no en suposiciones
  let nuevoEstado: string;

  if (totalPagado <= 0) {
    // Nunca ha pagado nada confirmado
    nuevoEstado = 'verificacion';
  } else if (totalPagado >= totalEsperado) {
    // Está al día o adelantado
    nuevoEstado = 'activo';
  } else {
    // Ha pagado algo, pero le falta
    nuevoEstado = 'deuda';
  }

  // 5. Guardar el estado calculado
  await client.query(
    `UPDATE estudiantes SET estado = $1 WHERE id = $2`,
    [nuevoEstado, estudianteId]
  );

  return {
    estado: nuevoEstado,
    total_esperado: totalEsperado,
    total_pagado: totalPagado,
    deuda: Math.max(0, totalEsperado - totalPagado),
    meses_transcurridos: mesesTranscurridos
  };
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { estado } = await request.json(); // 'confirmado' o 'rechazado'
    const pagoId = params.id;

    if (!['confirmado', 'rechazado'].includes(estado)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Estado inválido. Use: confirmado o rechazado' }, { status: 400 });
    }

    // Actualizar el pago
    const pagoRes = await client.query(
      `UPDATE pagos SET estado = $1 WHERE id = $2 RETURNING *`,
      [estado, pagoId]
    );

    if (pagoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    const pago = pagoRes.rows[0];

    // Si se confirma, marcar cuota como pagada si existe
    if (estado === 'confirmado') {
      await client.query(
        `UPDATE cuotas SET estado = 'pagada', pago_id = $1 
         WHERE estudiante_id = $2 AND concepto = $3 AND estado = 'pendiente'`,
        [pago.id, pago.estudiante_id, pago.concepto]
      );
    }

    // ✅ ESTO ES LO CRÍTICO: Recalcular estado basado en la realidad financiera
    const resultado = await recalcularEstadoEstudiante(client, pago.estudiante_id);

    await client.query('COMMIT');

    return NextResponse.json({ 
      success: true, 
      pago: pagoRes.rows[0],
      estado_actualizado: resultado 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error PATCH pago:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}