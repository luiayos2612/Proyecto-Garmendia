import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const estudianteId = params.id;

    const [est, pagos, configRes] = await Promise.all([
      pool.query(`SELECT * FROM estudiantes WHERE id = $1`, [estudianteId]),
      pool.query(`SELECT * FROM pagos WHERE estudiante_id = $1 ORDER BY created_at DESC`, [estudianteId]),
      pool.query(`SELECT clave, valor FROM configuracion`)
    ]);

    if (est.rows.length === 0) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    const estudiante = est.rows[0];

    // Convertir configuración a objeto plano
    const config = configRes.rows.reduce((acc, row) => {
      acc[row.clave] = row.valor;
      return acc;
    }, {} as Record<string, string>);

    const montoMensual = parseFloat(config.monto_mensualidad || '50');
    const costoInscripcion = parseFloat(config.costo_inscripcion || '50');
    const costoSemestre = parseFloat(config.costo_semestre || (montoMensual * 6).toFixed(2));
    const totalSemestre = costoInscripcion + costoSemestre;

    // Usar fecha_inicio_periodo_actual si existe, sino fecha_ingreso
    const fechaInicio = new Date(estudiante.fecha_inicio_periodo_actual || estudiante.fecha_ingreso || estudiante.created_at);
    const hoy = new Date();

    // Diferencia de meses calendario desde la fecha de ingreso
    let mesesEsperados = (hoy.getFullYear() - fechaInicio.getFullYear()) * 12 
                       + (hoy.getMonth() - fechaInicio.getMonth());

    // El mes actual se contabiliza como obligatorio a partir del día 30
    if (hoy.getDate() >= 30) {
      mesesEsperados += 1;
    }

    // Limitar al semestre: máximo 6 mensualidades, mínimo 0
    mesesEsperados = Math.max(0, Math.min(6, mesesEsperados));

    // Contar mensualidades confirmadas
    const mensualidadesPagadas = pagos.rows.filter(
      (p: any) => p.estado === 'confirmado' && p.tipo === 'mensualidad'
    ).length;

    // Total pagado confirmado (todo concepto)
    const totalPagado = pagos.rows
      .filter((p: any) => p.estado === 'confirmado')
      .reduce((sum: number, p: any) => sum + parseFloat(p.monto), 0);

    // Deuda actual: solo la mensualidad del mes que corresponde ahora
    const deudaActual = mensualidadesPagadas >= mesesEsperados ? 0 : montoMensual;

    // Deuda total: lo que falta por pagar del semestre completo
    const deudaTotal = Math.max(0, totalSemestre - totalPagado);

    return NextResponse.json({
      estudiante,
      pagos: pagos.rows,
      resumen: {
        monto_mensual: montoMensual,
        meses_esperados: mesesEsperados,
        total_semestre: totalSemestre,
        total_pagado: totalPagado,
        deuda_actual: deudaActual,
        deuda_total: deudaTotal,
        mensualidades_pagadas: mensualidadesPagadas
      }
    });
  } catch (error) {
    console.error('Error GET estudiante pagos:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}