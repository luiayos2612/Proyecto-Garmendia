import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';
import { crearMensualidadesDelIntento } from '@/lib/finanzasAcademicas';
import { tipoEvaluacionMateria } from '@/lib/evaluacionMaterias';

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

  if (!['director', 'secretaria'].includes(actor.rol)) {
    return NextResponse.json(
      { error: 'No tiene permisos para crear estudiantes.' },
      { status: 403 }
    );
  }

  class ErrorAlta extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }

  const leerTexto = (
    valor: unknown,
    nombre: string,
    maximo: number,
    obligatorio = false
  ) => {
    if (
      valor !== undefined &&
      valor !== null &&
      typeof valor !== 'string'
    ) {
      throw new ErrorAlta(
        400,
        `${nombre} debe ser texto.`
      );
    }

    const texto =
      typeof valor === 'string' ? valor.trim() : '';

    if (obligatorio && !texto) {
      throw new ErrorAlta(
        400,
        `${nombre} es obligatorio.`
      );
    }

    if (texto.length > maximo) {
      throw new ErrorAlta(
        400,
        `${nombre} no puede superar ${maximo} caracteres.`
      );
    }

    return texto;
  };

  const esDineroValido = (valor: number) =>
    Number.isFinite(valor) &&
    valor > 0 &&
    Math.abs(valor * 100 - Math.round(valor * 100)) <= 0.000001;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let client: import('pg').PoolClient | undefined;
  let transaccionAbierta = false;

  try {
    let recibido: unknown;

    try {
      recibido = await request.json();
    } catch {
      throw new ErrorAlta(400, 'La solicitud no contiene un JSON válido.');
    }

    if (
      typeof recibido !== 'object' ||
      recibido === null ||
      Array.isArray(recibido)
    ) {
      throw new ErrorAlta(400, 'La solicitud no tiene un formato válido.');
    }

    const body = recibido as Record<string, unknown>;

    const cedula = leerTexto(
      body.cedula,
      'Cédula',
      20,
      true
    );

    const cedulaEscolar = leerTexto(
      body.cedula_escolar,
      'Cédula escolar',
      20
    );

    const apellidos = leerTexto(
      body.apellidos,
      'Apellidos',
      100,
      true
    );

    const nombres = leerTexto(
      body.nombres,
      'Nombres',
      100,
      true
    );

    const genero = leerTexto(
      body.genero,
      'Género',
      10,
      true
    );

    const email = leerTexto(
      body.email,
      'Correo electrónico',
      100
    );

    const fechaNacimiento = leerTexto(
      body.fecha_nacimiento,
      'Fecha de nacimiento',
      10
    );

    const periodoId = Number(body.periodo_id);

    if (
      !Number.isInteger(periodoId) ||
      periodoId < 1 ||
      periodoId > 6
    ) {
      throw new ErrorAlta(
        400,
        'El período debe ser un número entre 1 y 6.'
      );
    }

    if (!['Masculino', 'Femenino'].includes(genero)) {
      throw new ErrorAlta(400, 'El género indicado no es válido.');
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new ErrorAlta(400, 'El correo electrónico no es válido.');
    }

    if (
      fechaNacimiento &&
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)
    ) {
      throw new ErrorAlta(
        400,
        'La fecha de nacimiento debe utilizar el formato AAAA-MM-DD.'
      );
    }

    const seleccionRecibida = body.materias_complementarias ?? [];

    if (
      !Array.isArray(seleccionRecibida) ||
      seleccionRecibida.length > 2 ||
      seleccionRecibida.some(
        (id: unknown) =>
          typeof id !== 'string' || !uuidRegex.test(id)
      )
    ) {
      throw new ErrorAlta(
        400,
        'Seleccione como máximo dos materias complementarias válidas.'
      );
    }

    const complementariasSeleccionadas = (
      seleccionRecibida as string[]
    ).map((id) => id.toLowerCase());

    if (
      new Set(complementariasSeleccionadas).size !==
      complementariasSeleccionadas.length
    ) {
      throw new ErrorAlta(
        400,
        'No puede seleccionar la misma complementaria dos veces.'
      );
    }

    if (
      typeof body.pago !== 'object' ||
      body.pago === null ||
      Array.isArray(body.pago)
    ) {
      throw new ErrorAlta(
        400,
        'Debe registrar los datos del pago de inscripción.'
      );
    }

    const pago = body.pago as Record<string, unknown>;

    if (
      !['number', 'string'].includes(typeof pago.monto) ||
      String(pago.monto).trim() === ''
    ) {
      throw new ErrorAlta(400, 'El monto de inscripción es inválido.');
    }

    const montoPago = Number(pago.monto);

    if (!esDineroValido(montoPago)) {
      throw new ErrorAlta(
        400,
        'El monto de inscripción debe ser positivo y tener máximo dos decimales.'
      );
    }

    const metodoPago = leerTexto(
      pago.metodo_pago,
      'Método de pago',
      50,
      true
    );

    const metodosPermitidos = [
      'Efectivo USD',
      'Zelle',
      'Pago Móvil',
      'Transferencia Bs',
    ];

    if (!metodosPermitidos.includes(metodoPago)) {
      throw new ErrorAlta(400, 'El método de pago no es válido.');
    }

    const referencia = leerTexto(
      pago.referencia,
      'Referencia',
      100
    );

    const fechaPago = leerTexto(
      pago.fecha_pago,
      'Fecha de pago',
      10
    );

    if (
      fechaPago &&
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)
    ) {
      throw new ErrorAlta(
        400,
        'La fecha de pago debe utilizar el formato AAAA-MM-DD.'
      );
    }

    const esPagoBs = [
      'Pago Móvil',
      'Transferencia Bs',
    ].includes(metodoPago);

    let montoBs: number | null = null;
    let tasaCambio: number | null = null;

    if (esPagoBs) {
      montoBs = Number(pago.monto_bs);
      tasaCambio = Number(pago.tasa_cambio_usada);

      if (
        !Number.isFinite(montoBs) ||
        !Number.isFinite(tasaCambio) ||
        montoBs <= 0 ||
        tasaCambio <= 0 ||
        Math.abs(montoPago * tasaCambio - montoBs) > 0.011
      ) {
        throw new ErrorAlta(
          400,
          'El monto en bolívares y la tasa no coinciden con el monto en USD.'
        );
      }
    }

    client = await pool.connect();

    await client.query('BEGIN');
    transaccionAbierta = true;
    await client.query(
      "SET LOCAL TIME ZONE 'America/Caracas'"
    );

    const periodoResult = await client.query(
      'SELECT numero FROM periodos WHERE numero = $1',
      [periodoId]
    );

    if (periodoResult.rows.length === 0) {
      throw new ErrorAlta(400, 'El período seleccionado no existe.');
    }

    const configuracionResult = await client.query(
      `
        SELECT clave, valor
        FROM configuracion
        WHERE clave IN (
          'ano_escolar',
          'costo_inscripcion',
          'monto_mensualidad'
        )
      `
    );

    const configuracion: Record<string, string> = {};

    for (const fila of configuracionResult.rows) {
      configuracion[fila.clave] = fila.valor;
    }

    const anoEscolar = configuracion.ano_escolar?.trim();
    const costoInscripcion = Number(configuracion.costo_inscripcion);
    const montoMensualidad = Number(configuracion.monto_mensualidad);

    if (
      !anoEscolar ||
      !/^\d{4}-\d{4}$/.test(anoEscolar)
    ) {
      throw new ErrorAlta(
        400,
        'Configure ano_escolar con el formato AAAA-AAAA antes de inscribir.'
      );
    }

    if (
      !esDineroValido(costoInscripcion) ||
      !esDineroValido(montoMensualidad)
    ) {
      throw new ErrorAlta(
        400,
        'Revise costo_inscripcion y monto_mensualidad en la configuración.'
      );
    }

    if (Math.abs(montoPago - costoInscripcion) > 0.001) {
      throw new ErrorAlta(
        400,
        'El monto enviado no coincide con el costo de inscripción vigente. ' +
          'Recargue el formulario.'
      );
    }

    if (fechaNacimiento) {
      const fechaResult = await client.query(
        'SELECT $1::date > CURRENT_DATE AS es_futura',
        [fechaNacimiento]
      );

      if (fechaResult.rows[0].es_futura) {
        throw new ErrorAlta(
          400,
          'La fecha de nacimiento no puede ser futura.'
        );
      }
    }

    const materiasResult = await client.query(
      `
        SELECT DISTINCT
          m.id,
          m.nombre,
          pm.es_obligatoria
        FROM periodo_materia pm
        JOIN materias m ON m.id = pm.materia_id
        WHERE pm.periodo_id = $1
          AND m.activa = true
      `,
      [periodoId]
    );

    const obligatorias = materiasResult.rows.filter(
      (materia) =>
        materia.es_obligatoria === true &&
        tipoEvaluacionMateria(materia.nombre) === 'numerica'
    );

    const complementarias = materiasResult.rows.filter(
      (materia) =>
        materia.es_obligatoria === false &&
        tipoEvaluacionMateria(materia.nombre) === 'cualitativa'
    );

    if (obligatorias.length === 0) {
      throw new ErrorAlta(
        400,
        'El período no tiene materias obligatorias activas configuradas.'
      );
    }

    const idsComplementarias = new Set<string>(
      complementarias.map((materia) =>
        String(materia.id).toLowerCase()
      )
    );

    if (
      complementariasSeleccionadas.some(
        (id) => !idsComplementarias.has(id)
      )
    ) {
      throw new ErrorAlta(
        400,
        'Una complementaria seleccionada no está disponible en este período.'
      );
    }

    // Un nuevo alumno que ingresa directamente al período 6
    // todavía no tiene AP previos dentro del sistema.
    let complementariasAInscribir = complementariasSeleccionadas;

    if (periodoId === 6) {
      const nombresComplementarias = new Set(
        complementarias.map((materia) =>
          materia.nombre
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase()
        )
      );

      if (
        complementarias.length !== 2 ||
        !nombresComplementarias.has('IDIOMAS') ||
        !nombresComplementarias.has('OFICIO')
      ) {
        throw new ErrorAlta(
          400,
          'El período 6 debe tener configuradas Idiomas y Oficio como complementarias activas.'
        );
      }

      complementariasAInscribir = Array.from(idsComplementarias);
    }

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
          $1, $2, $3, $4, $5::date, $6, $7, $8,
          'deuda',
          true,
          CURRENT_DATE
        )
        RETURNING *
      `,
      [
        cedula,
        cedulaEscolar || null,
        nombres,
        apellidos,
        fechaNacimiento || null,
        genero,
        email || null,
        periodoId,
      ]
    );

    const estudiante = estudianteResult.rows[0];
    const estudianteId = estudiante.id;

    const intentoResult = await client.query(
      `
        INSERT INTO intentos_academicos (
          estudiante_id,
          periodo_id,
          numero_intento,
          ano_escolar,
          estado,
          fecha_inicio
        )
        VALUES ($1, $2, 1, $3, 'en_curso', CURRENT_DATE)
        RETURNING *
      `,
      [estudianteId, periodoId, anoEscolar]
    );

    const intento = intentoResult.rows[0];

    const materiasAInscribir = Array.from(
      new Set<string>([
        ...obligatorias.map((materia) => String(materia.id)),
        ...complementariasAInscribir,
      ])
    );

    for (const materiaId of materiasAInscribir) {
      await client.query(
        `
          INSERT INTO inscripciones_materias (
            estudiante_id,
            materia_id,
            periodo_id,
            ano_escolar,
            activa,
            intento_id,
            tipo_inscripcion,
            tutoria_id
          )
          VALUES (
            $1, $2, $3, $4, true, $5, 'regular', NULL
          )
        `,
        [
          estudianteId,
          materiaId,
          periodoId,
          anoEscolar,
          intento.id,
        ]
      );
    }

    await client.query(
      `
        INSERT INTO cuotas (
          estudiante_id,
          intento_id,
          periodo_id,
          tipo_cuota,
          numero_mensualidad,
          concepto,
          monto,
          fecha_vencimiento,
          estado
        )
        VALUES (
          $1, $2, $3,
          'inscripcion',
          NULL,
          'Inscripción',
          $4,
          CURRENT_DATE,
          'pendiente'
        )
      `,
      [
        estudianteId,
        intento.id,
        periodoId,
        costoInscripcion,
      ]
    );

    const pagoResult = await client.query(
      `
        INSERT INTO pagos (
          estudiante_id,
          intento_id,
          periodo_id,
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
          estado
        )
        VALUES (
          $1, $2, $3,
          'inscripcion',
          'Inscripción',
          $4, $4, 0,
          $5, $6, $7, $8,
          COALESCE($9::date, CURRENT_DATE),
          'verificacion'
        )
        RETURNING id
      `,
      [
        estudianteId,
        intento.id,
        periodoId,
        montoPago,
        montoBs,
        tasaCambio,
        metodoPago,
        referencia || null,
        fechaPago || null,
      ]
    );

    const mensualidadesCreadas =
      await crearMensualidadesDelIntento(client, {
        estudianteId,
        intentoId: intento.id,
        periodoId,
        montoMensualidad,
      });

    if (mensualidadesCreadas !== 6) {
      throw new Error(
        'El intento nuevo no recibió exactamente seis mensualidades.'
      );
    }

    const vinculoInscripcion = await client.query(
      `
        INSERT INTO pagos_cuotas (
          pago_id, cuota_id, intento_id, estudiante_id,
          monto_cuota, estado
        )
        SELECT
          p.id, c.id, p.intento_id, p.estudiante_id,
          c.monto, 'reservada'
        FROM pagos p
        JOIN cuotas c
          ON c.estudiante_id = p.estudiante_id
        AND c.intento_id = p.intento_id
        AND c.tipo_cuota = 'inscripcion'
        WHERE p.id = $1::uuid
          AND p.estudiante_id = $2::uuid
          AND p.intento_id = $3::uuid
      `,
      [pagoResult.rows[0].id, estudianteId, intento.id]
    );

    if (vinculoInscripcion.rowCount !== 1) {
      throw new Error('No se pudo vincular el comprobante a la cuota de inscripcion.');
    }


    await client.query(
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
        actor.userId,
        JSON.stringify({
          estudiante_id: estudianteId,
          intento_id: intento.id,
          periodo_id: periodoId,
          numero_intento: 1,
          ano_escolar: anoEscolar,
          materias_inscritas: materiasAInscribir.length,
          complementarias_inscritas: complementariasAInscribir,
          cuota_inscripcion_generada: true,
          mensualidades_generadas: mensualidadesCreadas,
          pago_inscripcion_id: pagoResult.rows[0].id,
          resumen:
            'Alta inicial: primer intento, inscripción única ' +
            'y seis mensualidades.',
        }),
      ]
    );

    await client.query('COMMIT');
    transaccionAbierta = false;

    return NextResponse.json(
      {
        success: true,
        message:
          'Estudiante registrado con su primer intento, ' +
          'una inscripción y seis mensualidades.',
        estudiante,
        intento,
        materias_inscritas: materiasAInscribir.length,
        complementarias_inscritas: complementariasAInscribir,
        cuotas_generadas: 7,
        mensualidades_generadas: mensualidadesCreadas,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (client && transaccionAbierta) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error al revertir alta:', rollbackError);
      }
    }

    if (error instanceof ErrorAlta) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    const codigo =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? String(error.code)
        : '';

    console.error('Error POST estudiantes:', error);

    if (codigo === '23505') {
      return NextResponse.json(
        {
          error:
            'Ya existe un registro con uno de los valores únicos enviados, ' +
            'como la cédula o la cédula escolar.',
        },
        { status: 409 }
      );
    }

    if (codigo === '22007' || codigo === '22008') {
      return NextResponse.json(
        { error: 'Alguna de las fechas ingresadas no es válida.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          'No se pudo completar la inscripción. ' +
          'Revise la terminal del servidor.',
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}