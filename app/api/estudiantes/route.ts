import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  // ✅ NUEVO: se resuelve el actor desde el JWT (cookie httpOnly), nunca desde query params.
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (actor.rol === 'docente' && !actor.docenteId) {
    return NextResponse.json({ error: 'Perfil de docente no vinculado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodoId = searchParams.get('periodo_id');
    if (periodoId && isNaN(parseInt(periodoId))) {
      return NextResponse.json({ error: 'periodo_id inválido' }, { status: 400 });
    }

    const values: any[] = [];
    const whereClauses: string[] = [];

    let query = `
      SELECT DISTINCT e.*,
        p.nombre as periodo_nombre,
        (
          SELECT COUNT(*) FROM inscripciones_materias im
          WHERE im.estudiante_id = e.id AND im.activa = true
        ) AS total_materias
      FROM estudiantes e
      LEFT JOIN periodos p ON e.periodo_id = p.numero
    `;

    // ✅ NUEVO: si es docente, se restringe SOLO a estudiantes inscritos en
    // materias/período donde el docente tiene una asignación activa.
    // Este filtro se hace en el backend con el docenteId del JWT, no confía en el cliente.
    if (actor.rol === 'docente') {
      query += `
        JOIN inscripciones_materias im2 ON im2.estudiante_id = e.id AND im2.activa = true
        JOIN asignaciones_docentes ad ON ad.materia_id = im2.materia_id
          AND ad.periodo_id = im2.periodo_id
          AND ad.activa = true
      `;
      values.push(actor.docenteId);
      whereClauses.push(`ad.docente_id = $${values.length}`);
    }

    if (periodoId) {
      values.push(parseInt(periodoId));
      whereClauses.push(`e.periodo_id = $${values.length}`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` ORDER BY e.periodo_id, e.apellidos`;

    const result = await pool.query(query, values);
    return NextResponse.json({ estudiantes: result.rows });
  } catch (error) {
    console.error('Error GET estudiantes:', error);
    return NextResponse.json({ error: 'Error al cargar estudiantes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // ✅ NUEVO: solo director/secretaria pueden crear estudiantes (docente = solo lectura)
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);
  if (!actor) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (actor.rol === 'docente') {
    return NextResponse.json({ error: 'No tiene permisos para crear estudiantes' }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const body = await request.json();
    const {
      cedula, cedula_escolar, apellidos, nombres,
      fecha_nacimiento, genero, periodo_id,
      pago, materias_complementarias = []
    } = body;

    if (!cedula || !apellidos || !nombres || !periodo_id || !genero) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cédula, apellidos, nombres, periodo y género son obligatorios' }, { status: 400 });
    }

    if (periodo_id < 1 || periodo_id > 6) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Periodo debe estar entre 1 y 6' }, { status: 400 });
    }

    if (!pago || !pago.monto || !pago.metodo_pago) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Debe registrar el pago de inscripción para completar el registro' }, { status: 400 });
    }

    // ✅ VALIDACIÓN CRÍTICA DE BOLÍVARES EN SERVIDOR
    const metodoBs = ['Pago Móvil', 'Transferencia Bs'];
    const esPagoBs = metodoBs.includes(pago.metodo_pago);

    if (esPagoBs) {
      if (!pago.monto_bs || !pago.tasa_cambio_usada) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Para pagos en Bs debe enviar monto_bs y tasa_cambio_usada' }, { status: 400 });
      }
      const esperado = parseFloat(pago.monto) * parseFloat(pago.tasa_cambio_usada);
      const recibido = parseFloat(pago.monto_bs);
      if (Math.abs(esperado - recibido) > 0.01) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          error: `Monto en Bs no coincide. Esperado: ${esperado.toFixed(2)}, Recibido: ${recibido.toFixed(2)}`
        }, { status: 422 });
      }
    }

    // Crear estudiante
    const estResult = await client.query(
      `INSERT INTO estudiantes (cedula, cedula_escolar, nombres, apellidos, fecha_nacimiento, genero, periodo_id, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'verificacion') RETURNING *`,
      [cedula, cedula_escolar || null, nombres, apellidos, fecha_nacimiento, genero, periodo_id]
    );
    const estudianteId: string = estResult.rows[0].id;

    // Auto-inscripción de materias OBLIGATORIAS
    const obligatorias = await client.query(
      `SELECT materia_id FROM periodo_materia
       WHERE periodo_id = $1 AND es_obligatoria = true
       ORDER BY orden`,
      [periodo_id]
    );

    let materiasInscritas = 0;

    for (const row of obligatorias.rows) {
      await client.query(
        `INSERT INTO inscripciones_materias (estudiante_id, materia_id, periodo_id, ano_escolar)
         VALUES ($1,$2,$3,'2025-2026') ON CONFLICT DO NOTHING`,
        [estudianteId, row.materia_id, periodo_id]
      );
      materiasInscritas++;
    }

    if (Array.isArray(materias_complementarias) && materias_complementarias.length > 0) {
      for (const materiaId of materias_complementarias) {
        await client.query(
          `INSERT INTO inscripciones_materias (estudiante_id, materia_id, periodo_id, ano_escolar)
           VALUES ($1,$2,$3,'2025-2026') ON CONFLICT DO NOTHING`,
          [estudianteId, materiaId, periodo_id]
        );
        materiasInscritas++;
      }
    }

    await client.query(
      `INSERT INTO pagos (estudiante_id, tipo, concepto, monto, monto_original_usd, descuento_aplicado,
        monto_bs, tasa_cambio_usada, metodo_pago, referencia, fecha_pago, estado)
       VALUES ($1, 'inscripcion', 'Pago de Inscripción', $2, $3, $4, $5, $6, $7, $8, $9, 'verificacion')`,
      [
        estudianteId,
        pago.monto,
        pago.monto,
        0,
        esPagoBs ? pago.monto_bs : null,
        esPagoBs ? pago.tasa_cambio_usada : null,
        pago.metodo_pago,
        pago.referencia || null,
        pago.fecha_pago || new Date()
      ]
    );

    await client.query('COMMIT');

    await pool.query(
      `INSERT INTO auditoria (tabla_afectada, accion, usuario_id, datos_nuevos)
       VALUES ('estudiantes','INSERT',$1,$2)`,
      [actor.userId, JSON.stringify(estResult.rows[0])]
    );

    return NextResponse.json({
      success: true,
      message: `Estudiante registrado. Pago de inscripción en verificación.`,
      estudiante: estResult.rows[0],
      materias_inscritas: materiasInscritas
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error POST estudiantes:', error);
    return NextResponse.json({ error: 'Error al registrar: ' + (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}