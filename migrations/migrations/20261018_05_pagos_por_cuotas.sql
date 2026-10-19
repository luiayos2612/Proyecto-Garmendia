BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.cuotas
  ADD CONSTRAINT cuota_identidad_estudiante_intento
  UNIQUE (id, intento_id, estudiante_id);

CREATE TABLE public.pagos_cuotas (
  pago_id UUID NOT NULL,
  cuota_id UUID NOT NULL,
  intento_id UUID NOT NULL,
  estudiante_id UUID NOT NULL,
  monto_cuota NUMERIC NOT NULL CHECK (monto_cuota > 0),
  estado VARCHAR(12) NOT NULL DEFAULT 'reservada'
    CHECK (estado IN ('reservada', 'aplicada', 'liberada')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pago_id, cuota_id),
  FOREIGN KEY (pago_id, intento_id, estudiante_id)
    REFERENCES public.pagos(id, intento_id, estudiante_id),
  FOREIGN KEY (cuota_id, intento_id, estudiante_id)
    REFERENCES public.cuotas(id, intento_id, estudiante_id)
);

CREATE UNIQUE INDEX cuota_con_un_solo_comprobante_vigente
  ON public.pagos_cuotas (cuota_id)
  WHERE estado IN ('reservada', 'aplicada');
CREATE INDEX idx_pagos_cuotas_estudiante_intento
  ON public.pagos_cuotas (estudiante_id, intento_id);

-- Solo existian comprobantes iniciales en el flujo que estamos probando.
-- Si hay mensualidades registradas previamente, requieren revision expresa.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pagos
    WHERE tipo <> 'inscripcion'
      AND estado IN ('confirmado', 'verificacion')
  ) THEN
    RAISE EXCEPTION 'Hay comprobantes previos que no son de inscripcion. No se migraron automaticamente; requieren revision.';
  END IF;

  IF EXISTS (
    SELECT p.id
    FROM public.pagos p
    LEFT JOIN public.cuotas c
      ON c.estudiante_id = p.estudiante_id
     AND c.intento_id = p.intento_id
     AND c.tipo_cuota = 'inscripcion'
     AND c.concepto = p.concepto
    WHERE p.tipo = 'inscripcion'
      AND p.estado IN ('confirmado', 'verificacion')
    GROUP BY p.id
    HAVING COUNT(c.id) <> 1
      OR BOOL_OR(ABS(p.monto + COALESCE(p.descuento_aplicado, 0) - c.monto) > 0.001)
      OR BOOL_OR(
        (p.estado = 'confirmado' AND (c.estado <> 'pagada' OR c.pago_id IS DISTINCT FROM p.id))
        OR
        (p.estado = 'verificacion' AND c.estado NOT IN ('pendiente', 'vencida'))
      )
  ) THEN
    RAISE EXCEPTION 'Un comprobante de inscripcion no tiene una cuota compatible. Se cancelo la migracion.';
  END IF;
END $$;

INSERT INTO public.pagos_cuotas (
  pago_id, cuota_id, intento_id, estudiante_id, monto_cuota, estado
)
SELECT
  p.id, c.id, p.intento_id, p.estudiante_id, c.monto,
  CASE WHEN p.estado = 'confirmado' THEN 'aplicada' ELSE 'reservada' END
FROM public.pagos p
JOIN public.cuotas c
  ON c.estudiante_id = p.estudiante_id
 AND c.intento_id = p.intento_id
 AND c.tipo_cuota = 'inscripcion'
 AND c.concepto = p.concepto
WHERE p.tipo = 'inscripcion'
  AND p.estado IN ('confirmado', 'verificacion');

COMMIT;
