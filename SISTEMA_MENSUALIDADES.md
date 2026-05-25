# Sistema Automático de Generación de Mensualidades (SEMESTRAL)

## ⚠️ FUNCIONAMIENTO SEMESTRAL

**Régimen:** El sistema funciona por **SEMESTRES** (6 meses):

| Concepto | Cantidad | Cuándo |
|----------|----------|--------|
| **Inscripción** | **1 vez** | Al aprobar cupo al nuevo período |
| **Mensualidades** | **6 máximo** | Una por mes (automáticamente cada 1ro de mes) |
| **Duración** | 6 meses | Desde que entra al período hasta que se aprueba al siguiente |

**Importante:** 
- ✅ La inscripción se cobra **UNA SOLA VEZ** por período (no se repite)
- ✅ Solo se generan **EXACTAMENTE 6 mensualidades** por semestre
- ✅ Después de 6 meses, el estudiante debe ser aprobado a nuevo período o terminará su ciclo
- ✅ Monto de inscripción viene de tabla `configuracion` (clave: `costo_inscripcion`)

---

## Flujo Actual

```
1. APROBAR ESTUDIANTE AL NUEVO PERÍODO (Cupos)
   ↓
2. ✅ Se genera SOLO inscripción (estado: verificacion)
   ├─ Aparece en panel de pagos para confirmar/rechazar
   ├─ Monto: valor de configuracion.costo_inscripcion
   └─ Se cobra UNA SOLA VEZ (validación: no genera duplicado)
   
3. CONFIRMAR INSCRIPCIÓN
   ↓
4. CRON JOB (1ro de cada mes)
   ↓
5. ✅ Se genera mensualidad del mes actual
   ├─ Estado: verificacion
   ├─ Vencimiento: día 30 del mes
   ├─ Número: Mensualidad 1-6 (no genera más de 6)
   └─ Monto: valor de configuracion.monto_mensualidad
   
6. ADMIN CONFIRMA/RECHAZA CADA MENSUALIDAD
   ↓
7. DESPUÉS DE 6 MESES
   ├─ Sistema DEJA de generar mensualidades
   ├─ Estudiante debe ser aprobado a nuevo período
   └─ O finaliza su ciclo académico
```

---

## Cómo Funciona

### 1. Aprobar Cupo (Cupos → Aprobar)
- ✅ Genera inscripción con estado `'verificacion'`
- ✅ Validación: NO genera inscripción si ya existe para este período
- ❌ NO genera mensualidades (se generan automáticamente cada mes)
- ✅ Actualiza `fecha_inicio_periodo_actual` = HOY

### 2. Confirmar Inscripción (Panel de Pagos)
- Admin ve la inscripción en panel de pagos
- Confirma o rechaza

### 3. Generar Mensualidades (Automático 1ro de cada mes)

El endpoint `/api/pagos/generar-mensualidades` genera mensualidades del mes actual con validaciones:

**Validaciones:**
- ✅ Inscripción debe estar CONFIRMADA
- ✅ Solo genera si tiene MENOS de 6 mensualidades
- ✅ No genera duplicados en el mismo mes
- ✅ Número de mensualidad: 1, 2, 3, 4, 5, 6 (solo eso)

### 4. Fin del Semestre (Después de mes 6)
- Sistema NO genera más mensualidades
- Estudiante se debe aprobar a nuevo período (o termina)
- Si se aprueba: nuevo ciclo de inscripción + 6 mensualidades

---

## Cómo Usar

### Opción A: Ejecutar Manualmente (Para Pruebas)

```bash
curl -X POST http://localhost:3000/api/pagos/generar-mensualidades
```

Respuesta:
```json
{
  "success": true,
  "mensaje": "10 mensualidades generadas para el mes 5/2026 (SEMESTRAL: máx 6 mensualidades por período)",
  "fecha_ejecucion": "2026-05-25T14:30:00.000Z",
  "mes_procesado": 5,
  "ano_procesado": 2026,
  "nota": "El sistema solo genera mensualidades si: (1) Inscripción está confirmada, (2) Menos de 6 mensualidades completadas"
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

---

## Qué Sucede en el Panel de Pagos (Ejemplo Real)

### MES 1 (Mes de Inscripción):
```
Estudiante: Juan García | Período: 2
Pagos:
├─ Inscripción Período 2    $25 [verificacion] ✓/✗
```

### MES 2 (1ro del siguiente mes - Cron ejecutado):
```
Estudiante: Juan García | Período: 2
Pagos:
├─ Inscripción Período 2              $25 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 1/2026 $50 [verificacion] ✓/✗
```

### MES 3:
```
Estudiante: Juan García | Período: 2
Pagos:
├─ Inscripción Período 2              $25 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 1/2026 $50 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 2/2026 $50 [verificacion] ✓/✗
```

### MES 7 (Después del 6to mes - FIN DEL SEMESTRE):
```
Estudiante: Juan García | Período: 2
Pagos:
├─ Inscripción Período 2              $25 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 1/2026 $50 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 2/2026 $50 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 3/2026 $50 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 4/2026 $50 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 5/2026 $50 [confirmado]  ✓
├─ Mensualidad Período 2 - Mes 6/2026 $50 [confirmado]  ✓
└─ ⚠️ NO se genera Mes 7 (fin del semestre)
   └─ Si se aprueba al siguiente período: nueva inscripción comienza
