import type { PoolClient } from 'pg';
import { tipoEvaluacionMateria } from '@/lib/evaluacionMaterias';

export class ErrorTutoria extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

interface DatosResultadoTutoria {
  inscripcionId: string;
  estudianteId: string;
  nota: number | null;
  usuarioId: string;
}

export async function procesarResultadoTutoria(
  client: PoolClient,
  datos: DatosResultadoTutoria
) {
  const {
    inscripcionId,
    estudianteId,
    nota,
    usuarioId,
  } = datos;

  if (
    nota === null ||
    !Number.isFinite(nota) ||
    nota < 1 ||
    nota > 5
  ) {
    throw new ErrorTutoria(
      400,
      'Una tutoría debe tener una nota numérica entre 1.00 y 5.00.'
    );
  }

  const contextoResult = await client.query(
    `
      SELECT
        actual.id AS inscripcion_actual_id,
        actual.estudiante_id,
        actual.materia_id,
        actual.intento_id AS intento_actual_id,
        actual.tipo_inscripcion,
        actual.activa,

        intento_actual.periodo_id
          AS periodo_actual,
        intento_actual.estado
          AS estado_intento_actual,
        intento_actual.fecha_inicio
          AS fecha_inicio_actual,

        t.id AS tutoria_id,
        t.estado AS estado_tutoria,
        t.nota_final,

        origen.id AS inscripcion_origen_id,
        origen.estudiante_id
          AS estudiante_origen_id,
        origen.materia_id AS materia_origen_id,
        origen.intento_id AS intento_origen_id,
        origen.tipo_inscripcion
          AS tipo_inscripcion_origen,
        origen.periodo_id AS periodo_origen,
        origen.ano_escolar AS ano_escolar_origen,

        intento_origen.estado
          AS estado_intento_origen,
        intento_origen.fecha_inicio
          AS fecha_inicio_origen,

        m.nombre AS materia_nombre,

        nota_origen.nota AS nota_original,
        nota_origen.resultado_cualitativo
          AS resultado_original

      FROM inscripciones_materias actual

      JOIN intentos_academicos intento_actual
        ON intento_actual.id = actual.intento_id

      JOIN tutorias_academicas t
        ON t.id = actual.tutoria_id

      JOIN inscripciones_materias origen
        ON origen.id = t.inscripcion_origen_id

      JOIN intentos_academicos intento_origen
        ON intento_origen.id = t.intento_origen_id

      JOIN materias m
        ON m.id = actual.materia_id

      LEFT JOIN calificaciones nota_origen
        ON nota_origen.inscripcion_id = origen.id

      WHERE actual.id = $1::uuid
        AND actual.estudiante_id = $2::uuid
        AND t.estudiante_id = $2::uuid
        AND t.materia_id = actual.materia_id
        AND origen.intento_id = t.intento_origen_id

      FOR UPDATE OF actual, t, origen
    `,
    [inscripcionId, estudianteId]
  );

  if (contextoResult.rows.length !== 1) {
    throw new ErrorTutoria(
      409,
      'No se encontró una tutoría con un origen académico válido.'
    );
  }

  const contexto = contextoResult.rows[0];

  if (
    contexto.tipo_inscripcion !== 'tutoria' ||
    contexto.activa !== true ||
    contexto.estado_intento_actual !== 'en_curso'
  ) {
    throw new ErrorTutoria(
      409,
      'La tutoría debe estar activa dentro de un intento abierto.'
    );
  }

  if (
    contexto.estudiante_origen_id !== estudianteId ||
    contexto.materia_origen_id !==
      contexto.materia_id ||
    contexto.tipo_inscripcion_origen !== 'regular' ||
    contexto.intento_origen_id ===
      contexto.intento_actual_id
  ) {
    throw new ErrorTutoria(
      409,
      'La tutoría no corresponde a una materia regular de origen válida.'
    );
  }

  if (
    contexto.estado_intento_origen !== 'cerrado' ||
    Number(contexto.periodo_origen) >
      Number(contexto.periodo_actual)
  ) {
    throw new ErrorTutoria(
      409,
      'El intento de origen debe estar cerrado y no puede pertenecer a un período posterior.'
    );
  }

  if (
    tipoEvaluacionMateria(
      contexto.materia_nombre
    ) !== 'numerica'
  ) {
    throw new ErrorTutoria(
      400,
      'Las materias complementarias no pueden generar tutorías.'
    );
  }

  if (
    contexto.nota_original === null ||
    contexto.resultado_original !== null ||
    !Number.isFinite(
      Number(contexto.nota_original)
    ) ||
    Number(contexto.nota_original) >= 3
  ) {
    throw new ErrorTutoria(
      409,
      'La inscripción de origen no tiene una nota numérica reprobada compatible.'
    );
  }

  // No reabrir silenciosamente una obligación ya aprobada.
  if (contexto.estado_tutoria === 'aprobada') {
    if (
      Number(contexto.nota_final) !== nota
    ) {
      throw new ErrorTutoria(
        409,
        'Esta tutoría ya fue aprobada. Cambiar su resultado final requiere una revisión administrativa.'
      );
    }

    return {
      tutoria_id: contexto.tutoria_id,
      aprobada: true,
      inscripcion_origen_id:
        contexto.inscripcion_origen_id,
      nota_final: Number(contexto.nota_final),
      sin_cambio_de_resultado: true,
    };
  }

  // Una nota menor que 3 se conserva en la inscripción
  // de tutoría y en evaluaciones_academicas por el POST.
  // La obligación continúa pendiente.
  if (nota < 3) {
    return {
      tutoria_id: contexto.tutoria_id,
      aprobada: false,
      inscripcion_origen_id:
        contexto.inscripcion_origen_id,
      nota_final: null,
      nota_intento_tutoria: nota,
    };
  }

  await client.query(
    `
      UPDATE tutorias_academicas
      SET
        estado = 'aprobada',
        nota_final = $1::numeric,
        fecha_aprobacion = CURRENT_TIMESTAMP
      WHERE id = $2::uuid
    `,
    [nota, contexto.tutoria_id]
  );

  // Actualizar el resultado histórico de la inscripción
  // original, no el de una materia regular del período actual.
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
        ano_escolar
      )
      VALUES (
        $1::uuid,
        $2::integer,
        $3::uuid,
        $4::uuid,
        $5::uuid,
        $6::numeric,
        NULL,
        'aprobada',
        $7::varchar
      )
      ON CONFLICT (inscripcion_id)
      DO UPDATE SET
        nota = EXCLUDED.nota,
        resultado_cualitativo = NULL,
        estado_materia = 'aprobada'
    `,
    [
      estudianteId,
      contexto.periodo_origen,
      contexto.materia_id,
      contexto.intento_origen_id,
      contexto.inscripcion_origen_id,
      nota,
      contexto.ano_escolar_origen,
    ]
  );

  // Recalcular el promedio del intento de origen
  // utilizando resultados finales de sus materias regulares.
  const resultadosOrigen = await client.query(
    `
      SELECT
        m.nombre AS materia_nombre,
        COALESCE(
          recuperacion.nota_final,
          c.nota
        ) AS nota_vigente
      FROM inscripciones_materias im

      JOIN materias m
        ON m.id = im.materia_id

      LEFT JOIN calificaciones c
        ON c.inscripcion_id = im.id

      LEFT JOIN tutorias_academicas recuperacion
        ON recuperacion.inscripcion_origen_id = im.id
       AND recuperacion.estado = 'aprobada'

      WHERE im.intento_id = $1::uuid
        AND im.estudiante_id = $2::uuid
        AND im.tipo_inscripcion = 'regular'
    `,
    [
      contexto.intento_origen_id,
      estudianteId,
    ]
  );

  const numericas =
    resultadosOrigen.rows.filter(
      (fila) =>
        tipoEvaluacionMateria(
          fila.materia_nombre
        ) === 'numerica'
    );

  if (
    numericas.length === 0 ||
    numericas.some(
      (fila) =>
        fila.nota_vigente === null ||
        !Number.isFinite(
          Number(fila.nota_vigente)
        )
    )
  ) {
    throw new ErrorTutoria(
      409,
      'El intento de origen tiene resultados incompletos. Se canceló la recuperación.'
    );
  }

  const suma = numericas.reduce(
    (total, fila) =>
      total + Number(fila.nota_vigente),
    0
  );

  const promedio = Number(
    (suma / numericas.length).toFixed(2)
  );

  await client.query(
    `
      UPDATE historial_academico
      SET promedio = $1::numeric
      WHERE intento_id = $2::uuid
        AND estudiante_id = $3::uuid
        AND nota IS NOT NULL
    `,
    [
      promedio,
      contexto.intento_origen_id,
      estudianteId,
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
      VALUES (
        'tutorias_academicas',
        'UPDATE',
        $1,
        $2
      )
    `,
    [
      usuarioId,
      JSON.stringify({
        tutoria_id: contexto.tutoria_id,
        estudiante_id: estudianteId,
        inscripcion_tutoria_id: inscripcionId,
        inscripcion_origen_id:
          contexto.inscripcion_origen_id,
        intento_origen_id:
          contexto.intento_origen_id,
        periodo_origen:
          contexto.periodo_origen,
        nota_original:
          Number(contexto.nota_original),
        nota_final: nota,
        promedio_origen_actualizado: promedio,
        resumen:
          'Tutoría aprobada. Resultado de origen recuperado sin borrar la evaluación inicial.',
      }),
    ]
  );

  return {
    tutoria_id: contexto.tutoria_id,
    aprobada: true,
    inscripcion_origen_id:
      contexto.inscripcion_origen_id,
    nota_final: nota,
    promedio_origen_actualizado: promedio,
  };
}