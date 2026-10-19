import { NextRequest, NextResponse } from 'next/server';
import { Pool, type PoolClient } from 'pg';
import { verifyToken, type AuthTokenPayload } from '@/lib/auth';
import { obtenerResumenFinanciero } from '@/lib/estadoFinanciero';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class ErrorPagoCuota extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const uuid = (valor: unknown): valor is string =>
  typeof valor === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);

function centavos(valor: unknown, campo: string, permitirCero = false): number {
  if (!['number', 'string'].includes(typeof valor) || String(valor).trim() === '') {
    throw new ErrorPagoCuota(400, `${campo} no es un importe valido.`);
  }
  const n = Number(valor);
  const c = Math.round(n * 100);
  if (!Number.isFinite(n) || !Number.isSafeInteger(c) ||
      (permitirCero ? n < 0 : n <= 0) || Math.abs(n * 100 - c) > 0.000001) {
    throw new ErrorPagoCuota(400, `${campo} debe tener como maximo dos decimales y ser ${permitirCero ? 'no negativo' : 'positivo'}.`);
  }
  return c;
}

function texto(valor: unknown, campo: string, maximo: number, obligatorio = false): string {
  if (valor != null && typeof valor !== 'string') {
    throw new ErrorPagoCuota(400, `${campo} debe ser texto.`);
  }
  const v = typeof valor === 'string' ? valor.trim() : '';
  if ((obligatorio && !v) || v.length > maximo) {
    throw new ErrorPagoCuota(400, `${campo} no es valido.`);
  }
  return v;
}