```

---

## Contador de Deudas y Cobros (Se Reinicia)

El sistema recalcula automáticamente **por período**:

**Cálculo de Deuda:**
- Total esperado: meses desde `fecha_inicio_periodo_actual` × `monto_mensualidad`
- Total pagado: suma de pagos confirmados del período actual
- Deuda: `total_esperado - total_pagado`

**Estados del Estudiante:**
- `'verificacion'` → Nuevo, sin pagos confirmados aún
- `'activo'` → Pagos confirmados >= total esperado (al día)
- `'deuda'` → Pagos confirmados > 0 pero < total esperado

**Se reinician porque:**
- `fecha_inicio_periodo_actual` se actualiza cada nuevo período
- Contadores se calculan desde esa fecha
- Cada período es independiente

---

## Tabla de Configuración (Monto de Inscripción)

```sql
SELECT * FROM configuracion;
```

Debe contener:
- `costo_inscripcion` → Monto de inscripción (default: 25)
- `monto_mensualidad` → Monto de mensualidad (default: 50)

**Ejemplo:**
```
clave                   | valor
------------------------|--------
costo_inscripcion       | 25
monto_mensualidad       | 50
tasa_cambio             | 2.60
```

---

## Casos de Uso Semestrales

### Caso 1: Período Completo (Flujo Normal)
```
Mes 1: Aprobar cupo → Inscripción generada
Mes 2: Confirmar inscripción + Mensualidad 1
Mes 3: Mensualidad 2
Mes 4: Mensualidad 3
Mes 5: Mensualidad 4
Mes 6: Mensualidad 5
Mes 7: Mensualidad 6
Mes 8: FIN SEMESTRE - No genera más

Luego: Si aprueba → Nueva inscripción + nuevas 6 mensualidades
```

### Caso 2: Estudiante Rechaza Inscripción
```
Mes 1: Inscripción [rechazado]
Mes 2: Cron NO genera mensualidades (inscripción no confirmada)
```

### Caso 3: Estudiante Rechaza una Mensualidad
```
Mes 1: Inscripción [confirmado]
Mes 2: Mensualidad 1 [rechazado]
Mes 3: Mensualidad 2 [confirmado]
Mes 4: Mensualidad 1 puede registrarse de nuevo manualmente
```

### Caso 4: Cambio de Período (Nuevo Ciclo)
```
Mes 6 de Período 1: Mensualidad 6 confirmada
Mes 7: Se aprueba cupo al Período 2
  └─ Nueva inscripción generada (período 2)
  └─ fecha_inicio_periodo_actual actualizada
Mes 8: Mensualidad 1 del Período 2 generada
```

---

## Validaciones del Sistema

✅ **Se previene:**
- Inscripción duplicada por período
- Más de 6 mensualidades por período
- Mensualidades duplicadas en el mismo mes
- Mensualidades sin inscripción confirmada

✅ **Se requiere:**
- Inscripción confirmada para generar mensualidades
- Período_id en cada pago (para control semestral)
- Cron job ejecutarse el 1ro de cada mes

---

## Notas Importantes

⚠️ **SEMESTRAL: máximo 6 mensualidades**
- Sistema **NUNCA** genera más de 6 mensualidades por período
- Después de mes 6, solo se generan si hay nuevo período

⚠️ **Cron job debe ejecutarse el 1ro de cada mes**
- De lo contrario, las mensualidades no se generarán en el momento correcto
- Se puede ejecutar manualmente si se perdió algún mes

⚠️ **Inscripción de una sola vez**
- Validación previene inscripciones duplicadas
- Si ya existe, NO genera nueva

⚠️ **PostgreSQL**: Asegúrate que tabla `pagos` tiene columna `periodo_id`
```sql
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS periodo_id INTEGER;
```

⚠️ **Versión de Prueba**
- Para facilitar testing, se puede llamar manualmente POST en cualquier momento
- En producción, debe estar configurado como cron job automático el 1ro de cada mes

