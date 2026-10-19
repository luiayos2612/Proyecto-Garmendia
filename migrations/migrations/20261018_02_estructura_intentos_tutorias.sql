BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =========================================================
-- 1. INTENTOS ACADÉMICOS
-- =========================================================

CREATE TABLE public.intentos_academicos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  estudiante_id UUID NOT NULL
    REFERENCES public.estudiantes(id) ON DELETE CASCADE,

  periodo_id INTEGER NOT NULL
    REFERENCES public.periodos(numero),

  numero_intento INTEGER NOT NULL
    CHECK (numero_intento >= 1),

  ano_escolar VARCHAR(10),

  estado VARCHAR(20) NOT NULL DEFAULT 'en_curso'
    CHECK (estado IN ('en_curso', 'cerrado', 'culminado')),

  resultado_cierre VARCHAR(30)
    CHECK (
      resultado_cierre IN (
        'avance',
        'avance_con_tutorias',
        'repeticion',
        'recuperacion_final',
        'culminacion'
      )
    ),

  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT intento_academico_unico
    UNIQUE (estudiante_id, periodo_id, numero_intento),

  CONSTRAINT intento_cierre_coherente CHECK (
    (
      estado = 'en_curso'
      AND fecha_cierre IS NULL
      AND resultado_cierre IS NULL
    )
    OR
    (
      estado IN ('cerrado', 'culminado')
      AND fecha_cierre IS NOT NULL
      AND resultado_cierre IS NOT NULL
    )
  ),

  CONSTRAINT intento_culminacion_coherente CHECK (
    (estado = 'culminado') = (resultado_cierre = 'culminacion')
    OR (
      estado = 'en_curso'
      AND resultado_cierre IS NULL
    )
  )
);

CREATE UNIQUE INDEX un_intento_en_curso_por_estudiante
  ON public.intentos_academicos (estudiante_id)
  WHERE estado = 'en_curso';

CREATE INDEX idx_intentos_estudiante_periodo
  ON public.intentos_academicos (
    estudiante_id,
    periodo_id
  );

-- =========================================================
-- 2. VINCULAR INSCRIPCIONES CON SU INTENTO
-- =========================================================

ALTER TABLE public.inscripciones_materias
  ADD COLUMN intento_id UUID
    REFERENCES public.intentos_academicos(id),

  ADD COLUMN tipo_inscripcion VARCHAR(15)
    NOT NULL DEFAULT 'regular'
    CHECK (tipo_inscripcion IN ('regular', 'tutoria'));

CREATE INDEX idx_inscripciones_intento
  ON public.inscripciones_materias (intento_id);

-- =========================================================
-- 3. OBLIGACIONES DE TUTORÍA
-- =========================================================

CREATE TABLE public.tutorias_academicas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  estudiante_id UUID NOT NULL
    REFERENCES public.estudiantes(id) ON DELETE CASCADE,

  materia_id UUID NOT NULL
    REFERENCES public.materias(id),

  inscripcion_origen_id UUID NOT NULL
    REFERENCES public.inscripciones_materias(id),

  intento_origen_id UUID NOT NULL
    REFERENCES public.intentos_academicos(id),

  estado VARCHAR(15) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aprobada')),

  nota_final NUMERIC(4,2),

  fecha_aprobacion TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT tutoria_origen_unico
    UNIQUE (inscripcion_origen_id),

  CONSTRAINT tutoria_resultado_coherente CHECK (
    (
      estado = 'pendiente'
      AND nota_final IS NULL
      AND fecha_aprobacion IS NULL
    )
    OR
    (
      estado = 'aprobada'
      AND nota_final IS NOT NULL
      AND nota_final >= 3
      AND nota_final <= 5
      AND fecha_aprobacion IS NOT NULL
    )
  )
);

CREATE INDEX idx_tutorias_estudiante_estado
  ON public.tutorias_academicas (
    estudiante_id,
    estado
  );

