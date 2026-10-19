BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Agregar resultados cualitativos sin alterar las notas existentes.
ALTER TABLE public.calificaciones
  ADD COLUMN IF NOT EXISTS resultado_cualitativo VARCHAR(2);

ALTER TABLE public.historial_academico
  ADD COLUMN IF NOT EXISTS resultado_cualitativo VARCHAR(2);

-- Una calificación cualitativa solo puede ser AP o IN
-- y no debe tener simultáneamente una nota numérica.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.calificaciones'::regclass
      AND conname = 'calificaciones_resultado_cualitativo_check'
  ) THEN
    ALTER TABLE public.calificaciones
      ADD CONSTRAINT calificaciones_resultado_cualitativo_check
      CHECK (
        resultado_cualitativo IS NULL
        OR (
          resultado_cualitativo IN ('AP', 'IN')
          AND nota IS NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.historial_academico'::regclass
      AND conname = 'historial_resultado_cualitativo_check'
  ) THEN
    ALTER TABLE public.historial_academico
      ADD CONSTRAINT historial_resultado_cualitativo_check
      CHECK (
        resultado_cualitativo IS NULL
        OR (
          resultado_cualitativo IN ('AP', 'IN')
          AND nota IS NULL
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.calificaciones.resultado_cualitativo IS
  'Resultado cualitativo: AP = Aprobado; IN = Inasistentes. No equivale a una nota numérica.';

COMMENT ON COLUMN public.historial_academico.resultado_cualitativo IS
  'Resultado cualitativo histórico: AP = Aprobado; IN = Inasistentes.';

COMMIT;