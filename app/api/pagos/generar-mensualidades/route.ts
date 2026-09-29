import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });


export async function POST(request: NextRequest) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener configuración
    const configRes = await client.query(
      `SELECT clave, valor FROM configuracion WHERE clave = 'monto_mensualidad'`
    );
    const montoMensual = parseFloat(configRes.rows[0]?.valor || '50');

    // 2. Obtener mes y año actual
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1; // 1-12
    const anoActual = hoy.getFullYear();

    // 3. Encontrar estudiantes con inscripción confirmada en período actual
    // QUE TENGAN MENOS DE 6 MENSUALIDADES (aún están en el semestre)
    const estudiantesRes = await client.query(
      `SELECT e.id, e.periodo_id, p.numero, COUNT(pm.id) as mensualidades_pagadas
      FROM estudiantes e
      JOIN periodos p ON p.numero = e.periodo_id
      LEFT JOIN pagos pm ON pm.estudiante_id = e.id
        AND pm.tipo = 'mensualidad'
        AND pm.periodo_id = e.periodo_id
      WHERE e.estado IN ('activo', 'verificacion', 'deuda')
        AND e.fecha_inicio_periodo_actual IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pagos pi
          WHERE pi.estudiante_id = e.id
            AND pi.tipo = 'inscripcion'
            AND pi.periodo_id = e.periodo_id
            AND pi.estado = 'confirmado'
        )
        AND NOT EXISTS (
          SELECT 1 FROM pagos
          WHERE estudiante_id = e.id
            AND tipo = 'mensualidad'
            AND EXTRACT(MONTH FROM fecha_pago::date) = $1
            AND EXTRACT(YEAR FROM fecha_pago::date) = $2
        )
      GROUP BY e.id, p.numero
      HAVING COUNT(pm.id) < 6`,         
      [mesActual, anoActual]
    );

    let generadas = 0;

    // 4. Generar mensualidad del mes actual para cada estudiante
    // (solo si aún no ha completado las 6 mensualidades del semestre)
    for (const est of estudiantesRes.rows) {
      // Calcular fecha de vencimiento: día 30 del mes actual
      const fechaVenc = new Date(anoActual, hoy.getMonth() + 1, 30);

      // Número de mensualidad (1-6)
      const numMensualidad = (est.mensualidades_pagadas || 0) + 1;

      await client.query(
        `INSERT INTO pagos (estudiante_id, tipo, concepto, monto, metodo_pago, estado, fecha_pago, periodo_id)
         VALUES ($1, 'mensualidad', 'Mensualidad Periodo ' || $2 || ' - Mes ' || $3 || '/' || $4, $5, 'Pendiente', 'verificacion', $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          est.id,
          est.numero,
          numMensualidad,
          anoActual,
          montoMensual,
          fechaVenc.toISOString().split('T')[0],
          est.periodo_id
        ]
      );

      generadas++;
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      mensaje: `${generadas} mensualidades generadas para el mes ${mesActual}/${anoActual} (SEMESTRAL: máx 6 mensualidades por período)`,
      fecha_ejecucion: new Date().toISOString(),
      mes_procesado: mesActual,
      ano_procesado: anoActual,
      nota: 'El sistema solo genera mensualidades si: (1) Inscripción está confirmada, (2) Menos de 6 mensualidades completadas'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generando mensualidades:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function GET(request: NextRequest) {
  try {
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anoActual = hoy.getFullYear();

    const result = await pool.query(
      `SELECT COUNT(*) as mensualidades_pendientes
       FROM pagos
       WHERE tipo = 'mensualidad'
       AND EXTRACT(MONTH FROM fecha_pago::date) = $1
       AND EXTRACT(YEAR FROM fecha_pago::date) = $2
       AND estado = 'verificacion'`,
      [mesActual, anoActual]
    );

    return NextResponse.json({
      mes_actual: mesActual,
      ano_actual: anoActual,
      mensualidades_del_mes: parseInt(result.rows[0].mensualidades_pendientes || '0')
    });

  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