async function ejecutar(
  request: NextRequest,
  operacion: (client: PoolClient, actor: AuthTokenPayload, body: Record<string, unknown>) => Promise<unknown>
) {
  const actor = verifyToken(request.cookies.get('token')?.value ?? '');
  if (!actor) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  if (!['director', 'secretaria'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No tiene permisos para administrar pagos.' }, { status: 403 });
  }
  let client: PoolClient | undefined;
  let abierta = false;
  try {
    let recibido: unknown;
    try { recibido = await request.json(); }
    catch { throw new ErrorPagoCuota(400, 'JSON no valido.'); }
    if (typeof recibido !== 'object' || recibido === null || Array.isArray(recibido)) {
      throw new ErrorPagoCuota(400, 'Solicitud no valida.');
    }
    client = await pool.connect();
    await client.query('BEGIN');
    abierta = true;
    await client.query("SET LOCAL TIME ZONE 'America/Caracas'");
    const respuesta = await operacion(client, actor, recibido as Record<string, unknown>);
    await client.query('COMMIT');
    abierta = false;
    return NextResponse.json(respuesta, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (client && abierta) {
      try { await client.query('ROLLBACK'); }
      catch (e) { console.error('Rollback pagos por cuota:', e); }
    }
    if (error instanceof ErrorPagoCuota) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Pagos por cuota:', error);
    const codigo = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    return NextResponse.json({ error: codigo === '23505'
      ? 'La cuota ya tiene otro comprobante vigente. Recargue la ficha.'
      : 'No se pudo completar la operacion. Revise la terminal.'
    }, { status: codigo === '23505' ? 409 : 500 });
  } finally { client?.release(); }
}

async function bloquearIntentoActual(client: PoolClient, estudianteId: string) {
  const est = await client.query(
    'SELECT id, periodo_id FROM estudiantes WHERE id = $1::uuid FOR UPDATE', [estudianteId]
  );
  if (!est.rows.length) throw new ErrorPagoCuota(404, 'Estudiante no encontrado.');
  const ia = await client.query(
    `SELECT id, periodo_id, numero_intento FROM intentos_academicos
     WHERE estudiante_id = $1::uuid AND estado = 'en_curso' FOR UPDATE`, [estudianteId]
  );
  if (ia.rows.length !== 1 || Number(ia.rows[0].periodo_id) !== Number(est.rows[0].periodo_id)) {
    throw new ErrorPagoCuota(409, 'No hay un intento abierto compatible. Recargue la ficha.');
  }
  return ia.rows[0];
}

export async function registrarPagoPorCuotas(request: NextRequest) {
  return ejecutar(request, async (client, actor, body) => {
    const estudianteId = body.estudiante_id;
    const intentoId = body.intento_id;
    const modalidad = body.modalidad;
    if (!uuid(estudianteId) || !uuid(intentoId) || !['cuota', 'semestre'].includes(String(modalidad))) {
      throw new ErrorPagoCuota(400, 'Seleccione estudiante, intento y modalidad de pago.');
    }
    if (modalidad === 'cuota' && !uuid(body.cuota_id)) {
      throw new ErrorPagoCuota(400, 'Seleccione una cuota valida.');
    }
    const intento = await bloquearIntentoActual(client, estudianteId);
    if (intento.id !== intentoId) throw new ErrorPagoCuota(409, 'El intento cambio. Recargue la ficha.');

    const cuotas = await client.query(
      `SELECT id, monto, concepto, numero_mensualidad
       FROM cuotas
       WHERE estudiante_id = $1::uuid AND intento_id = $2::uuid
         AND tipo_cuota = 'mensualidad' AND estado IN ('pendiente', 'vencida')
         AND ($3::uuid IS NULL OR id = $3::uuid)
       ORDER BY numero_mensualidad, id FOR UPDATE`,
      [estudianteId, intentoId, modalidad === 'cuota' ? body.cuota_id : null]
    );
    if (!cuotas.rows.length || (modalidad === 'cuota' && cuotas.rows.length !== 1)) {
      throw new ErrorPagoCuota(409, 'No hay cuotas pendientes compatibles con la seleccion.');
    }
    const ids = cuotas.rows.map((c) => c.id);
    const reservas = await client.query(
      `SELECT cuota_id FROM pagos_cuotas
       WHERE cuota_id = ANY($1::uuid[]) AND estado IN ('reservada', 'aplicada')`, [ids]
    );
    if (reservas.rows.length) {
      throw new ErrorPagoCuota(409, 'Una cuota seleccionada ya tiene un comprobante en verificacion o aplicado. Resuelvalo antes de registrar otro.');
    }
    const original = cuotas.rows.reduce((s: number, c) => s + centavos(c.monto, 'Monto de cuota'), 0);
    if (!Number.isSafeInteger(original)) throw new ErrorPagoCuota(400, 'El total excede el rango admitido.');
    const descuento = centavos(body.descuento_aplicado ?? 0, 'Descuento', true);
    if (descuento >= original) throw new ErrorPagoCuota(400, 'El descuento debe ser menor que el importe total.');
    const neto = original - descuento;
    if (centavos(body.monto, 'Monto neto') !== neto ||
        centavos(body.monto_original_usd, 'Monto original') !== original) {
      throw new ErrorPagoCuota(409, 'El importe enviado no coincide con las cuotas actuales. Recargue la ficha.');
    }
    const metodo = texto(body.metodo_pago, 'Metodo de pago', 50, true);
    if (!['Efectivo USD', 'Zelle', 'Pago Móvil', 'Transferencia Bs'].includes(metodo)) {
      throw new ErrorPagoCuota(400, 'Metodo de pago no valido.');
    }
    const referencia = texto(body.referencia, 'Referencia', 100);
    const esBs = ['Pago Móvil', 'Transferencia Bs'].includes(metodo);
    let montoBs: number | null = null;
    let tasa: number | null = null;
    if (esBs) {
      montoBs = centavos(body.monto_bs, 'Monto en bolivares') / 100;
      tasa = Number(body.tasa_cambio_usada);
      if (!Number.isFinite(tasa) || tasa <= 0 || Math.abs((neto / 100) * tasa - montoBs) > 0.011) {
        throw new ErrorPagoCuota(400, 'Monto en bolivares y tasa no coinciden con el neto.');
      }
    }
    const concepto = modalidad === 'cuota' ? cuotas.rows[0].concepto
      : `Semestre pendiente - Periodo ${intento.periodo_id} - Intento ${intento.numero_intento}`;
    const pagoResult = await client.query(
      `INSERT INTO pagos (
        estudiante_id, intento_id, periodo_id, tipo, concepto, monto,
        monto_original_usd, descuento_aplicado, metodo_pago, referencia,
        monto_bs, tasa_cambio_usada, fecha_pago, estado
       ) VALUES (
        $1::uuid, $2::uuid, $3::integer, 'mensualidad', $4::varchar, $5::numeric,
        $6::numeric, $7::numeric, $8::varchar, $9::varchar,
        $10::numeric, $11::numeric, CURRENT_DATE, 'verificacion'
       ) RETURNING *`,
      [estudianteId, intentoId, intento.periodo_id, concepto, neto / 100,
       original / 100, descuento / 100, metodo, referencia || null, montoBs, tasa]
    );
    const pago = pagoResult.rows[0];
    for (const cuota of cuotas.rows) {
      await client.query(
        `INSERT INTO pagos_cuotas (pago_id, cuota_id, intento_id, estudiante_id, monto_cuota, estado)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, 'reservada')`,
        [pago.id, cuota.id, intentoId, estudianteId, cuota.monto]
      );
    }
    await client.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('pagos', 'INSERT', $1, $2)`,
      [actor.userId, JSON.stringify({ ...pago, modalidad, cuotas: ids,
        resumen: 'Comprobante registrado; cuotas reservadas, aun no pagadas.' })]
    );
    return { success: true, message: 'Comprobante registrado y pendiente de verificacion.', pago, cuotas_cubiertas: ids.length };
  });
}

export async function verificarPagoPorCuotas(request: NextRequest, pagoId: string) {
  return ejecutar(request, async (client, actor, body) => {
    if (!uuid(pagoId) || !['confirmado', 'rechazado'].includes(String(body.estado))) {
      throw new ErrorPagoCuota(400, 'Pago o estado no valido.');
    }
    const referencia = await client.query('SELECT estudiante_id FROM pagos WHERE id = $1::uuid', [pagoId]);
    if (!referencia.rows.length) throw new ErrorPagoCuota(404, 'Pago no encontrado.');
    const estudianteId = referencia.rows[0].estudiante_id;
    const intento = await bloquearIntentoActual(client, estudianteId);
    const pagoResult = await client.query('SELECT * FROM pagos WHERE id = $1::uuid FOR UPDATE', [pagoId]);
    if (!pagoResult.rows.length) throw new ErrorPagoCuota(404, 'Pago no encontrado.');
    const pago = pagoResult.rows[0];
    if (pago.intento_id !== intento.id || pago.estudiante_id !== estudianteId || Number(pago.periodo_id) !== Number(intento.periodo_id)) {
      throw new ErrorPagoCuota(409, 'El comprobante no pertenece al intento abierto.');
    }
    if (pago.estado === body.estado) return { success: true, message: 'El pago ya tenia ese estado.', pago };
    if (pago.estado !== 'verificacion') {
      throw new ErrorPagoCuota(409, 'Solo se verifican comprobantes en verificacion; no se revierte un confirmado con esta accion.');
    }
    const relaciones = await client.query(
      `SELECT pc.cuota_id, pc.monto_cuota, c.monto, c.estado AS estado_cuota,
              c.estudiante_id, c.intento_id
       FROM pagos_cuotas pc JOIN cuotas c ON c.id = pc.cuota_id
       WHERE pc.pago_id = $1::uuid AND pc.estado = 'reservada'
       ORDER BY c.id FOR UPDATE OF pc, c`, [pagoId]
    );
    if (!relaciones.rows.length) {
      throw new ErrorPagoCuota(409, 'El comprobante no tiene cuotas vinculadas. Revise la migracion o el alta inicial.');
    }
    if (body.estado === 'confirmado') {
      for (const r of relaciones.rows) {
        if (r.estudiante_id !== estudianteId || r.intento_id !== intento.id ||
            !['pendiente', 'vencida'].includes(r.estado_cuota) ||
            centavos(r.monto, 'Cuota') !== centavos(r.monto_cuota, 'Importe reservado')) {
          throw new ErrorPagoCuota(409, 'Una cuota ya no coincide con el comprobante. No se aplico el pago.');
        }
      }
      const original = relaciones.rows.reduce((s: number, r) => s + centavos(r.monto_cuota, 'Cuota'), 0);
      if (!Number.isSafeInteger(original) ||
          centavos(pago.monto, 'Pago') + centavos(pago.descuento_aplicado ?? 0, 'Descuento', true) !== original ||
          centavos(pago.monto_original_usd ?? original / 100, 'Original') !== original) {
        throw new ErrorPagoCuota(409, 'El total del comprobante no liquida exactamente las cuotas vinculadas.');
      }
      await client.query(
        `UPDATE cuotas SET estado = 'pagada', pago_id = $1::uuid WHERE id = ANY($2::uuid[])`,
        [pagoId, relaciones.rows.map((r) => r.cuota_id)]
      );
    }
    await client.query(
      `UPDATE pagos_cuotas SET estado = $1::varchar WHERE pago_id = $2::uuid AND estado = 'reservada'`,
      [body.estado === 'confirmado' ? 'aplicada' : 'liberada', pagoId]
    );
    const actualizado = await client.query(
      'UPDATE pagos SET estado = $1::varchar WHERE id = $2::uuid RETURNING *', [body.estado, pagoId]
    );
    const resumen = await obtenerResumenFinanciero(client, estudianteId, intento.id);
    await client.query(
      `UPDATE estudiantes SET estado = $1::varchar, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid`,
      [resumen.estado, estudianteId]
    );
    await client.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('pagos', 'UPDATE', $1, $2)`,
      [actor.userId, JSON.stringify({ ...actualizado.rows[0], cuotas: relaciones.rows.map((r) => r.cuota_id),
        resumen: `Comprobante ${body.estado}; cuotas ${body.estado === 'confirmado' ? 'aplicadas' : 'liberadas'}.` })]
    );
    return { success: true, pago: actualizado.rows[0], cuotas_cubiertas: relaciones.rows.length, estado_actualizado: resumen };
  });
}
