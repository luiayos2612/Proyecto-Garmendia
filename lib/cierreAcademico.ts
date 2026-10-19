import type { PoolClient } from 'pg';

import {
  tipoEvaluacionMateria,
  validarResultadoMateria,
} from '@/lib/evaluacionMaterias';

import {
  obtenerResumenFinanciero,
} from '@/lib/estadoFinanciero';

export type TipoTransicionAcademica =
  | 'avance'
  | 'avance_con_tutorias'
  | 'repeticion'
  | 'recuperacion_final'
  | 'culminacion';

export class ErrorCierreAcademico extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

interface MateriaCierre {
  inscripcion_id: string;
  materia_id: string;
  nombre: string;
  tipo_inscripcion: 'regular' | 'tutoria';
  tutoria_id: string | null;
  estado_tutoria: string | null;
  nota: number | null;
  resultado_cualitativo: string | null;
  tipo_evaluacion: 'numerica' | 'cualitativa';
}

export async function evaluarCierreAcademico(
  client: PoolClient,
  estudianteId: string
) {
  // El llamador debe ejecutar esta función dentro
  // de una transacción.
  const estudianteResult = await client.query(
    `
      SELECT
        id,
        nombres,
        apellidos,
        periodo_id,
        activo
      FROM estudiantes
      WHERE id = $1::uuid
      FOR UPDATE
    `,
    [estudianteId]
  );

  if (estudianteResult.rows.length !== 1) {
    throw new ErrorCierreAcademico(
      404,
      'Estudiante no encontrado.'
    );
  }

  const estudiante =
    estudianteResult.rows[0];

  if (estudiante.activo !== true) {
    throw new ErrorCierreAcademico(
      409,
      'El estudiante está inactivo.'
    );
  }

  const intentoResult = await client.query(
    `
      SELECT *
      FROM intentos_academicos
      WHERE estudiante_id = $1::uuid
        AND estado = 'en_curso'
      FOR UPDATE
    `,
    [estudianteId]
  );

  if (intentoResult.rows.length !== 1) {
    throw new ErrorCierreAcademico(
      409,
      'No existe un único intento académico abierto.'
    );
  }

  const intento =
    intentoResult.rows[0];

  const periodoActual =
    Number(intento.periodo_id);

  if (
    periodoActual !==
      Number(estudiante.periodo_id) ||
    periodoActual < 1 ||
    periodoActual > 6
  ) {
    throw new ErrorCierreAcademico(
      409,
      'El período del estudiante y su intento no coinciden.'
    );
  }

  const entradaResult = await client.query(
    `
      SELECT tipo_transicion
      FROM cupos
      WHERE intento_destino_id = $1::uuid
        AND estado = 'aprobado'
    `,
    [intento.id]
  );

  const esIntentoRecuperacionFinal =
    entradaResult.rows[0]?.tipo_transicion ===
    'recuperacion_final';

  const inscripcionesResult =
    await client.query(
      `
        SELECT
          im.id AS inscripcion_id,
          im.materia_id,
          im.tipo_inscripcion,
          im.tutoria_id,
          m.nombre,
          t.estado AS estado_tutoria,
          c.nota,
          c.resultado_cualitativo
        FROM inscripciones_materias im

        JOIN materias m
          ON m.id = im.materia_id

        LEFT JOIN tutorias_academicas t
          ON t.id = im.tutoria_id

        LEFT JOIN calificaciones c
          ON c.inscripcion_id = im.id

        WHERE im.estudiante_id = $1::uuid
          AND im.intento_id = $2::uuid
          AND im.activa = true

        ORDER BY m.nombre, im.id
        FOR UPDATE OF im
      `,
      [estudianteId, intento.id]
    );

  const materias: MateriaCierre[] =
    inscripcionesResult.rows.map(
      (fila) => ({
        inscripcion_id:
          fila.inscripcion_id,
        materia_id:
          fila.materia_id,
        nombre:
          fila.nombre,
        tipo_inscripcion:
          fila.tipo_inscripcion,
        tutoria_id:
          fila.tutoria_id,
        estado_tutoria:
          fila.estado_tutoria,
        nota:
          fila.nota == null
            ? null
            : Number(fila.nota),
        resultado_cualitativo:
          fila.resultado_cualitativo,
        tipo_evaluacion:
          tipoEvaluacionMateria(
            fila.nombre
          ),
      })
    );

  const bloqueos: string[] = [];

  if (materias.length === 0) {
    bloqueos.push(
      'El intento no tiene inscripciones activas.'
    );
  }

  const sinResultado = materias.filter(
    (materia) =>
      materia.tipo_evaluacion === 'cualitativa'
        ? !['AP', 'IN'].includes(
            materia.resultado_cualitativo || ''
          )
        : materia.nota === null
  );

  if (sinResultado.length > 0) {
    bloqueos.push(
      'Falta calificar: ' +
        sinResultado
          .map((materia) => materia.nombre)
          .join(', ') +
        '.'
    );
  }

  for (const materia of materias) {
    const validacion =
      validarResultadoMateria(
        materia.nombre,
        materia.nota,
        materia.resultado_cualitativo
      );

    if (
      !validacion.ok &&
      !sinResultado.some(
        (fila) =>
          fila.inscripcion_id ===
          materia.inscripcion_id
      )
    ) {
      bloqueos.push(
        `${materia.nombre}: ${validacion.error}`
      );
    }

    if (
      materia.tipo_inscripcion === 'tutoria' &&
      materia.tipo_evaluacion === 'cualitativa'
    ) {
      bloqueos.push(
        'Una complementaria aparece incorrectamente como tutoría.'
      );
    }

    if (
      materia.tipo_inscripcion === 'tutoria' &&
      !materia.tutoria_id
    ) {
      bloqueos.push(
        `La tutoría de ${materia.nombre} no tiene una obligación vinculada.`
      );
    }

    if (
      materia.tipo_inscripcion === 'tutoria' &&
      materia.nota !== null &&
      materia.nota >= 3 &&
      materia.estado_tutoria !== 'aprobada'
    ) {
      bloqueos.push(
        `La nota de ${materia.nombre} es aprobatoria, ` +
          'pero su obligación de tutoría sigue pendiente.'
      );
    }

    if (
      materia.tipo_inscripcion === 'tutoria' &&
      materia.estado_tutoria === 'aprobada' &&
      (
        materia.nota === null ||
        materia.nota < 3
      )
    ) {
      bloqueos.push(
        `El resultado de la tutoría de ${materia.nombre} es inconsistente.`
      );
    }
  }

  const tutoriasDelIntento =
    materias.filter(
      (materia) =>
        materia.tipo_inscripcion === 'tutoria'
    );

  if (tutoriasDelIntento.length > 2) {
    bloqueos.push(
      'El intento tiene más de dos tutorías inscritas.'
    );
  }

  const regularesNumericas =
    materias.filter(
      (materia) =>
        materia.tipo_inscripcion === 'regular' &&
        materia.tipo_evaluacion === 'numerica'
    );

  // En una recuperación final puede haber únicamente
  // tutorías y/o complementarias pendientes.
  if (!esIntentoRecuperacionFinal) {
    const obligatoriasResult =
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
        [periodoActual]
      );

    const obligatoriasNumericas =
      obligatoriasResult.rows.filter(
        (materia) =>
          tipoEvaluacionMateria(
            materia.nombre
          ) === 'numerica'
      );

    if (
      obligatoriasNumericas.length === 0
    ) {
      bloqueos.push(
        'El período no tiene materias numéricas obligatorias configuradas.'
      );
    }

    const idsInscritas = new Set(
      regularesNumericas.map(
        (materia) => materia.materia_id
      )
    );

    const faltantes =
      obligatoriasNumericas.filter(
        (materia) =>
          !idsInscritas.has(materia.id)
      );

    if (faltantes.length > 0) {
      bloqueos.push(
        'Faltan inscripciones obligatorias: ' +
          faltantes
            .map((materia) => materia.nombre)
            .join(', ') +
          '.'
      );
    }
  }

  const reprobadas =
    regularesNumericas.filter(
      (materia) =>
        materia.nota !== null &&
        materia.nota < 3
    );

  const tutoriasPendientesResult =
    await client.query(
      `
        SELECT
          t.id,
          t.materia_id,
          t.inscripcion_origen_id,
          origen.periodo_id AS periodo_origen,
          m.nombre
        FROM tutorias_academicas t

        JOIN intentos_academicos origen
          ON origen.id = t.intento_origen_id

        JOIN materias m
          ON m.id = t.materia_id

        WHERE t.estudiante_id = $1::uuid
          AND t.estado = 'pendiente'

        ORDER BY origen.periodo_id, m.nombre
      `,
      [estudianteId]
    );

  const tutoriasPendientes =
    tutoriasPendientesResult.rows;

  // Una obligación anterior no puede desaparecer de
  // la evaluación porque faltó inscribir su tutoría.
  for (const tutoria of tutoriasPendientes) {
    if (
      !tutoriasDelIntento.some(
        (materia) =>
          materia.tutoria_id === tutoria.id
      )
    ) {
      bloqueos.push(
        `La tutoría pendiente de ${tutoria.nombre} ` +
          'no está inscrita en el intento actual.'
      );
    }
  }

  const complementariasResult =
    await client.query(
      `
        SELECT id, nombre, activa
        FROM materias
        WHERE UPPER(BTRIM(nombre))
          IN ('IDIOMAS', 'OFICIO')
        ORDER BY nombre
      `
    );

  if (
    complementariasResult.rows.length !== 2
  ) {
    bloqueos.push(
      'Deben existir las materias Idiomas y Oficio en el catálogo.'
    );
  }

  // Comprobar aprobaciones reales, no solo inscripciones.
  const complementariasAprobadasResult =
    await client.query(
      `
        SELECT DISTINCT c.materia_id

        FROM calificaciones c
        JOIN inscripciones_materias im
          ON im.id = c.inscripcion_id
        JOIN intentos_academicos ia
          ON ia.id = im.intento_id

        WHERE c.estudiante_id = $1::uuid
          AND c.resultado_cualitativo = 'AP'
          AND im.tipo_inscripcion = 'regular'
          AND (
            ia.id = $2::uuid
            OR ia.estado IN ('cerrado', 'culminado')
          )

        UNION

        SELECT DISTINCT h.materia_id

        FROM historial_academico h
        JOIN intentos_academicos ia
          ON ia.id = h.intento_id

        WHERE h.estudiante_id = $1::uuid
          AND h.resultado_cualitativo = 'AP'
          AND (
            ia.id = $2::uuid
            OR ia.estado IN ('cerrado', 'culminado')
          )
      `,
      [estudianteId, intento.id]
    );

  const aprobadasIds = new Set<string>(
    complementariasAprobadasResult.rows.map(
      (fila) => fila.materia_id
    )
  );

  const complementariasPendientes =
    complementariasResult.rows
      .filter(
        (materia) =>
          !aprobadasIds.has(materia.id)
      )
      .map((materia) => ({
        materia_id: materia.id,
        nombre: materia.nombre,
        activa: materia.activa,
      }));

  const financiero =
    await obtenerResumenFinanciero(
      client,
      estudianteId,
      intento.id
    );

  if (!financiero.inscripcion_pagada) {
    bloqueos.push(
      'La inscripción inicial todavía no está pagada.'
    );
  }

  if (financiero.deuda_total > 0) {
    bloqueos.push(
      'Debe liquidar el saldo del intento para cerrarlo: ' +
        financiero.deuda_total.toFixed(2) +
        ' USD.'
    );
  }

  const deudaAnteriorResult =
    await client.query(
      `
        SELECT COALESCE(SUM(monto), 0)
          AS deuda_anterior
        FROM cuotas
        WHERE estudiante_id = $1::uuid
          AND intento_id <> $2::uuid
          AND estado IN ('pendiente', 'vencida')
      `,
      [estudianteId, intento.id]
    );

  const deudaAnterior = Number(
    deudaAnteriorResult.rows[0].deuda_anterior
  );

  if (deudaAnterior > 0) {
    bloqueos.push(
      'Existen obligaciones pendientes de intentos anteriores.'
    );
  }

  const cuotasResult = await client.query(
    `
      SELECT COUNT(*) AS cantidad
      FROM cuotas
      WHERE intento_id = $1::uuid
        AND estudiante_id = $2::uuid
        AND tipo_cuota = 'mensualidad'
    `,
    [intento.id, estudianteId]
  );

  if (
    Number(cuotasResult.rows[0].cantidad) !== 6
  ) {
    bloqueos.push(
      'El intento debe tener sus seis mensualidades registradas.'
    );
  }

  let tipoTransicion:
    TipoTransicionAcademica;

  let periodoDestino = periodoActual;

  if (
    tutoriasPendientes.length > 0 ||
    reprobadas.length > 2
  ) {
    tipoTransicion = 'repeticion';
  } else if (periodoActual === 6) {
    tipoTransicion =
      reprobadas.length > 0 ||
      complementariasPendientes.length > 0
        ? 'recuperacion_final'
        : 'culminacion';
  } else {
    periodoDestino = periodoActual + 1;

    tipoTransicion =
      reprobadas.length > 0
        ? 'avance_con_tutorias'
        : 'avance';
  }

  const valoresNumericos =
    regularesNumericas
      .filter(
        (materia) =>
          materia.nota !== null
      )
      .map(
        (materia) =>
          Number(materia.nota)
      );

  const promedioGeneral =
    valoresNumericos.length === 0
      ? null
      : Number(
          (
            valoresNumericos.reduce(
              (suma, nota) => suma + nota,
              0
            ) / valoresNumericos.length
          ).toFixed(2)
        );

  return {
    puede_preparar:
      bloqueos.length === 0,

    bloqueos,

    estudiante_id: estudianteId,
    intento_origen_id: intento.id,
    numero_intento:
      intento.numero_intento,
    ano_escolar:
      intento.ano_escolar,

    periodo_origen: periodoActual,
    periodo_destino: periodoDestino,
    tipo_transicion: tipoTransicion,

    promedio_general: promedioGeneral,

    materias,
    materias_reprobadas: reprobadas,
    tutorias_pendientes: tutoriasPendientes,

    complementarias_pendientes:
      complementariasPendientes,

    materias_numericas_aprobadas:
      reprobadas.length === 0 &&
      tutoriasPendientes.length === 0 &&
      sinResultado.length === 0,

    financiero,
  };
}