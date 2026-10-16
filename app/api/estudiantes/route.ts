import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PagoInscripcion = {
  monto: string | number;
  monto_bs?: string | number | null;
  tasa_cambio_usada?: string | number | null;
  metodo_pago: string;
  referencia?: string | null;
  fecha_pago?: string | null;
};

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (actor.rol === 'docente' && !actor.docenteId) {
    return NextResponse.json(
      { error: 'Perfil de docente no vinculado.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodoIdParam = searchParams.get('periodo_id');

    if (
      periodoIdParam !== null &&
      (!Number.isInteger(Number(periodoIdParam)) ||
        Number(periodoIdParam) < 1)
    ) {
      return NextResponse.json(
        { error: 'periodo_id inválido.' },
        { status: 400 }
      );
    }

    let query = `
      SELECT DISTINCT
        e.*,
        p.nombre AS periodo_nombre,
        (
          SELECT COUNT(*)
          FROM inscripciones_materias im
          WHERE im.estudiante_id = e.id
            AND im.activa = true
        ) AS total_materias
      FROM estudiantes e
      LEFT JOIN periodos p ON p.numero = e.periodo_id
    `;

    const values: Array<string | number> = [];
    const whereClauses: string[] = [];

    if (actor.rol === 'docente') {
      query += `
        INNER JOIN inscripciones_materias im2
          ON im2.estudiante_id = e.id
          AND im2.activa = true
        INNER JOIN asignaciones_docentes ad
          ON ad.materia_id = im2.materia_id
          AND ad.periodo_id = im2.periodo_id
          AND ad.activa = true
      `;

      values.push(actor.docenteId!);
      whereClauses.push(`ad.docente_id = $${values.length}`);
    }

    if (periodoIdParam !== null) {
      values.push(Number(periodoIdParam));
      whereClauses.push(`e.periodo_id = $${values.length}`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += `
      ORDER BY
        e.periodo_id ASC,
        e.apellidos ASC,
        e.nombres ASC
    `;

    const result = await pool.query(query, values);

    return NextResponse.json({
      estudiantes: result.rows,
    });
  } catch (error) {
    console.error('Error GET estudiantes:', error);

    return NextResponse.json(
      { error: 'Error al cargar estudiantes.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (actor.rol === 'docente') {
    return NextResponse.json(
      { error: 'No tiene permisos para crear estudiantes.' },
      { status: 403 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const body = await request.json();

    const {
      cedula,
      cedula_escolar,
      apellidos,
      nombres,
      fecha_nacimiento,
      genero,
      email,
      periodo_id,
      pago,
      materias_complementarias = [],
    }: {
      cedula?: string;
      cedula_escolar?: string | null;
      apellidos?: string;
      nombres?: string;
      fecha_nacimiento?: string | null;
      genero?: string;
      email?: string | null;
      periodo_id?: number | string;
      pago?: PagoInscripcion;
      materias_complementarias?: string[];
    } = body;

    const periodoId = Number(periodo_id);

    if (
      !cedula ||
      !apellidos ||
      !nombres ||
      !genero ||
      !Number.isInteger(periodoId)
    ) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        {
          error:
            'Cédula, apellidos, nombres, período y género son obligatorios.',
        },
        { status: 400 }
      );
    }

    if (periodoId < 1 || periodoId > 6) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'El período debe estar entre 1 y 6.' },
        { status: 400 }
      );
    }

    if (!pago?.monto || !pago?.metodo_pago) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        {
          error:
            'Debe registrar los datos del pago de inscripción para completar el registro.',
        },
        { status: 400 }
      );
    }

    const montoPago = Number(pago.monto);

    if (!Number.isFinite(montoPago) || montoPago <= 0) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'El monto del pago de inscripción no es válido.' },
        { status: 400 }
      );
    }

    const metodosEnBs = ['Pago Móvil', 'Transferencia Bs'];
    const esPagoBs = metodosEnBs.includes(pago.metodo_pago);

    if (esPagoBs) {
      if (!pago.monto_bs || !pago.tasa_cambio_usada) {
        await client.query('ROLLBACK');

        return NextResponse.json(
          {
            error:
              'Para pagos en bolívares debe indicar monto_bs y tasa_cambio_usada.',
          },
          { status: 400 }
        );
      }

      const montoBs = Number(pago.monto_bs);
      const tasaCambio = Number(pago.tasa_cambio_usada);
      const esperado = montoPago * tasaCambio;

      if (
        !Number.isFinite(montoBs) ||
        !Number.isFinite(tasaCambio) ||
        Math.abs(esperado - montoBs) > 0.01
      ) {
        await client.query('ROLLBACK');

        return NextResponse.json(
          {
            error: `Monto en Bs no coincide. Esperado: ${esperado.toFixed(
              2
            )}, recibido: ${montoBs.toFixed(2)}.`,
          },
          { status: 422 }
        );
      }
    }

    /*
      1. Crear estudiante.
      Empieza en estado "deuda" porque a continuación se crearán
      inscripción y seis mensualidades pendientes.
    */
    const estudianteResult = await client.query(
      `
        INSERT INTO estudiantes (
          cedula,
          cedula_escolar,
          nombres,
          apellidos,
          fecha_nacimiento,
          genero,
          email,
          periodo_id,
          estado,
          activo,
          fecha_inicio_periodo_actual
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          'deuda',
          true,
          CURRENT_DATE
        )
        RETURNING *
      `,
      [
        cedula,
        cedula_escolar || null,
        nombres,
        apellidos,
        fecha_nacimiento || null,
        genero,
        email || null,
        periodoId,
      ]
    );

    const estudiante = estudianteResult.rows[0];
    const estudianteId = estudiante.id;

    /*
      2. Inscribir materias obligatorias.
    */
    const obligatoriasResult = await client.query(
      `
        SELECT materia_id
        FROM periodo_materia
        WHERE periodo_id = $1
          AND es_obligatoria = true
        ORDER BY orden
      `,
      [periodoId]
    );

    let materiasInscritas = 0;

    for (const materia of obligatoriasResult.rows) {
      const insertResult = await client.query(
        `
          INSERT INTO inscripciones_materias (
            estudiante_id,
            materia_id,
            periodo_id,
            ano_escolar,
            activa
          )
          VALUES ($1, $2, $3, '2025-2026', true)
          ON CONFLICT DO NOTHING
          RETURNING id
        `,
        [estudianteId, materia.materia_id, periodoId]
      );

      if (insertResult.rows.length > 0) {
        materiasInscritas += 1;
      }
    }

    /*
      3. Inscribir materias complementarias seleccionadas.
    */
    if (
      Array.isArray(materias_complementarias) &&
      materias_complementarias.length > 0
    ) {
      for (const materiaId of materias_complementarias) {
        const insertResult = await client.query(
          `
            INSERT INTO inscripciones_materias (
              estudiante_id,
              materia_id,
              periodo_id,
              ano_escolar,
              activa
            )
            VALUES ($1, $2, $3, '2025-2026', true)
            ON CONFLICT DO NOTHING
            RETURNING id
          `,
          [estudianteId, materiaId, periodoId]
        );

        if (insertResult.rows.length > 0) {
          materiasInscritas += 1;
        }
      }
    }

    /*
      4. Obtener costos vigentes.
      Se usa configuración para cuotas, no el monto manual del formulario,
      porque la deuda oficial del período debe venir de configuración.
    */
    const configuracionResult = await client.query(
      `
        SELECT clave, valor
        FROM configuracion
        WHERE clave IN ('costo_inscripcion', 'monto_mensualidad')
      `
    );

    const configuracion: Record<string, string> = {};

    for (const fila of configuracionResult.rows) {
      configuracion[fila.clave] = fila.valor;
    }

    const costoInscripcion = Number(
      configuracion.costo_inscripcion ?? montoPago
    );

    const montoMensualidad = Number(
      configuracion.monto_mensualidad ?? 50
    );

    if (
      !Number.isFinite(costoInscripcion) ||
      costoInscripcion <= 0 ||
      !Number.isFinite(montoMensualidad) ||
      montoMensualidad <= 0
    ) {
      throw new Error(
        'La configuración financiera es inválida. Revise costo_inscripcion y monto_mensualidad.'
      );
    }

    /*
      5. Crear la cuota pendiente de inscripción.
      Es la obligación que se marcará como pagada al confirmar el pago.
    */
    await client.query(
      `
        INSERT INTO cuotas (
          estudiante_id,
          periodo_id,
          concepto,
          monto,
          fecha_vencimiento,
          estado
        )
        VALUES (
          $1,
          $2,
          'Inscripción',
          $3,
          CURRENT_DATE,
          'pendiente'
        )
      `,
      [estudianteId, periodoId, costoInscripcion]
    );

    /*
      6. Crear el pago de inscripción, visible en la página de pagos.
      Mantiene el método/referencia real registrados en el formulario.
    */
    await client.query(
      `
        INSERT INTO pagos (
          estudiante_id,
          tipo,
          concepto,
          monto,
          monto_original_usd,
          descuento_aplicado,
          monto_bs,
          tasa_cambio_usada,
          metodo_pago,
          referencia,
          fecha_pago,
          estado,
          periodo_id
        )
        VALUES (
          $1,
          'inscripcion',
          'Inscripción',
          $2,
          $3,
          0,
          $4,
          $5,
          $6,
          $7,
          $8,
          'verificacion',
          $9
        )
      `,
      [
        estudianteId,
        montoPago,
        montoPago,
        esPagoBs ? Number(pago.monto_bs) : null,
        esPagoBs ? Number(pago.tasa_cambio_usada) : null,
        pago.metodo_pago,
        pago.referencia || null,
        pago.fecha_pago || new Date().toISOString().slice(0, 10),
        periodoId,
      ]
    );

    /*
      7. Crear las seis cuotas mensuales pendientes del período.
      No se crean seis pagos falsos; se crean obligaciones reales.
    */
    const fechaInicio = new Date();
    const mesInicio = fechaInicio.getMonth() + 1;
    const anoInicio = fechaInicio.getFullYear();

    for (let indice = 0; indice < 6; indice++) {
      const fechaVencimiento = new Date(
        anoInicio,
        mesInicio - 1 + indice,
        1
      );

      const mesCuota = fechaVencimiento.getMonth() + 1;
      const anoCuota = fechaVencimiento.getFullYear();

      await client.query(
        `
          INSERT INTO cuotas (
            estudiante_id,
            periodo_id,
            concepto,
            monto,
            fecha_vencimiento,
            estado,
            mes,
            ano
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'pendiente',
            $6,
            $7
          )
        `,
        [
          estudianteId,
          periodoId,
          `Mensualidad ${indice + 1} - Período ${periodoId}`,
          montoMensualidad,
          fechaVencimiento.toISOString().slice(0, 10),
          mesCuota,
          anoCuota,
        ]
      );
    }

    await client.query('COMMIT');

    await pool.query(
      `
        INSERT INTO auditoria (
          tabla_afectada,
          accion,
          usuario_id,
          datos_nuevos
        )
        VALUES ('estudiantes', 'INSERT', $1, $2)
      `,
      [
        actor.userId ?? null,
        JSON.stringify({
          estudiante,
          periodo_id: periodoId,
          materias_inscritas: materiasInscritas,
          cuotas_generadas: 7,
          resumen:
            'Estudiante inscrito. Se generó una inscripción y seis mensualidades pendientes.',
        }),
      ]
    );

    return NextResponse.json(
      {
        success: true,
        message:
          'Estudiante registrado. Se generó el pago de inscripción en verificación y seis mensualidades pendientes.',
        estudiante,
        materias_inscritas: materiasInscritas,
        cuotas_generadas: 7,
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error POST estudiantes:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Error al registrar: ${error.message}`
            : 'Error al registrar estudiante.',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}