ALTER TABLE public.inscripciones_materias
  ADD COLUMN tutoria_id UUID
    REFERENCES public.tutorias_academicas(id),

  ADD CONSTRAINT inscripcion_tipo_tutoria_coherente CHECK (
    (
      tipo_inscripcion = 'regular'
      AND tutoria_id IS NULL
    )
    OR
    (
      tipo_inscripcion = 'tutoria'
      AND tutoria_id IS NOT NULL
      AND intento_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX una_tutoria_por_intento
  ON public.inscripciones_materias (
    intento_id,
    tutoria_id
  )
  WHERE tutoria_id IS NOT NULL;

-- =========================================================
-- 4. REGISTRO DE EVALUACIONES
-- =========================================================

CREATE TABLE public.evaluaciones_academicas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  inscripcion_id UUID NOT NULL
    REFERENCES public.inscripciones_materias(id),

  asignacion_id UUID NOT NULL
    REFERENCES public.asignaciones_docentes(id),

  nota NUMERIC(4,2),
  resultado_cualitativo VARCHAR(2),
  observaciones TEXT,

  tipo_registro VARCHAR(15) NOT NULL DEFAULT 'carga'
    CHECK (tipo_registro IN ('carga', 'migracion', 'correccion')),

  usuario_id TEXT,

  calificacion_legacy_id UUID
    REFERENCES public.calificaciones(id),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT evaluacion_resultado_valido CHECK (
    (
      nota IS NOT NULL
      AND nota >= 1
      AND nota <= 5
      AND resultado_cualitativo IS NULL
    )
    OR
    (
      nota IS NULL
      AND resultado_cualitativo IS NOT NULL
      AND resultado_cualitativo IN ('AP', 'IN')
    )
  )
);

CREATE INDEX idx_evaluaciones_inscripcion_fecha
  ON public.evaluaciones_academicas (
    inscripcion_id,
    created_at DESC,
    id
  );

CREATE UNIQUE INDEX evaluacion_legacy_migrada_una_vez
  ON public.evaluaciones_academicas (
    calificacion_legacy_id
  )
  WHERE tipo_registro = 'migracion'
    AND calificacion_legacy_id IS NOT NULL;

-- =========================================================
-- 5. VÍNCULOS OPCIONALES EN TABLAS EXISTENTES
-- =========================================================

ALTER TABLE public.calificaciones
  ADD COLUMN intento_id UUID
    REFERENCES public.intentos_academicos(id),

  ADD COLUMN inscripcion_id UUID
    REFERENCES public.inscripciones_materias(id);

ALTER TABLE public.historial_academico
  ADD COLUMN intento_id UUID
    REFERENCES public.intentos_academicos(id),

  ADD COLUMN inscripcion_id UUID
    REFERENCES public.inscripciones_materias(id);

ALTER TABLE public.cuotas
  ADD COLUMN intento_id UUID
    REFERENCES public.intentos_academicos(id),

  ADD COLUMN numero_mensualidad SMALLINT
    CHECK (
      numero_mensualidad IS NULL
      OR numero_mensualidad BETWEEN 1 AND 6
    );

ALTER TABLE public.pagos
  ADD COLUMN intento_id UUID
    REFERENCES public.intentos_academicos(id);

ALTER TABLE public.cupos
  ADD COLUMN intento_origen_id UUID
    REFERENCES public.intentos_academicos(id),

  ADD COLUMN intento_destino_id UUID
    REFERENCES public.intentos_academicos(id),

  ADD COLUMN tipo_transicion VARCHAR(30)
    CHECK (
      tipo_transicion IN (
        'avance',
        'avance_con_tutorias',
        'repeticion',
        'recuperacion_final',
        'culminacion'
      )
    );

CREATE INDEX idx_calificaciones_inscripcion
  ON public.calificaciones (inscripcion_id);

CREATE INDEX idx_historial_intento
  ON public.historial_academico (intento_id);

CREATE INDEX idx_cuotas_intento
  ON public.cuotas (intento_id);

CREATE INDEX idx_pagos_intento
  ON public.pagos (intento_id);

CREATE INDEX idx_cupos_intento_origen
  ON public.cupos (intento_origen_id);

-- Impide generar dos veces la misma mensualidad
-- cuando el flujo nuevo ya informe intento y número.
CREATE UNIQUE INDEX mensualidad_unica_por_intento
  ON public.cuotas (
    intento_id,
    numero_mensualidad
  )
  WHERE intento_id IS NOT NULL
    AND numero_mensualidad IS NOT NULL;

COMMIT;