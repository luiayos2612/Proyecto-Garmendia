BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- =========================================================
-- 1. EXIGIR QUE LA LIMPIEZA SIGA VIGENTE
-- =========================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.estudiantes)
     OR EXISTS (SELECT 1 FROM public.inscripciones_materias)
     OR EXISTS (SELECT 1 FROM public.calificaciones)
     OR EXISTS (SELECT 1 FROM public.historial_academico)
     OR EXISTS (SELECT 1 FROM public.cupos)
     OR EXISTS (SELECT 1 FROM public.cuotas)
     OR EXISTS (SELECT 1 FROM public.pagos)
     OR EXISTS (SELECT 1 FROM public.intentos_academicos)
     OR EXISTS (SELECT 1 FROM public.tutorias_academicas)
     OR EXISTS (SELECT 1 FROM public.evaluaciones_academicas)
  THEN
    RAISE EXCEPTION
      'Esta migración requiere las tablas de estudiantes y movimientos vacías. No se realizaron cambios.';
  END IF;
END
$$;

-- =========================================================
-- 2. CLAVES DE REFERENCIA DE LOS INTENTOS
-- =========================================================

ALTER TABLE public.intentos_academicos
  ADD CONSTRAINT intento_identidad_estudiante_periodo
  UNIQUE (id, estudiante_id, periodo_id);

-- =========================================================
-- 3. INSCRIPCIONES POR INTENTO
-- =========================================================

ALTER TABLE public.inscripciones_materias
  ALTER COLUMN intento_id SET NOT NULL,
  ALTER COLUMN periodo_id SET NOT NULL,
  ALTER COLUMN activa SET NOT NULL;

ALTER TABLE public.inscripciones_materias
  DROP CONSTRAINT inscripciones_materias_unique;

ALTER TABLE public.inscripciones_materias
  ADD CONSTRAINT inscripcion_contexto_intento_fk
  FOREIGN KEY (
    intento_id,
    estudiante_id,
    periodo_id
  )
  REFERENCES public.intentos_academicos (
    id,
    estudiante_id,
    periodo_id
  );

ALTER TABLE public.inscripciones_materias
  ADD CONSTRAINT inscripcion_identidad_academica
  UNIQUE (
    id,
    intento_id,
    estudiante_id,
    materia_id
  );

ALTER TABLE public.inscripciones_materias
  ADD CONSTRAINT inscripcion_identidad_historica
  UNIQUE (
    id,
    intento_id,
    estudiante_id,
    materia_id,
    periodo_id
  );

CREATE UNIQUE INDEX materia_regular_unica_por_intento
  ON public.inscripciones_materias (
    intento_id,
    materia_id
  )
  WHERE tipo_inscripcion = 'regular';

-- El índice una_tutoria_por_intento ya fue creado
-- en la migración de estructura.
-- Permite distinguir la materia regular de su tutoría.

-- =========================================================
-- 4. CALIFICACIÓN VIGENTE POR INSCRIPCIÓN
-- =========================================================

ALTER TABLE public.calificaciones
  ALTER COLUMN intento_id SET NOT NULL,
  ALTER COLUMN inscripcion_id SET NOT NULL;

ALTER TABLE public.calificaciones
  DROP CONSTRAINT calificacion_unica;

ALTER TABLE public.calificaciones
  ADD CONSTRAINT calificacion_unica_por_inscripcion
  UNIQUE (inscripcion_id);

ALTER TABLE public.calificaciones
  ADD CONSTRAINT calificacion_contexto_inscripcion_fk
  FOREIGN KEY (
    inscripcion_id,
    intento_id,
    estudiante_id,
    materia_id
  )
  REFERENCES public.inscripciones_materias (
    id,
    intento_id,
    estudiante_id,
    materia_id
  );

ALTER TABLE public.calificaciones
  ADD CONSTRAINT calificacion_resultado_obligatorio
  CHECK (
    (
      nota IS NOT NULL
      AND resultado_cualitativo IS NULL
    )
    OR
    (
      nota IS NULL
      AND resultado_cualitativo IS NOT NULL
    )
  );

-- Las restricciones de rango 1–5 y nomenclaturas AP/IN
-- existentes se conservan.

-- =========================================================
-- 5. HISTORIAL POR INSCRIPCIÓN
-- =========================================================

ALTER TABLE public.historial_academico
  ALTER COLUMN intento_id SET NOT NULL,
  ALTER COLUMN inscripcion_id SET NOT NULL;

ALTER TABLE public.historial_academico
  DROP CONSTRAINT historial_academico_unico;

ALTER TABLE public.historial_academico
  ADD CONSTRAINT historial_unico_por_inscripcion
  UNIQUE (inscripcion_id);

ALTER TABLE public.historial_academico
  ADD CONSTRAINT historial_contexto_inscripcion_fk
  FOREIGN KEY (
    inscripcion_id,
    intento_id,
    estudiante_id,
    materia_id,
    periodo_id
  )
  REFERENCES public.inscripciones_materias (
    id,
    intento_id,
    estudiante_id,
    materia_id,
    periodo_id
  );

-- =========================================================
-- 6. CUOTAS POR INTENTO
-- =========================================================

