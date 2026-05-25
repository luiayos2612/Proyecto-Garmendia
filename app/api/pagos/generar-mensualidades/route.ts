import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Genera automáticamente la mensualidad del mes actual para todos los estudiantes
 * que tienen inscripción confirmada en el período actual.
 *
 * Se debe llamar una vez al mes (idealmente el 1er día del mes)
 * via cron job externo o manualmente desde admin panel
 */
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
    const estudiantesRes = await client.query(
      `SELECT e.id, e.periodo_id, p.numero
       FROM estudiantes e
       JOIN periodos p ON p.numero = e.periodo_id
       WHERE e.estado IN ('activo', 'verificacion', 'deuda')
       AND e.fecha_inicio_periodo_actual IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pagos
         WHERE estudiante_id = e.id
         AND tipo = 'mensualidad'
         AND EXTRACT(MONTH FROM fecha_pago::date) = $1
         AND EXTRACT(YEAR FROM fecha_pago::date) = $2
       )`
      ,
      [mesActual, anoActual]
    );

    let generadas = 0;

    // 4. Generar mensualidad del mes actual para cada estudiante
    for (const est of estudiantesRes.rows) {
      // Calcular fecha de vencimiento: día 30 del mes actual o próximo
      const fechaVenc = new Date(anoActual, hoy.getMonth() + 1, 30);

      await client.query(
        `INSERT INTO pagos (estudiante_id, tipo, concepto, monto, metodo_pago, estado, fecha_pago)
         VALUES ($1, 'mensualidad', 'Mensualidad Periodo ' || $2 || ' - Mes ' || $3 || '/' || $4, $5, 'Pendiente', 'verificacion', $6)
         ON CONFLICT DO NOTHING`,
        [
          est.id,
          est.numero,
          mesActual,
          anoActual,
          montoMensual,
          fechaVenc.toISOString().split('T')[0]
        ]
      );

      generadas++;
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      mensaje: `${generadas} mensualidades generadas para el mes ${mesActual}/${anoActual}`,
      fecha_ejecucion: new Date().toISOString(),
      mes_procesado: mesActual,
      ano_procesado: anoActual
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
