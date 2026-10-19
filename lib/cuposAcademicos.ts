import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

import {
  evaluarCierreAcademico,
  ErrorCierreAcademico,
} from '@/lib/cierreAcademico';

import { tipoEvaluacionMateria } from '@/lib/evaluacionMaterias';
import { crearMensualidadesDelIntento } from '@/lib/finanzasAcademicas';
import { obtenerResumenFinanciero } from '@/lib/estadoFinanciero';

interface CupoBase {
  id: string;
  estudiante_id: string;
  intento_origen_id: string;
  estado: string;
}

interface TutoriaPlan {
  tutoria_id: string | null;
  materia_id: string;
  inscripcion_origen_id: string;
  nombre: string;
  periodo_origen: number;
  nota: number | null;
  es_nueva: boolean;
}

export class ErrorCupoAcademico extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function obtenerDetalleCupo(
  client: PoolClient,
  cupo: CupoBase
) {
  const evaluacion =
    await evaluarCierreAcademico(
      client,
      cupo.estudiante_id
    );

  if (
    evaluacion.intento_origen_id !==
    cupo.intento_origen_id
  ) {
    throw new ErrorCupoAcademico(
      409,
      'Este cupo ya no corresponde al intento abierto del alumno.'
    );
  }

  const tipo =
    evaluacion.tipo_transicion;

  let tutorias: TutoriaPlan[] = [];

  if (tipo === 'repeticion') {
    // Se conservan las tutorías anteriores pendientes.
    // Las materias regulares se recursan como regulares.
    tutorias =
      evaluacion.tutorias_pendientes.map(
        (tutoria) => ({
          tutoria_id: tutoria.id,
          materia_id: tutoria.materia_id,
          inscripcion_origen_id:
            tutoria.inscripcion_origen_id,
          nombre: tutoria.nombre,
          periodo_origen:
            Number(tutoria.periodo_origen),
          nota: null,
          es_nueva: false,
        })
      );
  } else if (
    tipo === 'avance_con_tutorias' ||
    tipo === 'recuperacion_final'
  ) {
    tutorias =
      evaluacion.materias_reprobadas.map(
        (materia) => ({
          tutoria_id: null,
          materia_id: materia.materia_id,
          inscripcion_origen_id:
            materia.inscripcion_id,
          nombre: materia.nombre,
          periodo_origen:
            evaluacion.periodo_origen,
          nota: materia.nota,
          es_nueva: true,
        })
      );
  }

  const pendientesIds = new Set<string>(
    evaluacion.complementarias_pendientes.map(
      (materia) => materia.materia_id
    )
  );

  const complementariasResult =
    await client.query(
      `
        SELECT
          m.id,
          m.nombre,
          m.activa,

          EXISTS (
            SELECT 1
            FROM periodo_materia pm
            WHERE pm.materia_id = m.id
              AND pm.periodo_id = $2::integer
              AND pm.es_obligatoria = false
          ) AS configurada_destino,

          ultimo.resultado_cualitativo
            AS ultimo_resultado

        FROM materias m

        LEFT JOIN LATERAL (
          SELECT c.resultado_cualitativo

          FROM calificaciones c
          JOIN inscripciones_materias im
            ON im.id = c.inscripcion_id
          JOIN intentos_academicos ia
            ON ia.id = im.intento_id

          WHERE c.estudiante_id = $1::uuid
            AND c.materia_id = m.id
            AND (
              ia.id = $3::uuid
              OR ia.estado IN ('cerrado', 'culminado')
            )

          ORDER BY
            ia.fecha_inicio DESC,
            ia.created_at DESC,
            c.fecha_cierre DESC,
            c.id DESC
          LIMIT 1
        ) ultimo ON true

        WHERE UPPER(BTRIM(m.nombre))
          IN ('IDIOMAS', 'OFICIO')

        ORDER BY m.nombre
      `,
      [
        cupo.estudiante_id,
        evaluacion.periodo_destino,
        evaluacion.intento_origen_id,
      ]
    );

  const obligatorio =
    evaluacion.periodo_destino === 6 &&
    tipo !== 'culminacion';

  const complementarias =
    complementariasResult.rows.map(
      (materia) => {
        const aprobada =
          !pendientesIds.has(materia.id);

        const disponible =
          !aprobada &&
          materia.activa === true &&
          materia.configurada_destino === true &&
          tipo !== 'culminacion';

        return {
          materia_id: materia.id,
          nombre: materia.nombre,
          aprobada,
          disponible,
          obligatoria:
            obligatorio && !aprobada,
          ultimo_resultado:
            materia.ultimo_resultado ?? null,
          descripcion: aprobada
            ? 'AP — Aprobada anteriormente'
            : materia.ultimo_resultado === 'IN'
              ? 'IN — Pendiente de aprobación'
              : 'Sin aprobación registrada',
        };
      }
    );

  const bloqueos = [
    ...evaluacion.bloqueos,
  ];

  if (tutorias.length > 2) {
    bloqueos.push(
      'La transición generaría más de dos tutorías.'
    );
  }

  if (
    complementarias.some(
      (materia) =>
        materia.obligatoria &&
        !materia.disponible
    )
  ) {
    bloqueos.push(
      'Hay complementarias obligatorias que no están activas o configuradas para el destino.'
    );
  }

  const contenidoVersion = {
    intento: evaluacion.intento_origen_id,
    tipo,
    destino: evaluacion.periodo_destino,

    materias: evaluacion.materias
      .map((materia) => ({
        id: materia.inscripcion_id,
        nota: materia.nota,
        resultado:
          materia.resultado_cualitativo,
        estado_tutoria:
          materia.estado_tutoria,
      }))
      .sort((a, b) =>
        a.id.localeCompare(b.id)
      ),

    tutorias: tutorias
      .map((tutoria) => ({
        origen:
          tutoria.inscripcion_origen_id,
        nueva: tutoria.es_nueva,
      }))
      .sort((a, b) =>
        a.origen.localeCompare(b.origen)
      ),

    complementarias: complementarias.map(
      (materia) => ({
        id: materia.materia_id,
        aprobada: materia.aprobada,
        disponible: materia.disponible,
        obligatoria: materia.obligatoria,
      })
    ),

    saldo: evaluacion.financiero.deuda_total,
    inscripcion_pagada:
      evaluacion.financiero.inscripcion_pagada,

    bloqueos,
  };

  const version = createHash('sha256')
    .update(JSON.stringify(contenidoVersion))
    .digest('hex');

  return {
    evaluacion,
    tipo_transicion: tipo,
    periodo_destino:
      evaluacion.periodo_destino,
    tutorias,
    complementarias,
    bloqueos,
    puede_procesar:
      bloqueos.length === 0,
    version_evaluacion: version,
  };
}

