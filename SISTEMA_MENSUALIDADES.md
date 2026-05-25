# Sistema Automático de Generación de Mensualidades

## Flujo Actual

```
1. APROBAR ESTUDIANTE AL NUEVO PERÍODO (Cupos)
   ↓
2. ✅ Se genera SOLO inscripción (estado: verificacion)
   └─ Aparece en panel de pagos para confirmar/rechazar
   
3. CONFIRMAR INSCRIPCIÓN
   ↓
4. CRON JOB (1ro de cada mes O manual)
   ↓
5. ✅ Se genera mensualidad del mes actual
   ├─ Estado: verificacion
   └─ Vencimiento: día 30 del mes
   
6. ADMIN CONFIRMA/RECHAZA MENSUALIDAD
   ↓
7. CONTADOR DE DEUDAS Y COBROS SE REINICIA
   ├─ Se calcula desde fecha_inicio_periodo_actual
   └─ Se cobra mensualmente
```

## Cómo Funciona

### 1. Aprobar Cupo (Cupos → Aprobar)
- ✅ Genera inscripción con estado `'verificacion'`
- ❌ NO genera las 6 mensualidades de una vez
- ✅ Actualiza `fecha_inicio_periodo_actual` = HOY

### 2. Confirmar Inscripción (Panel de Pagos)
- Admin ve la inscripción en panel de pagos
- Confirma o rechaza

### 3. Generar Mensualidades (Automático cada mes)
El endpoint `/api/pagos/generar-mensualidades` genera la mensualidad correspondiente del mes actual para cada estudiante con inscripción confirmada.

## Cómo Usar

### Opción A: Ejecutar Manualmente (Para Pruebas)

```bash
curl -X POST http://localhost:3000/api/pagos/generar-mensualidades
```

Respuesta:
```json
{
  "success": true,
  "mensaje": "10 mensualidades generadas para el mes 5/2026",
  "fecha_ejecucion": "2026-05-25T14:30:00.000Z",
  "mes_procesado": 5,
  "ano_procesado": 2026
}
```

### Opción B: Configurar Cron Job (Para Producción)

#### Con Vercel (Recomendado si está en Vercel)

1. Instalar `vercel-crons`:
```bash
npm install vercel-crons
```

2. Crear `/vercel.json`:
```json
{
  "crons": [{
    "path": "/api/pagos/generar-mensualidades",
    "schedule": "0 0 1 * *"
  }]
}
```

Esto ejecutará el endpoint el día 1 de cada mes a las 00:00 UTC.

#### Con Linux/Docker (Si es self-hosted)

Agregar a `crontab -e`:
```cron
0 0 1 * * curl -X POST https://tudominio.com/api/pagos/generar-mensualidades
```

Esto ejecuta el 1ro de cada mes a las 00:00.

#### Con Node.js (node-cron)

```bash
npm install node-cron
```

Crear archivo `/lib/cron-jobs.ts`:
```typescript
import cron from 'node-cron';
import { Pool } from 'pg';

export function initCronJobs() {
  // Ejecutar cada mes el 1ro a las 00:00
  cron.schedule('0 0 1 * *', async () => {
    try {
      const res = await fetch('http://localhost:3000/api/pagos/generar-mensualidades', {
        method: 'POST'
      });
      console.log('Mensualidades generadas:', await res.json());
    } catch (error) {
      console.error('Error en cron:', error);
    }
  });
}
```

### Opción C: Verificar Mensualidades Generadas

Hacer GET al endpoint para ver cuántas mensualidades se generaron en el mes actual:

```bash
curl http://localhost:3000/api/pagos/generar-mensualidades
```

Respuesta:
```json
{
  "mes_actual": 5,
  "ano_actual": 2026,
  "mensualidades_del_mes": 10
}
```

## Qué Sucede en el Panel de Pagos

### Mes 1 (Después de aprobar cupo):
```
Estudiante: Juan García
Pagos:
├─ Inscripción Período 2    $25 [verificacion] ✓/✗
```

### Mes 2 (Después de confirmar inscripción):
```
Estudiante: Juan García
Pagos:
├─ Inscripción Período 2    $25 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 2/2026  $50 [verificacion] ✓/✗
```

### Mes 3:
```
Estudiante: Juan García
Pagos:
├─ Inscripción Período 2    $25 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 2/2026  $50 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 3/2026  $50 [verificacion] ✓/✗
```

## Contador de Deudas y Cobros

El sistema recalcula automáticamente:

**Cuando se confirma un pago:**
- Total esperado: meses desde `fecha_inicio_periodo_actual` × monto_mensual
- Total pagado: suma de pagos confirmados
- Estado estudiante:
  - Si `total_pagado <= 0` → "verificacion"
  - Si `total_pagado >= total_esperado` → "activo"
  - Si está entre ambos → "deuda"

**Los contadores se reinician porque:**
- `fecha_inicio_periodo_actual` se actualiza cuando se aprueba al nuevo período
- Se calcula desde esa fecha, no desde la inscripción original

## Casos de Uso

### 1. Nuevo Período (Flujo Completo)
```
Día 20: Aprobar cupo → inscripción generada
Día 21: Confirmar inscripción en panel
Día 1 (mes siguiente): Cron genera mensualidad mes actual
Día 21: Confirmar mensualidad
```

### 2. Rechazar Mensualidad
```
Si admin rechaza la mensualidad:
- Estado del estudiante pasa a "deuda"
- La mensualidad rechazada sigue visible (estado rechazado)
- El 1ro del próximo mes se genera la mensualidad del nuevo mes
```

### 3. Adelanto de Pagos
```
Si estudiante paga 2 meses adelantado:
- Registra 2 pagos manuales (POST /api/pagos)
- Admin confirma ambos en panel
- Estado automáticamente pasa a "activo"
```

## Variables de Configuración (Tabla configuracion)

- `monto_mensualidad` - Monto de cada mensualidad (default: 50)
- `costo_inscripcion` - Costo de inscripción (default: 25)

## Notas Importantes

⚠️ **El cron job debe ejecutarse el 1ro de cada mes**
- De lo contrario, las mensualidades no se generarán en el momento correcto
- Se puede ejecutar manualmente si se perdió algún mes

⚠️ **No genera duplicados**
- Si el cron se ejecuta 2 veces en el mismo mes, no genera duplicados

⚠️ **Versión de Prueba**
- Para facilitar testing, se puede llamar manualmente POST en cualquier momento
- En producción, debe estar configurado como cron job automático
