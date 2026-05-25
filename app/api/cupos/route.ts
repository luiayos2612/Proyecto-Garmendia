import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodoId = searchParams.get('periodo_id');

    let query = `
      SELECT 
        c.*,
        e.nombres, e.apellidos, e.cedula, e.estado as estado_estudiante,
        p.nombre as periodo_destino_nombre,
        po.nombre as periodo_origen_nombre
      FROM cupos c
      JOIN estudiantes e ON e.id = c.estudiante_id
      JOIN periodos p ON p.numero = c.periodo_destino
      LEFT JOIN periodos po ON po.numero = c.periodo_origen
      WHERE c.estado = 'pendiente'
    `;

    const params: any[] = [];
    if (periodoId) {
      query += ` AND c.periodo_destino = $1`;
      params.push(parseInt(periodoId));
    }

    query += ` ORDER BY c.periodo_destino, e.apellidos`;

    const result = await pool.query(query, params);
    const agrupados = result.rows.reduce((acc: any, row: any) => {
      const key = row.periodo_destino;
      if (!acc[key]) {
        acc[key] = {
          periodo_id: key,
          periodo_nombre: row.periodo_destino_nombre,
          estudiantes: []
        };
      }
      acc[key].estudiantes.push(row);
      return acc;
    }, {});

    return NextResponse.json({
      cupos: Object.values(agrupados),
      total: result.rows.length
    });

  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const body = await request.json();
    const { cupo_id, accion } = body;

    if (!cupo_id || !['aprobar', 'rechazar'].includes(accion)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const cupoRes = await client.query(`SELECT * FROM cupos WHERE id = $1`, [cupo_id]);
    if (cupoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cupo no encontrado' }, { status: 404 });
    }

    const cupo = cupoRes.rows[0];
    const nuevoEstado = accion === 'aprobar' ? 'aprobado' : 'rechazado';

    if (accion === 'aprobar') {
      // 1. Aprobar cupo
      await client.query(
        `UPDATE cupos SET estado = $1, fecha_aprobacion = CURRENT_TIMESTAMP WHERE id = $2`,
        [nuevoEstado, cupo_id]
      );

      // 2. Mover estudiante al nuevo periodo y reiniciar fecha_inicio_periodo_actual
      await client.query(
        `UPDATE estudiantes SET periodo_id = $1, estado = 'verificacion', fecha_inicio_periodo_actual = CURRENT_DATE WHERE id = $2`,
        [cupo.periodo_destino, cupo.estudiante_id]
      );

      // 3. Inscribir en materias obligatorias del nuevo periodo
      const obligatorias = await client.query(
        `SELECT materia_id FROM periodo_materia 
         WHERE periodo_id = $1 AND es_obligatoria = true ORDER BY orden`,
        [cupo.periodo_destino]
      );

      for (const row of obligatorias.rows) {
        await client.query(
          `INSERT INTO inscripciones_materias (estudiante_id, materia_id, periodo_id, ano_escolar)
           VALUES ($1,$2,$3,'2025-2026') ON CONFLICT DO NOTHING`,
          [cupo.estudiante_id, row.materia_id, cupo.periodo_destino]
        );
      }

      // 4. Obtener configuración
      const configRes = await client.query(
        `SELECT clave, valor FROM configuracion WHERE clave IN ('costo_inscripcion', 'monto_mensualidad', 'tasa_cambio')`
      );
      const config: any = {};
      configRes.rows.forEach((r: any) => config[r.clave] = r.valor);

      // 5. Generar SOLO deuda de inscripción del nuevo periodo (verificacion - aparece en panel)
      await client.query(
        `INSERT INTO pagos (estudiante_id, tipo, concepto, monto, metodo_pago, estado, fecha_pago)
         VALUES ($1, 'inscripcion', 'Inscripción Periodo ' || $2, $3, 'Pendiente', 'verificacion', CURRENT_DATE)`,
        [cupo.estudiante_id, cupo.periodo_destino, parseFloat(config.costo_inscripcion || '25')]
      );

      // 6. Las mensualidades se generarán automáticamente cada mes via cron job
      // (ver app/api/pagos/generar-mensualidades/route.ts)

    } else {
      await client.query(
        `UPDATE cupos SET estado = $1 WHERE id = $2`,
        [nuevoEstado, cupo_id]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: accion === 'aprobar' ? 'Cupo aprobado. Inscripción y deuda generadas para el nuevo periodo.' : 'Cupo rechazado',
      cupo: { id: cupo_id, estado: nuevoEstado }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error PATCH cupos:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}