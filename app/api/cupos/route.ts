import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyToken } from '@/lib/auth';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cupos
 * Lista cupos pendientes, opcionalmente filtrados por período destino.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodoId = searchParams.get('periodo_id');

    let query = `
      SELECT
        c.*,
        e.nombres,
        e.apellidos,
        e.cedula,
        e.estado AS estado_estudiante,
        p.nombre AS periodo_destino_nombre,
        po.nombre AS periodo_origen_nombre
      FROM cupos c
      INNER JOIN estudiantes e ON e.id = c.estudiante_id
      INNER JOIN periodos p ON p.numero = c.periodo_destino
      LEFT JOIN periodos po ON po.numero = c.periodo_origen
      WHERE c.estado = 'pendiente'
    `;

    const values: number[] = [];

    if (periodoId) {
      const periodoNumero = Number(periodoId);

      if (!Number.isInteger(periodoNumero) || periodoNumero < 1) {
        return NextResponse.json(
          { error: 'El período indicado no es válido.' },
          { status: 400 }
        );
      }

      values.push(periodoNumero);
      query += ` AND c.periodo_destino = $1`;
    }

    query += ` ORDER BY c.periodo_destino ASC, e.apellidos ASC, e.nombres ASC`;

    const result = await pool.query(query, values);

    const agrupados = result.rows.reduce((acumulado: any, fila: any) => {
      const periodo = fila.periodo_destino;

      if (!acumulado[periodo]) {
        acumulado[periodo] = {
          periodo_id: periodo,
          periodo_nombre: fila.periodo_destino_nombre,
          estudiantes: [],
        };
      }

      acumulado[periodo].estudiantes.push(fila);

      return acumulado;
    }, {});

    return NextResponse.json({
      cupos: Object.values(agrupados),
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error GET cupos:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar los cupos.',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/cupos
 * Aprueba o rechaza un cupo pendiente.
 *
 * Body:
 * {
 *   cupo_id: string,
 *   accion: 'aprobar' | 'rechazar',
 *   materia_complementaria_id?: string
 * }
 */
export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('token')?.value ?? '';
  const actor = verifyToken(token);

  if (!actor) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401 }
    );
  }

  if (actor.rol !== 'director') {
    return NextResponse.json(
      { error: 'Solo el director puede aprobar o rechazar cupos.' },
      { status: 403 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const body = await request.json();

    const {
      cupo_id,
      accion,
      materia_complementaria_id,
    }: {
      cupo_id?: string;
      accion?: 'aprobar' | 'rechazar';
      materia_complementaria_id?: string;
    } = body;

    if (!cupo_id || !accion || !['aprobar', 'rechazar'].includes(accion)) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        {
          error:
            'Datos inválidos. Debe indicar cupo_id y una acción: aprobar o rechazar.',
        },
        { status: 400 }
      );
    }

    const cupoResult = await client.query(
      `
        SELECT *
        FROM cupos
        WHERE id = $1
        FOR UPDATE
      `,
      [cupo_id]
    );

    if (cupoResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'Cupo no encontrado.' },
        { status: 404 }
      );
    }

    const cupo = cupoResult.rows[0];

    if (cupo.estado !== 'pendiente') {
      await client.query('ROLLBACK');

      return NextResponse.json(
        { error: 'Este cupo ya fue procesado anteriormente.' },
        { status: 400 }
      );
    }

    /*
      RECHAZAR:
      solo cambia el estado del cupo. No modifica período,
      materias, cuotas ni pagos.
    */
    if (accion === 'rechazar') {
      await client.query(
        `
          UPDATE cupos
          SET estado = 'rechazado'
          WHERE id = $1
        `,
        [cupo_id]
      );

      await client.query(
        `
          INSERT INTO auditoria (
            tabla_afectada,
            accion,
            usuario_id,
            datos_nuevos
          )
          VALUES ('cupos', 'UPDATE', $1, $2)
        `,
        [
          actor.userId ?? null,
          JSON.stringify({
            cupo_id,
            estudiante_id: cupo.estudiante_id,
            periodo_origen: cupo.periodo_origen,
            periodo_destino: cupo.periodo_destino,
            estado: 'rechazado',
            resumen: 'Cupo rechazado por el director.',
          }),
        ]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        message: 'Cupo rechazado correctamente.',
        cupo: {
          id: cupo_id,
          estado: 'rechazado',
        },
      });
    }

    /*
      APROBAR:
      1. Revisa materias complementarias si el destino es Período 6.
      2. Aprueba cupo.
      3. Mueve estudiante al período nuevo.
      4. Inscribe materias del período nuevo.
      5. Genera inscripción y seis mensualidades como cuotas pendientes.
      6. Crea el registro de pago de inscripción en verificación.
      7. Cambia el estado del estudiante a deuda.
    */

    if (Number(cupo.periodo_destino) === 6) {
      const complementariasVistas = await client.query(
        `
          SELECT DISTINCT m.id, m.nombre
          FROM materias m
          WHERE m.nombre IN ('IDIOMAS', 'OFICIO')
            AND m.id IN (
              SELECT materia_id
              FROM historial_academico
              WHERE estudiante_id = $1

              UNION

              SELECT materia_id
              FROM inscripciones_materias
              WHERE estudiante_id = $1
                AND activa = true
            )
        `,
        [cupo.estudiante_id]
      );

      if (
        complementariasVistas.rows.length === 0 &&
        !materia_complementaria_id
      ) {
        await client.query('ROLLBACK');

        return NextResponse.json(
          {
            error:
              'El estudiante no ha cursado una materia complementaria (IDIOMAS u OFICIO). Debe seleccionar una antes de avanzar al Período 6.',
          },
          { status: 400 }
        );
      }
    }

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
      configuracion.costo_inscripcion ?? 25
    );

    const montoMensualidad = Number(
      configuracion.monto_mensualidad ?? 50
    );

    if (
      !Number.isFinite(costoInscripcion) ||
      costoInscripcion < 0 ||
      !Number.isFinite(montoMensualidad) ||
      montoMensualidad < 0
    ) {
      await client.query('ROLLBACK');

      return NextResponse.json(
        {
          error:
            'La configuración financiera no es válida. Revise costo_inscripcion y monto_mensualidad.',
        },
        { status: 400 }
      );
    }

    /*
      1. Aprobar el cupo.
    */
    await client.query(
      `
        UPDATE cupos
        SET
          estado = 'aprobado',
          fecha_aprobacion = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [cupo_id]
    );

    /*
      2. Mover al estudiante al período destino.
      Se reinicia fecha_inicio_periodo_actual para separar
      el período anterior del nuevo.
    */
    await client.query(
      `
        UPDATE estudiantes
        SET
          periodo_id = $1,
          fecha_inicio_periodo_actual = CURRENT_DATE,
          estado = 'verificacion',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [cupo.periodo_destino, cupo.estudiante_id]
    );

    /*
      3. Inscribir materias obligatorias del nuevo período.
    */
    const obligatoriasResult = await client.query(
      `
        SELECT materia_id
        FROM periodo_materia
        WHERE periodo_id = $1
          AND es_obligatoria = true
        ORDER BY orden
      `,
      [cupo.periodo_destino]
    );

    for (const materia of obligatoriasResult.rows) {
      await client.query(
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
        `,
        [
          cupo.estudiante_id,
          materia.materia_id,
          cupo.periodo_destino,
        ]
      );
    }

    /*
      4. Si avanza a Período 6 y fue seleccionada una materia
      complementaria, se inscribe también en ese período.
    */
    if (
      Number(cupo.periodo_destino) === 6 &&
      materia_complementaria_id
    ) {
      await client.query(
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
        `,
        [
          cupo.estudiante_id,
          materia_complementaria_id,
          cupo.periodo_destino,
        ]
      );
    }

    /*
      5. Crear cuota de inscripción del nuevo período.
      Una cuota pendiente es una obligación financiera.
      No se borra ningún dato anterior.
    */
    const cuotaInscripcionExiste = await client.query(
      `
        SELECT id
        FROM cuotas
        WHERE estudiante_id = $1
          AND periodo_id = $2
          AND concepto = 'Inscripción'
        LIMIT 1
      `,
      [cupo.estudiante_id, cupo.periodo_destino]
    );

    if (cuotaInscripcionExiste.rows.length === 0) {
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
        [
          cupo.estudiante_id,
          cupo.periodo_destino,
          costoInscripcion,
        ]
      );
    }

    /*
      6. Crear las seis mensualidades inmediatamente.
      Estas son cuotas pendientes del período nuevo.
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

      const cuotaMensualExiste = await client.query(
        `
          SELECT id
          FROM cuotas
          WHERE estudiante_id = $1
            AND periodo_id = $2
            AND mes = $3
            AND ano = $4
          LIMIT 1
        `,
        [
          cupo.estudiante_id,
          cupo.periodo_destino,
          mesCuota,
          anoCuota,
        ]
      );

      if (cuotaMensualExiste.rows.length === 0) {
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
            cupo.estudiante_id,
            cupo.periodo_destino,
            `Mensualidad ${indice + 1} - Período ${cupo.periodo_destino}`,
            montoMensualidad,
            fechaVencimiento.toISOString().slice(0, 10),
            mesCuota,
            anoCuota,
          ]
        );
      }
    }

    /*
      7. Crear el registro inicial de pago de inscripción.
      Aún no está confirmado: espera que administración lo confirme.
      El concepto coincide exactamente con la cuota para que la API
      de pagos pueda marcarla como pagada.
    */
    const pagoInscripcionExiste = await client.query(
      `
        SELECT id
        FROM pagos
        WHERE estudiante_id = $1
          AND periodo_id = $2
          AND tipo = 'inscripcion'
        LIMIT 1
      `,
      [cupo.estudiante_id, cupo.periodo_destino]
    );

    if (pagoInscripcionExiste.rows.length === 0) {
      await client.query(
        `
          INSERT INTO pagos (
            estudiante_id,
            tipo,
            concepto,
            monto,
            metodo_pago,
            estado,
            fecha_pago,
            periodo_id
          )
          VALUES (
            $1,
            'inscripcion',
            'Inscripción',
            $3,
            'Pendiente',
            'verificacion',
            CURRENT_DATE,
            $2
          )
        `,
        [
          cupo.estudiante_id,
          cupo.periodo_destino,
          costoInscripcion,
        ]
      );
    }
    await client.query(
      `
        UPDATE estudiantes
        SET
          estado = 'deuda',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [cupo.estudiante_id]
    );

    /*
      9. Auditoría de la aprobación.
    */
    await client.query(
      `
        INSERT INTO auditoria (
          tabla_afectada,
          accion,
          usuario_id,
          datos_nuevos
        )
        VALUES ('cupos', 'UPDATE', $1, $2)
      `,
      [
        actor.userId ?? null,
        JSON.stringify({
          cupo_id,
          estudiante_id: cupo.estudiante_id,
          periodo_origen: cupo.periodo_origen,
          periodo_destino: cupo.periodo_destino,
          estado: 'aprobado',
          costo_inscripcion: costoInscripcion,
          monto_mensualidad: montoMensualidad,
          cuotas_generadas: 7,
          resumen:
            'Cupo aprobado. Se generó una cuota de inscripción y seis mensualidades pendientes para el nuevo período.',
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message:
        'Cupo aprobado. El estudiante avanzó de período y se generaron la inscripción más seis mensualidades pendientes.',
      cupo: {
        id: cupo_id,
        estado: 'aprobado',
      },
      data: {
        estudiante_id: cupo.estudiante_id,
        periodo_origen: cupo.periodo_origen,
        periodo_destino: cupo.periodo_destino,
        costo_inscripcion: costoInscripcion,
        monto_mensualidad: montoMensualidad,
        cuotas_generadas: 7,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error PATCH cupos:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo procesar el cupo.',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}