export async function ejecutarCupoAcademico(
  client: PoolClient,
  datos: {
    cupoId: string;
    usuarioId: string;
    version: string;
    complementarias: string[];
  }
) {
  const referenciaResult =
    await client.query(
      `
        SELECT *
        FROM cupos
        WHERE id = $1::uuid
      `,
      [datos.cupoId]
    );

  if (referenciaResult.rows.length !== 1) {
    throw new ErrorCupoAcademico(
      404,
      'Cupo no encontrado.'
    );
  }

  const referencia =
    referenciaResult.rows[0];

  if (referencia.estado === 'aprobado') {
    return {
      success: true,
      message:
        'El cupo ya estaba aprobado. No se repitió la operación.',
      cupo: referencia,
    };
  }

  if (referencia.estado !== 'pendiente') {
    throw new ErrorCupoAcademico(
      409,
      'El cupo ya no está pendiente.'
    );
  }

  // El evaluador bloquea alumno e intento.
  const detalle = await obtenerDetalleCupo(
    client,
    referencia
  );

  const cupoBloqueadoResult =
    await client.query(
      `
        SELECT *
        FROM cupos
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      [datos.cupoId]
    );

  const cupo =
    cupoBloqueadoResult.rows[0];

  if (!cupo || cupo.estado !== 'pendiente') {
    throw new ErrorCupoAcademico(
      409,
      'El cupo cambió mientras se procesaba. Recargue la pantalla.'
    );
  }

  if (!detalle.puede_procesar) {
    throw new ErrorCupoAcademico(
      409,
      detalle.bloqueos.join(' ')
    );
  }

  if (
    datos.version !==
    detalle.version_evaluacion
  ) {
    throw new ErrorCupoAcademico(
      409,
      'Las notas o los requisitos cambiaron. Actualice Cupos y revise nuevamente la decisión.'
    );
  }

  const seleccion = Array.from(
    new Set(
      datos.complementarias.map(
        (id) => id.toLowerCase()
      )
    )
  );

  if (
    seleccion.length !==
      datos.complementarias.length ||
    seleccion.length > 2
  ) {
    throw new ErrorCupoAcademico(
      400,
      'La selección de complementarias contiene duplicados o supera dos materias.'
    );
  }

  const disponibles = new Set(
    detalle.complementarias
      .filter(
        (materia) => materia.disponible
      )
      .map(
        (materia) => materia.materia_id
      )
  );

  if (
    seleccion.some(
      (id) => !disponibles.has(id)
    )
  ) {
    throw new ErrorCupoAcademico(
      409,
      'Una complementaria seleccionada ya está aprobada o no está disponible.'
    );
  }

  const obligatorias =
    detalle.complementarias.filter(
      (materia) => materia.obligatoria
    );

  if (
    obligatorias.some(
      (materia) =>
        !seleccion.includes(
          materia.materia_id
        )
    )
  ) {
    throw new ErrorCupoAcademico(
      400,
      'Debe inscribir todas las complementarias pendientes al ingresar o continuar en el período 6.'
    );
  }

  const evaluacion =
    detalle.evaluacion;

  const tipo =
    detalle.tipo_transicion;

  // Guardar el resultado del intento que se cierra.
  for (const materia of evaluacion.materias) {
    const cualitativa =
      materia.tipo_evaluacion ===
      'cualitativa';

    const estadoMateria =
      cualitativa
        ? materia.resultado_cualitativo === 'AP'
          ? 'aprobada'
          : 'inasistente'
        : Number(materia.nota) >= 3
          ? 'aprobada'
          : 'reprobada';

    await client.query(
      `
        INSERT INTO historial_academico (
          estudiante_id,
          periodo_id,
          materia_id,
          intento_id,
          inscripcion_id,
          nota,
          resultado_cualitativo,
          estado_materia,
          ano_escolar,
          promedio
        )
        VALUES (
          $1::uuid,
          $2::integer,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::numeric,
          $7::varchar,
          $8::varchar,
          $9::varchar,
          $10::numeric
        )
        ON CONFLICT (inscripcion_id)
        DO UPDATE SET
          nota = EXCLUDED.nota,
          resultado_cualitativo =
            EXCLUDED.resultado_cualitativo,
          estado_materia =
            EXCLUDED.estado_materia,
          promedio = EXCLUDED.promedio
      `,
      [
        evaluacion.estudiante_id,
        evaluacion.periodo_origen,
        materia.materia_id,
        evaluacion.intento_origen_id,
        materia.inscripcion_id,
        materia.nota,
        materia.resultado_cualitativo,
        estadoMateria,
        evaluacion.ano_escolar,
        !cualitativa &&
        materia.tipo_inscripcion === 'regular'
          ? evaluacion.promedio_general
          : null,
      ]
    );
  }

  await client.query(
    `
      UPDATE inscripciones_materias
      SET activa = false
      WHERE intento_id = $1::uuid
    `,
    [evaluacion.intento_origen_id]
  );

  await client.query(
    `
      UPDATE intentos_academicos
      SET
        estado = $1::varchar,
        resultado_cierre = $2::varchar,
        fecha_cierre = CURRENT_TIMESTAMP
      WHERE id = $3::uuid
    `,
    [
      tipo === 'culminacion'
        ? 'culminado'
        : 'cerrado',
      tipo,
      evaluacion.intento_origen_id,
    ]
  );

  let intentoDestinoId: string | null =
    null;

  let mensualidadesGeneradas = 0;

  if (tipo !== 'culminacion') {
    const configResult =
      await client.query(
        `
          SELECT clave, valor
          FROM configuracion
          WHERE clave IN (
            'ano_escolar',
            'monto_mensualidad'
          )
        `
      );

    const config: Record<string, string> = {};

    for (const fila of configResult.rows) {
      config[fila.clave] = fila.valor;
    }

    const anoEscolar =
      config.ano_escolar?.trim();

    const montoMensualidad =
      Number(config.monto_mensualidad);

    if (
      !anoEscolar ||
      !/^\d{4}-\d{4}$/.test(anoEscolar) ||
      !Number.isFinite(montoMensualidad) ||
      montoMensualidad <= 0
    ) {
      throw new ErrorCupoAcademico(
        400,
        'Revise el año escolar y el monto de mensualidad de la configuración.'
      );
    }

    const nuevoIntentoResult =
      await client.query(
        `
          INSERT INTO intentos_academicos (
            estudiante_id,
            periodo_id,
            numero_intento,
            ano_escolar,
            estado,
            fecha_inicio
          )
          SELECT
            $1::uuid,
            $2::integer,
            COALESCE(MAX(numero_intento), 0) + 1,
            $3::varchar,
            'en_curso',
            CURRENT_DATE
          FROM intentos_academicos
          WHERE estudiante_id = $1::uuid
            AND periodo_id = $2::integer
          RETURNING *
        `,
        [
          evaluacion.estudiante_id,
          evaluacion.periodo_destino,
          anoEscolar,
        ]
      );

    const nuevoIntento =
      nuevoIntentoResult.rows[0];

    intentoDestinoId =
      nuevoIntento.id;

    let regulares: string[] = [];

    // En recuperación final solo se inscriben
    // las recuperaciones y complementarias pendientes.
    if (tipo !== 'recuperacion_final') {
      const materiasResult =
        await client.query(
          `
            SELECT DISTINCT
              m.id,
              m.nombre
            FROM periodo_materia pm
            JOIN materias m
              ON m.id = pm.materia_id
            WHERE pm.periodo_id = $1::integer
              AND pm.es_obligatoria = true
              AND m.activa = true
          `,
          [evaluacion.periodo_destino]
        );

      regulares = materiasResult.rows
        .filter(
          (materia) =>
            tipoEvaluacionMateria(
              materia.nombre
            ) === 'numerica'
        )
        .map(
          (materia) => materia.id
        );

      if (regulares.length === 0) {
        throw new ErrorCupoAcademico(
          409,
          'El destino no tiene materias regulares configuradas.'
        );
      }
    }

    const inscribir = async (
      materiaId: string,
      tipoInscripcion: 'regular' | 'tutoria',
      tutoriaId: string | null
    ) => {
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
            $1::uuid,
            $2::uuid,
            $3::integer,
            $4::varchar,
            true,
            $5::uuid,
            $6::varchar,
            $7::uuid
          )
        `,
        [
          evaluacion.estudiante_id,
          materiaId,
          evaluacion.periodo_destino,
          anoEscolar,
          nuevoIntento.id,
          tipoInscripcion,
          tutoriaId,
        ]
      );
    };

    for (
      const materiaId of
      new Set([...regulares, ...seleccion])
    ) {
      await inscribir(
        materiaId,
        'regular',
        null
      );
    }

    for (const plan of detalle.tutorias) {
      let tutoriaId = plan.tutoria_id;

      if (plan.es_nueva) {
        const tutoriaResult =
          await client.query(
            `
              INSERT INTO tutorias_academicas (
                estudiante_id,
                materia_id,
                inscripcion_origen_id,
                intento_origen_id,
                estado
              )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                'pendiente'
              )
              RETURNING id
            `,
            [
              evaluacion.estudiante_id,
              plan.materia_id,
              plan.inscripcion_origen_id,
              evaluacion.intento_origen_id,
            ]
          );

        tutoriaId =
          tutoriaResult.rows[0].id;
      }

      if (!tutoriaId) {
        throw new ErrorCupoAcademico(
          409,
          'No se pudo identificar una tutoría del plan.'
        );
      }

      await inscribir(
        plan.materia_id,
        'tutoria',
        tutoriaId
      );
    }

    mensualidadesGeneradas =
      await crearMensualidadesDelIntento(
        client,
        {
          estudianteId:
            evaluacion.estudiante_id,
          intentoId:
            nuevoIntento.id,
          periodoId:
            evaluacion.periodo_destino,
          montoMensualidad,
        }
      );

    if (mensualidadesGeneradas !== 6) {
      throw new ErrorCupoAcademico(
        409,
        'No se generaron las seis mensualidades del nuevo intento.'
      );
    }

    const financiero =
      await obtenerResumenFinanciero(
        client,
        evaluacion.estudiante_id,
        nuevoIntento.id
      );

    await client.query(
      `
        UPDATE estudiantes
        SET
          periodo_id = $1::integer,
          fecha_inicio_periodo_actual =
            CURRENT_DATE,
          estado = $2::varchar,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3::uuid
      `,
      [
        evaluacion.periodo_destino,
        financiero.estado,
        evaluacion.estudiante_id,
      ]
    );
  }

  const actualizadoResult =
    await client.query(
      `
        UPDATE cupos
        SET
          estado = 'aprobado',
          fecha_aprobacion = CURRENT_TIMESTAMP,
          periodo_destino = $1::integer,
          tipo_transicion = $2::varchar,
          intento_destino_id = $3::uuid,
          materias_aprobadas = $4::boolean,
          promedio_general = $5::numeric
        WHERE id = $6::uuid
        RETURNING *
      `,
      [
        evaluacion.periodo_destino,
        tipo,
        intentoDestinoId,
        evaluacion.materias_numericas_aprobadas,
        evaluacion.promedio_general,
        cupo.id,
      ]
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
      datos.usuarioId,
      JSON.stringify({
        cupo: actualizadoResult.rows[0],
        tutorias: detalle.tutorias,
        complementarias_inscritas: seleccion,
        mensualidades_generadas:
          mensualidadesGeneradas,
        nueva_inscripcion_cobrada: false,
        resumen:
          'Transición académica ejecutada con historial e intentos separados.',
      }),
    ]
  );

  return {
    success: true,
    message:
      tipo === 'culminacion'
        ? 'Estudios culminados. No se abrió otro intento ni se generaron mensualidades.'
        : 'Transición completada: materias inscritas y seis mensualidades generadas, sin nueva inscripción.',
    cupo: actualizadoResult.rows[0],
    intento_destino_id: intentoDestinoId,
    mensualidades_generadas:
      mensualidadesGeneradas,
  };
}

export { ErrorCierreAcademico };