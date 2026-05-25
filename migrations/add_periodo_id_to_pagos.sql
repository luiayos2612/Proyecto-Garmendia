-- Migración: Agregar columna periodo_id a tabla pagos
-- Propósito: Identificar a qué período pertenece cada pago (para sistema semestral)

-- 1. Agregar columna periodo_id si no existe
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS periodo_id INTEGER;

-- 2. Comentario descriptivo
COMMENT ON COLUMN pagos.periodo_id IS
'ID del período al que pertenece el pago. Usado para sistema semestral.
Permite diferenciar pagos de diferentes períodos del mismo estudiante.';

-- 3. Crear relación con tabla periodos (opcional pero recomendado)
-- (Descomentar si quieres FK constraint)
-- ALTER TABLE pagos ADD CONSTRAINT fk_pagos_periodo
--   FOREIGN KEY (periodo_id) REFERENCES periodos(numero);

-- 4. Crear índice para queries más rápidas
CREATE INDEX IF NOT EXISTS idx_pagos_periodo ON pagos(periodo_id);

-- 5. Verificar que se agregó correctamente
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name='pagos' AND column_name='periodo_id';
