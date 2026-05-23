# 🎓 Flujo de Aprobación y Reinicio de Pagos - SOLUCIONADO

## Problema Original
Cuando un estudiante era aprobado y pasaba al siguiente semestre, el sistema:
- ❌ No reiniciaba el conteo de pagos
- ❌ Bloqueaba el registro de nuevos pagos
- ❌ No generaba las deudas correctamente para el nuevo período
- ❌ Confundía pagos del período anterior con el nuevo

## Solución Implementada

### 1. **Nueva columna: `fecha_inicio_periodo_actual`**
```sql
ALTER TABLE estudiantes
ADD COLUMN fecha_inicio_periodo_actual DATE DEFAULT CURRENT_DATE;
```
- Se inicializa con `fecha_ingreso` para estudiantes existentes
- Se actualiza cada vez que el estudiante pasa a un nuevo período
- Se usa para calcular meses esperados y deuda actual

### 2. **Endpoint: `PATCH /api/cupos` (Aprobación de Cupo)**
Cuando el director aprueba un cupo:

```typescript
// Reiniciar fecha_inicio_periodo_actual
UPDATE estudiantes SET 
  periodo_id = $1,
  estado = 'verificacion',
  fecha_inicio_periodo_actual = CURRENT_DATE  // ✅ REINICIA AQUÍ
WHERE id = $2

// Crear deudas para el nuevo período
- 1 pago de INSCRIPCIÓN (estado: pendiente)
- 6 pagos de MENSUALIDADES (estado: pendiente)
```

### 3. **Endpoint: `GET /api/pagos/estudiante/[id]`**
Calcula deuda basada en `fecha_inicio_periodo_actual`:

```typescript
const fechaInicio = new Date(
  estudiante.fecha_inicio_periodo_actual ||  // ✅ USA ESTA PRIMERO
  estudiante.fecha_ingreso ||
  estudiante.created_at
);

// Meses esperados desde fecha_inicio_periodo_actual
let mesesEsperados = (hoy - fechaInicio) / (1000 * 60 * 60 * 24 * 30)

// Deuda = lo que falta por pagar en este período
const deudaTotal = totalSemestre - totalPagado;
```

### 4. **Funciones de Recálculo**
En `/api/pagos/route.ts` y `/api/pagos/[id]/route.ts`:
- Usan `fecha_inicio_periodo_actual` en lugar de `fecha_ingreso`
- Esto aísla cada período en su propio ciclo de cobros

## Flujo Completo Revisado

```
PERÍODO 1
┌─────────────────────────────┐
│ Estudiante inscrito         │
│ fecha_ingreso: 2024-01-01   │
│ fecha_inicio_periodo_actual: 2024-01-01
│ periodo_id: 1               │
└─────────────────────────────┘
           ↓
    Paga inscripción + 6 meses
    Estado: deuda → activo
           ↓
    Registra calificaciones
    Aprueba todas las materias
           ↓
    APROBACIÓN PARA PERÍODO 2
    POST /api/estudiantes/[id]/aprobar
    → Crea CUPO (pendiente)

APROBACIÓN DEL DIRECTOR
           ↓
    PATCH /api/cupos
    {cupo_id, accion: 'aprobar'}
    
    ✅ Actualiza:
    - periodo_id: 1 → 2
    - estado: verificacion
    - fecha_inicio_periodo_actual: TODAY ⭐ REINICIA AQUÍ
    
    ✅ Crea en tabla pagos:
    - 1 inscripción (monto_inscripcion, pendiente)
    - 6 mensualidades (monto_mensual c/u, pendiente)

PERÍODO 2 INICIADO
┌─────────────────────────────┐
│ Estudiante en nuevo período │
│ fecha_inicio_periodo_actual: TODAY ⭐
│ periodo_id: 2               │
│ estado: verificacion        │
└─────────────────────────────┘
           ↓
    Ahora GET /api/pagos/estudiante/[id]
    calcula deuda desde HOY (no desde 2024)
           ↓
    Paga nueva inscripción + mensualidades
    del período 2 sin confusiones
           ↓
    Historial académico del período 1
    se mantiene en historial_academico
```

## Verificación de la Solución

### ✅ Qué se ARREGLÓ

1. **Reinicio de Contador**: `fecha_inicio_periodo_actual` se actualiza cada período
2. **Cálculo de Deuda Aislado**: Cada período tiene su propio contador de meses
3. **Pagos Creados Correctamente**: Se crean en tabla `pagos` (no `cuotas`)
4. **Sin Bloqueos**: El estudiante puede registrar pagos normalmente
5. **Historial Preservado**: `historial_academico` mantiene record de periodos anteriores

### 🧪 Cómo Probar

```bash
# 1. Ejecutar migración (si no está hecha)
curl -X POST http://localhost:3000/api/migrations/add-periodo-date

# 2. Aprobar estudiante para siguiente período
curl -X POST http://localhost:3000/api/estudiantes/[ESTUDIANTE_ID]/aprobar

# 3. Ver cupo creado
curl http://localhost:3000/api/cupos?periodo_id=2

# 4. Aprobar cupo (como director)
curl -X PATCH http://localhost:3000/api/cupos \
  -H "Content-Type: application/json" \
  -d '{"cupo_id": "[CUPO_ID]", "accion": "aprobar"}'

# 5. Ver pagos del nuevo período
curl http://localhost:3000/api/pagos/estudiante/[ESTUDIANTE_ID]

# 6. Registrar pago
curl -X POST http://localhost:3000/api/pagos \
  -H "Content-Type: application/json" \
  -d '{
    "estudiante_id": "[ID]",
    "tipo": "mensualidad",
    "concepto": "Mensualidad Período 2 - Mes 1",
    "monto": 25,
    "metodo_pago": "Efectivo",
    "fecha_pago": "2024-06-15"
  }'

# 7. Confirmar pago (como admin)
curl -X PATCH http://localhost:3000/api/pagos/[PAGO_ID] \
  -H "Content-Type: application/json" \
  -d '{"estado": "confirmado"}'
```

## Cambios en Código

### Archivos Modificados:
1. ✅ `app/api/cupos/route.ts` - PATCH aprobación
2. ✅ `app/api/pagos/route.ts` - POST y función recálculo
3. ✅ `app/api/pagos/[id]/route.ts` - PATCH confirmación
4. ✅ `app/api/pagos/estudiante/[id]/route.ts` - GET cálculo deuda
5. ✅ `migrations/add_fecha_inicio_periodo.sql` - Schema

### Cambios Clave:
- **Línea 87 en cupos/route.ts**: Agregado `fecha_inicio_periodo_actual = CURRENT_DATE`
- **Línea 115-137 en cupos/route.ts**: Crear pagos en tabla `pagos` (no `cuotas`)
- **Línea 34 en pagos/estudiante/route.ts**: Usar `fecha_inicio_periodo_actual`
- **Líneas 7-40, 10-69 en pagos/route.ts y pagos/[id]/route.ts**: Actualizar funciones recálculo

## Estado Final

| Aspecto | Antes ❌ | Después ✅ |
|---------|----------|-----------|
| Reinicio de pagos | No | Sí (fecha_inicio_periodo_actual) |
| Cálculo de deuda | Confundido | Aislado por período |
| Pagos bloqueados | Sí | No |
| Cuotas creadas | Sí (cuotas table) | No (pagos table) |
| Historial preservado | Sí | Sí |

**Estado: LISTO PARA PRODUCCIÓN** ✅