ALTER TABLE public.cuotas
  ADD COLUMN tipo_cuota VARCHAR(15) NOT NULL
    CHECK (
      tipo_cuota IN (
        'inscripcion',
        'mensualidad',
        'otro'
      )
    ),

  ALTER COLUMN intento_id SET NOT NULL,
  ALTER COLUMN periodo_id SET NOT NULL;

ALTER TABLE public.cuotas
  DROP CONSTRAINT cuotas_estudiante_periodo_mes_ano_key;

ALTER TABLE public.cuotas
  ADD CONSTRAINT cuota_contexto_intento_fk
  FOREIGN KEY (
    intento_id,
    estudiante_id,
    periodo_id
  )
  REFERENCES public.intentos_academicos (
    id,
    estudiante_id,
    periodo_id
  );

ALTER TABLE public.cuotas
  ADD CONSTRAINT cuota_numero_mensualidad_coherente
  CHECK (
    (
      tipo_cuota = 'mensualidad'
      AND numero_mensualidad IS NOT NULL
    )
    OR
    (
      tipo_cuota IN ('inscripcion', 'otro')
      AND numero_mensualidad IS NULL
    )
  );

CREATE UNIQUE INDEX una_inscripcion_financiera_por_estudiante
  ON public.cuotas (estudiante_id)
  WHERE tipo_cuota = 'inscripcion';

-- mensualidad_unica_por_intento ya existe.
-- Su combinación intento_id + numero_mensualidad
-- evita duplicar las mensualidades 1 a 6 de un intento.

-- =========================================================
-- 7. PAGOS POR INTENTO
-- =========================================================

ALTER TABLE public.pagos
  ALTER COLUMN intento_id SET NOT NULL,
  ALTER COLUMN periodo_id SET NOT NULL;

ALTER TABLE public.pagos
  ADD CONSTRAINT pago_contexto_intento_fk
  FOREIGN KEY (
    intento_id,
    estudiante_id,
    periodo_id
  )
  REFERENCES public.intentos_academicos (
    id,
    estudiante_id,
    periodo_id
  );

ALTER TABLE public.pagos
  ADD CONSTRAINT pago_identidad_estudiante_intento
  UNIQUE (
    id,
    intento_id,
    estudiante_id
  );

ALTER TABLE public.cuotas
  ADD CONSTRAINT cuota_pago_mismo_estudiante_intento_fk
  FOREIGN KEY (
    pago_id,
    intento_id,
    estudiante_id
  )
  REFERENCES public.pagos (
    id,
    intento_id,
    estudiante_id
  );

-- Esta relación permite pago_id NULL.
-- Si se asigna un pago a una cuota, debe pertenecer
-- al mismo alumno y al mismo intento.

-- =========================================================
-- 8. CUPOS Y TRANSICIONES POR INTENTO
-- =========================================================

ALTER TABLE public.cupos
  ALTER COLUMN intento_origen_id SET NOT NULL,
  ALTER COLUMN tipo_transicion SET NOT NULL;

ALTER TABLE public.cupos
  DROP CONSTRAINT cupos_estudiante_periodo_destino_unique;

ALTER TABLE public.cupos
  ADD CONSTRAINT cupo_contexto_origen_fk
  FOREIGN KEY (
    intento_origen_id,
    estudiante_id,
    periodo_origen
  )
  REFERENCES public.intentos_academicos (
    id,
    estudiante_id,
    periodo_id
  );

ALTER TABLE public.cupos
  ADD CONSTRAINT cupo_contexto_destino_fk
  FOREIGN KEY (
    intento_destino_id,
    estudiante_id,
    periodo_destino
  )
  REFERENCES public.intentos_academicos (
    id,
    estudiante_id,
    periodo_id
  );

ALTER TABLE public.cupos
  ADD CONSTRAINT cupo_periodos_segun_transicion
  CHECK (
    (
      tipo_transicion IN (
        'avance',
        'avance_con_tutorias'
      )
      AND periodo_origen BETWEEN 1 AND 5
      AND periodo_destino = periodo_origen + 1
    )
    OR
    (
      tipo_transicion = 'repeticion'
      AND periodo_destino = periodo_origen
    )
    OR
    (
      tipo_transicion IN (
        'recuperacion_final',
        'culminacion'
      )
      AND periodo_origen = 6
      AND periodo_destino = 6
    )
  );

ALTER TABLE public.cupos
  ADD CONSTRAINT cupo_destino_distinto_del_origen
  CHECK (
    intento_destino_id IS NULL
    OR intento_destino_id <> intento_origen_id
  );

ALTER TABLE public.cupos
  ADD CONSTRAINT cupo_aprobado_destino_coherente
  CHECK (
    estado <> 'aprobado'
    OR
    (
      tipo_transicion = 'culminacion'
      AND intento_destino_id IS NULL
    )
    OR
    (
      tipo_transicion <> 'culminacion'
      AND intento_destino_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX cupo_pendiente_unico_por_intento
  ON public.cupos (intento_origen_id)
  WHERE estado = 'pendiente';

CREATE UNIQUE INDEX transicion_aprobada_unica_por_intento
  ON public.cupos (intento_origen_id)
  WHERE estado = 'aprobado';

CREATE UNIQUE INDEX intento_destino_unico_en_cupos
  ON public.cupos (intento_destino_id)
  WHERE intento_destino_id IS NOT NULL;

COMMIT;