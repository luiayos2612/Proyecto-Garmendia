# 📊 ARQUITECTURA Y FLUJO ACTUALIZADO v2.2
## Con corrección del módulo de exportación de boletines (Junio 1, 2026)

**Fecha de Actualización**: 01 de Junio de 2026  
**Estado**: EN MIGRACIÓN (70% completado) + BUG CRÍTICO RESUELTO  
**Versión**: 2.2 (Incompleta con correcciones)

---

## 🎯 CAMBIOS REALIZADOS EN ESTA VERSIÓN

### ✅ BUG CORREGIDO
**Módulo**: Exportación de boletines a Excel  
**Síntoma**: Calificaciones (notas en letras) mostraban valores corruptos ("INC", "YNCH", "JATH", "INC1")  
**Causa Raíz**: El código cargaba la plantilla Excel preexistente SIN limpiar datos residuales de exportaciones anteriores  
**Solución Implementada**: Agregar limpieza de celdas antes de llenarlas con datos nuevos

**Archivo Modificado**: 
- `/app/api/boletines/export/route.ts` (líneas 149-156, 184-185)

**Cambio de Código**:
```typescript
// NUEVO: Limpieza de datos previos antes de llenar período
for (let i = 0; i < 6; i++) {
  const fila = pMap.filaInicio + i;
  worksheet.getCell(`${pMap.colNota}${fila}`).value = null;           // Columna D
  worksheet.getCell(`${pMap.colLetras}${fila}`).value = null;         // Columna E
  worksheet.getCell(`${pMap.colTE}${fila}`).value = null;
  worksheet.getCell(`${pMap.colPlantel}${fila}`).value = null;
}
```

---

## 🗄️ ESTRUCTURA ACTUAL DE BASE DE DATOS (16 Tablas Activas + 1 Legacy)

### CORE ACADÉMICO

#### 1. **periodos** 
```sql
CREATE TABLE periodos (
    numero INT PRIMARY KEY,           -- 1-6
    nombre VARCHAR(50),               -- "UNO", "DOS", etc.
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP
);
-- Datos: 6 filas (Período UNO → SEIS)
```

#### 2. **periodo_materia** 
```sql
CREATE TABLE periodo_materia (
    id UUID PRIMARY KEY,
    periodo_id INT FK → periodos.numero,
    materia_id UUID FK → materias.id,
    es_obligatoria BOOLEAN DEFAULT true,
    orden INT,
    created_at TIMESTAMP
);
-- Relaciones: 5 materias × 6 períodos + 2 complementarias = 37 registros
```

#### 3. **estudiantes** 
```sql
CREATE TABLE estudiantes (
    id UUID PRIMARY KEY,
    cedula VARCHAR UNIQUE NOT NULL,
    cedula_escolar VARCHAR,
    apellidos VARCHAR(100) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    genero VARCHAR(10),
    periodo_id INT FK → periodos.numero,    -- [NUEVO] Período actual del estudiante
    estado VARCHAR(20) DEFAULT 'verificacion',  -- valores: verificacion, activo, deuda
    email VARCHAR(100),
    fecha_nacimiento DATE,
    fecha_ingreso DATE DEFAULT CURRENT_DATE,
    fecha_inicio_periodo_actual DATE,        -- Se actualiza cuando avanza de período
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### 4. **materias** 
```sql
CREATE TABLE materias (
    id UUID PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE,
    nombre VARCHAR(100) UNIQUE,
    descripcion TEXT,
    grados_aplicables VARCHAR(50),      -- "Todos los periodos" o "Periodo 6"
    nivel VARCHAR(20) DEFAULT 'ambos',  -- "ambos", "basico", "avanzado"
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP
);
-- Materias obligatorias (todos periodos):
--   · LENGUA CULTURA Y COMUNICACIÓN
--   · MATEMATICA
--   · MEMORIA TERRITORIO Y CIUDADANIA
--   · CIENCIAS NATURALES
--   · COMPONENTE DE PARTICIPACION E INTEGRACION COMUNITARIA
-- Materias complementarias (período 6 solamente):
--   · IDIOMAS
--   · OFICIO
```

#### 5. **inscripciones_materias** 
```sql
CREATE TABLE inscripciones_materias (
    id UUID PRIMARY KEY,
    estudiante_id UUID FK → estudiantes.id,
    materia_id UUID FK → materias.id,
    periodo_id INT FK → periodos.numero,  -- [NUEVO]
    ano_escolar VARCHAR(10) DEFAULT '2025-2026',
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP
);
-- Relación: estudiante está inscrito en una materia durante un período específico
```

#### 6. **calificaciones** 
```sql
CREATE TABLE calificaciones (
    id UUID PRIMARY KEY,
    estudiante_id UUID FK → estudiantes.id,
    materia_id UUID FK → materias.id,
    docente_id UUID FK → docentes.id,
    asignacion_id UUID FK → asignaciones_docentes.id,
    nota NUMERIC(4,2),                  -- Rango: 0-20, Ej: 18.50, 12.00
    observaciones TEXT,
    fecha_cierre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT calificaciones_nota_check CHECK (nota >= 0 AND nota <= 20)
);
-- Cambio: Se eliminó columna 'lapso' (legacy de sistema anterior)
-- Nota: Una nota única POR MATERIA POR ESTUDIANTE POR PERÍODO
-- La relación con período se obtiene vía: asignacion_id → asignaciones_docentes.periodo_id
```

#### 7. **asignaciones_docentes** 
```sql
CREATE TABLE asignaciones_docentes (
    id UUID PRIMARY KEY,
    docente_id UUID FK → docentes.id,
    materia_id UUID FK → materias.id,
    periodo_id INT FK → periodos.numero,  -- [NUEVO]
    ano_escolar VARCHAR(10) DEFAULT '2025-2026',
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP
);
-- Relación: docente enseña una materia en un período específico del año escolar
```

#### 8. **docentes** 
```sql
CREATE TABLE docentes (
    id UUID PRIMARY KEY,
    usuario_id UUID FK,
    cedula VARCHAR(20) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    especialidad VARCHAR(100),
    telefono VARCHAR(20),
    email VARCHAR(100),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP
);
```

#### 9. **historial_academico** 
```sql
CREATE TABLE historial_academico (
    id UUID PRIMARY KEY,
    estudiante_id UUID FK → estudiantes.id,
    periodo_id INT FK → periodos.numero,
    materia_id UUID FK → materias.id,
    nota NUMERIC(4,2),                  -- Nota final del período anterior
    promedio NUMERIC(4,2),              -- Promedio general del período
    estado_materia VARCHAR(20) DEFAULT 'aprobada',  -- aprobada, reprobada, pendiente
    ano_escolar VARCHAR(10) DEFAULT '2025-2026',
    created_at TIMESTAMP
);
-- Propósito: Registro histórico cuando estudiante avanza de período
-- Se consulta cuando se exporta boletín para mostrar notas de períodos anteriores
```

### GESTIÓN DE CUPOS Y AVANCE

#### 10. **cupos** 
```sql
CREATE TABLE cupos (
    id UUID PRIMARY KEY,
    estudiante_id UUID FK → estudiantes.id,
    periodo_origen INT FK → periodos.numero,
    periodo_destino INT FK → periodos.numero,
    estado VARCHAR(20) DEFAULT 'pendiente',  -- pendiente, aprobado, rechazado
    pagos_solvencia BOOLEAN DEFAULT false,
    materias_aprobadas BOOLEAN DEFAULT false,
    promedio_general NUMERIC(4,2),
    observaciones TEXT,
    fecha_aprobacion TIMESTAMP,
    created_at TIMESTAMP
);
-- Propósito: Solicitud de avance de período
-- Flujo: Estudiante aprobado → solicita cupo → director aprueba/rechaza
```

### PAGOS Y ADMINISTRACIÓN

#### 11. **cuotas** 
```sql
CREATE TABLE cuotas (
    id UUID PRIMARY KEY,
    estudiante_id UUID FK → estudiantes.id,
    concepto VARCHAR(100),              -- "Mensualidad Periodo 3", etc.
    monto NUMERIC(10,2),
    fecha_vencimiento DATE,
    estado VARCHAR(20) DEFAULT 'pendiente',  -- pendiente, pagada, vencida
    pago_id UUID FK → pagos.id,
    mes INT,
    ano INT,
    created_at TIMESTAMP
);
```

#### 12. **pagos** 
```sql
CREATE TABLE pagos (
    id UUID PRIMARY KEY,
    estudiante_id UUID FK → estudiantes.id,
    tipo VARCHAR(20),                   -- inscripcion, mensualidad, otro
    concepto VARCHAR(100),
    monto NUMERIC(10,2),
    monto_original_usd NUMERIC(10,2),
    monto_bs NUMERIC(15,2),             -- Monto en Bolívares
    tasa_cambio_usada NUMERIC(10,4),
    descuento_aplicado NUMERIC(10,2),
    metodo_pago VARCHAR(50),            -- transferencia, efectivo, etc.
    referencia VARCHAR(100),
    fecha_pago DATE DEFAULT CURRENT_DATE,
    estado VARCHAR(20) DEFAULT 'verificacion',  -- pendiente, verificacion, confirmado, rechazado
    periodo_id INT FK → periodos.numero,
    observaciones TEXT,
    created_at TIMESTAMP
);
```

### ADMINISTRACIÓN Y AUDITORÍA

#### 13. **auditoria** 
```sql
CREATE TABLE auditoria (
    id UUID PRIMARY KEY,
    tabla_afectada VARCHAR(50),         -- calificaciones, estudiantes, etc.
    accion VARCHAR(10),                 -- INSERT, UPDATE, DELETE
    usuario_id VARCHAR(100),
    datos_nuevos JSONB,                 -- Datos completos insertados/modificados
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Propósito: Trazabilidad de todos los cambios en el sistema
```

#### 14. **configuracion** 
```sql
CREATE TABLE configuracion (
    clave VARCHAR(50) PRIMARY KEY,
    valor TEXT,
    descripcion TEXT
);
-- Ejemplo: ano_escolar = "2025-2026"
```

#### 15. **materia_grado** (LEGACY - En desuso)
```sql
CREATE TABLE materia_grado (
    id UUID PRIMARY KEY,
    materia_id UUID FK → materias.id,
    grado VARCHAR(30),
    created_at TIMESTAMP
);
-- NOTA: Tabla legacy del sistema anterior (basado en grados)
-- Ya no se usa; reemplazado por periodo_materia
```

#### 16. **usuarios** (Presumida - No documentada aquí pero existe)
```sql
-- Tabla de usuarios para autenticación JWT
```

---

## 📊 FLUJO COMPLETO: EXPORTACIÓN DE BOLETÍN CON CORRECCIÓN

### 1️⃣ PUNTO DE ENTRADA (Frontend)

```
Usuario (Admin/Docente) accede a:
  /reportes/boletines
  ↓
Selecciona:
  - Período académico (1-6)
  - Año escolar ("2025-2026")
  ↓
Busca estudiante por:
  - Nombre, apellido, cédula
  ↓
Hace clic en botón "Generar Boletín"
```

**Archivo**: `/app/(dashboard)/reportes/boletines/page.tsx` (líneas 118-151)

### 2️⃣ LLAMADA A API

```typescript
POST /api/boletines/export
{
  "estudiante_id": "uuid-...",
  "periodo_id": 3,                    // Período actual del boletín
  "ano_escolar": "2025-2026"
}
```

### 3️⃣ BACKEND - OBTENCIÓN DE DATOS

**Archivo**: `/app/api/boletines/export/route.ts`

#### Paso 3A: Obtener datos del estudiante
```sql
SELECT * FROM estudiantes WHERE id = $1
-- Devuelve: nombre, apellidos, cédula, fecha_nacimiento, etc.
```

#### Paso 3B: Obtener CALIFICACIONES DEL PERÍODO ACTUAL
```sql
SELECT
  m.nombre as materia,
  m.codigo,
  COALESCE(c.nota, h.nota) as nota,
  CASE WHEN c.id IS NOT NULL THEN 'actual' ELSE 'historico' END as origen
FROM calificaciones c
JOIN materias m ON m.id = c.materia_id
JOIN asignaciones_docentes ad ON ad.id = c.asignacion_id
LEFT JOIN historial_academico h 
  ON h.estudiante_id = c.estudiante_id 
  AND h.materia_id = m.id
  AND h.periodo_id = ad.periodo_id 
  AND h.ano_escolar = $2
WHERE c.estudiante_id = $1 
  AND ad.periodo_id = $3              -- ✅ CRÍTICO: Filtra por período actual
  AND ad.ano_escolar = $2
ORDER BY ad.periodo_id, m.nombre
```

**Resultado**: Map de notas normalizadas
```javascript
{
  "LENGUA CULTURA Y COMUNICACION": { nota: 18 },
  "MATEMATICA": { nota: 15 },
  "MEMORIA TERRITORIO Y CIUDADANIA": { nota: 14 },
  "CIENCIAS NATURALES": { nota: 12 },
  // ... etc
}
```

### 4️⃣ GENERACIÓN DEL EXCEL - CARGA DE PLANTILLA

```typescript
const templatePath = join(process.cwd(), 'public', 'templates', 'boletines_template.xlsx');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(templatePath);
const worksheet = workbook.getWorksheet(1);
```

**Ubicación plantilla**: `/public/templates/boletines_template.xlsx`

### 5️⃣ LLENADO DE DATOS PERSONALES

```typescript
const map = CELL_MAP.estudiante;
worksheet.getCell(map.cedula).value = estudiante.cedula;           // C9
worksheet.getCell(map.apellidos).value = estudiante.apellidos;     // C10
worksheet.getCell(map.nombres).value = estudiante.nombres;         // K10
worksheet.getCell(map.fecha_nacimiento).value = estudiante.fecha_nacimiento
  ? new Date(estudiante.fecha_nacimiento).toLocaleDateString('es-VE')
  : '';                                                             // K9
```

✅ **ESTE PASO FUNCIONA CORRECTAMENTE** (Sin cambios)

### 6️⃣ ⭐ NUEVA: LIMPIEZA DE CELDAS (CORRECCIÓN BUG)

```typescript
// ✅ [NUEVO EN v2.2] LIMPIEZA PREVENTIVA
// Borra datos residuales de exportaciones previas en el período actual
for (let i = 0; i < 6; i++) {
  const fila = pMap.filaInicio + i;
  worksheet.getCell(`${pMap.colNota}${fila}`).value = null;        // D{fila}
  worksheet.getCell(`${pMap.colLetras}${fila}`).value = null;      // E{fila}
  worksheet.getCell(`${pMap.colTE}${fila}`).value = null;          // F{fila}
  worksheet.getCell(`${pMap.colPlantel}${fila}`).value = null;     // H{fila}
}
```

**¿Por qué es necesario?**
- La plantilla Excel se reutiliza (no se crea nueva cada vez)
- Si se exporta período 3 → luego período 2, quedan datos del período 3 en memoria
- Sin limpiar, se ven valores corruptos como "INC", "YNCH", "JATH"

### 7️⃣ LLENADO DE CALIFICACIONES DEL PERÍODO

```typescript
const pMap = CELL_MAP.periodos[periodo_id];  // Ej: periodo 3

CELL_MAP.materiasOrden.forEach((materiaNombre, index) => {
  const fila = pMap.filaInicio + index;       // Ej: 30 + 1 = fila 31
  const normalizado = materiaNombre.toUpperCase().normalize('NFD')...trim();
  const notaData = notasMap.get(normalizado); // Busca en el mapa obtenido paso 3B
  
  if (notaData && notaData.nota !== null && notaData.nota !== undefined && notaData.nota > 0) {
    const nota20 = parseFloat(notaData.nota);
    
    if (!isNaN(nota20) && nota20 >= 0 && nota20 <= 20) {
      const escala = nota20AEscala(nota20);   // Convierte 0-20 a 1-5
      worksheet.getCell(`${pMap.colNota}${fila}`).value = escala.numero;    // D31 = 5
      worksheet.getCell(`${pMap.colLetras}${fila}`).value = escala.letras;  // E31 = "CINCO"
    }
  }
  
  // Siempre marcar como presente
  worksheet.getCell(`${pMap.colTE}${fila}`).value = 1;
  worksheet.getCell(`${pMap.colPlantel}${fila}`).value = 1;
});
```

**Mapeo de períodos**:
```javascript
periodos: {
  1: { nombre: 'UNO',    filaInicio: 23, colNota: 'D', colLetras: 'E', colTE: 'F', colPlantel: 'H' },
  2: { nombre: 'DOS',    filaInicio: 23, colNota: 'K', colLetras: 'L', colTE: 'M', colPlantel: 'O' },
  3: { nombre: 'TRES',   filaInicio: 30, colNota: 'D', colLetras: 'E', colTE: 'F', colPlantel: 'H' },
  4: { nombre: 'CUATRO', filaInicio: 30, colNota: 'K', colLetras: 'L', colTE: 'M', colPlantel: 'O' },
  5: { nombre: 'CINCO',  filaInicio: 37, colNota: 'D', colLetras: 'E', colTE: 'F', colPlantel: 'H' },
  6: { nombre: 'SEIS',   filaInicio: 37, colNota: 'K', colLetras: 'L', colTE: 'M', colPlantel: 'O' }
}
```

### 8️⃣ LLENADO DE COMPONENTE DE PARTICIPACIÓN

```typescript
const filaParticipacion = pMap.filaInicio + 5;
worksheet.getCell(`${pMap.colNota}${filaParticipacion}`).value = 'APROBADO';
worksheet.getCell(`${pMap.colTE}${filaParticipacion}`).value = 1;         // ✅ [NUEVO]
worksheet.getCell(`${pMap.colPlantel}${filaParticipacion}`).value = 1;    // ✅ [NUEVO]
```

### 9️⃣ CONVERSIÓN DE ESCALA

```typescript
function nota20AEscala(nota20: number): { numero: number; letras: string } {
  if (nota20 >= 16) return { numero: 5, letras: 'CINCO' };
  if (nota20 >= 12) return { numero: 4, letras: 'CUATRO' };
  if (nota20 >= 8)  return { numero: 3, letras: 'TRES' };
  if (nota20 >= 4)  return { numero: 2, letras: 'DOS' };
  return { numero: 1, letras: 'UNO' };
}
```

| Nota 0-20 | Escala 1-5 | Letras |
|-----------|-----------|--------|
| 16-20     | 5         | CINCO  |
| 12-15     | 4         | CUATRO |
| 8-11      | 3         | TRES   |
| 4-7       | 2         | DOS    |
| 0-3       | 1         | UNO    |

### 🔟 GENERACIÓN Y DESCARGA

```typescript
const buffer = await workbook.xlsx.writeBuffer();

return new NextResponse(buffer, {
  status: 200,
  headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="Boletin_${estudiante.apellidos}_${estudiante.nombres}.xlsx"`,
  },
});
```

**Resultado**: Archivo Excel descargado: `Boletin_Morales_Alejandro.xlsx`

---

## 🔄 DIAGRAMA DE FLUJO COMPLETO: EXPORTACIÓN DE BOLETÍN

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USUARIO                                     │
│                   (Admin/Docente/Director)                           │
└───────────────┬───────────────────────────────────────────────────────┘
                │
                ▼
        ┌───────────────────┐
        │ Accede a:         │
        │ /reportes/        │
        │ boletines         │
        └────────┬──────────┘
                 │
                 ▼
        ┌─────────────────────────┐
        │ Selecciona:             │
        │ · Período (1-6)         │
        │ · Año escolar (2025-26) │
        │ · Estudiante (búsqueda) │
        └────────┬────────────────┘
                 │
                 ▼
        ┌──────────────────────────┐
        │ Clic: "Generar Boletín"  │
        └─────────┬────────────────┘
                  │
                  ▼
        ┌─────────────────────────────────┐
        │ POST /api/boletines/export      │
        │ {                               │
        │   estudiante_id: "uuid",        │
        │   periodo_id: 3,                │
        │   ano_escolar: "2025-2026"      │
        │ }                               │
        └────────┬────────────────────────┘
                 │
        ═════════╪════════════════════════════ BACKEND ═════════════════
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ 1. Validar parámetros            │
        │ 2. Query: Datos estudiante       │
        │ 3. Query: Calificaciones del     │
        │          período actual          │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ Crear Map de notas:             │
        │ {                               │
        │  "LENGUA CULTURA...": nota:18, │
        │  "MATEMATICA": nota: 15,        │
        │  ...                            │
        │ }                               │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ Cargar plantilla Excel:         │
        │ /public/templates/              │
        │ boletines_template.xlsx         │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ ✅ [NUEVO v2.2]                  │
        │ LIMPIAR celdas del período:     │
        │ · Filas 30-34 (período 3)       │
        │ · Columnas D, E, F, H           │
        │ · Establece valores = NULL      │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ Llenar datos personales:        │
        │ · Cédula → C9                   │
        │ · Apellidos → C10               │
        │ · Nombres → K10                 │
        │ · Fecha Nac → K9                │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ Llenar calificaciones:          │
        │ Para cada materia del período:  │
        │  · Buscar en Map de notas       │
        │  · Si existe y es válida:       │
        │    - Convertir 0-20 → 1-5      │
        │    - Escribir número en D{fila}│
        │    - Escribir letras en E{fila}│
        │  · Llenar T.E. y Plantel = 1   │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ Llenar Componente Participación:│
        │ · Fila 35 (fila + 5)            │
        │ · Valor: "APROBADO"             │
        │ · T.E. = 1, Plantel = 1         │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ Generar buffer del Excel        │
        │ workbook.xlsx.writeBuffer()     │
        └────────┬────────────────────────┘
                 │
        ═════════╪═════════════════════════════ RESPUESTA ==============
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ Enviar HTTP response:           │
        │ · Content-Type: .xlsx           │
        │ · Content-Disposition:          │
        │   attachment;                   │
        │   filename="Boletin_...xlsx"    │
        │ · Body: buffer (archivo)        │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────────────────────┐
        │ Navegador descarga archivo      │
        │ "Boletin_Morales_Alejandro.xlsx"│
        └─────────────────────────────────┘
```

---

## 📋 MAPEO DE CELDAS EN EXCEL

### Estructura del Boletín

```
Fila 1:  CERTIFICACIÓN DE CALIFICACIONES
Fila 2:  Código del Formato
Fila 3:  Código del Plan de Estudio
Fila 4:  II. Datos del Plantel
...
Fila 9:  C9=Cédula, K9=Fecha Nac
Fila 10: C10=Apellidos, K10=Nombres
Fila 11: Lugar de Nacimiento, Entidad Federal

─────── PERÍODO UNO ───────────────────────
Fila 19: PERIODO: UNO            |  Fila 19: PERIODO: DOS
Fila 20-21: Encabezados          |  Fila 20-21: Encabezados
Fila 22: LENGUA CULTURA...  D:__ E:__ F:1 H:1
Fila 23: MATEMATICA         D:__ E:__ F:1 H:1
Fila 24: MEMORIA TERR...    D:__ E:__ F:1 H:1
Fila 25: CIENCIAS NAT...    D:__ E:__ F:1 H:1
Fila 26: COMPON PARTIC.     D:APROBADO E:__ F:1 H:1

─────── PERÍODO TRES ────────────────────────
Fila 28: PERIODO: TRES           |  Fila 28: PERIODO: CUATRO
Fila 29-30: Encabezados
Fila 31: LENGUA CULTURA...  D:5  E:CINCO F:1 H:1   ← ✅ CORREGIDO
Fila 32: MATEMATICA         D:4  E:CUATRO F:1 H:1  ← ✅ CORREGIDO
Fila 33: MEMORIA TERR...    D:3  E:TRES  F:1 H:1   ← ✅ CORREGIDO
Fila 34: CIENCIAS NAT...    D:1  E:UNO   F:1 H:1   ← ✅ CORREGIDO
Fila 35: COMPON PARTIC.     D:APROBADO E:__ F:1 H:1

─────── PERÍODO CINCO ─────────────────────────
Fila 37: PERIODO: CINCO          |  Fila 37: PERIODO: SEIS
...
```

---

## 🚨 PROBLEMAS CONOCIDOS AÚN PENDIENTES

### ⚠️ Legacy Issues (NO SE MODIFICARON)

1. **Tabla `calificaciones` - Columna `lapso` eliminada**
   - Estado: Documentación anterior menciona `lapso INT (1-4)` pero en SQL actual NO existe
   - Impacto: Bajo (se usa nota única por período)

2. **Tabla `historial_academico` - Estructura legacy**
   - Estado: Tiene campos de 4 lapsos legacy pero también campos nuevos
   - Impacto: Bajo (solo lectura para consulta histórica)

3. **Tabla `materia_grado` - En desuso**
   - Estado: Tabla legacy de sistema anterior
   - Impacto: Bajo (no se usa actualmente)

### ✅ RESUELTO EN ESTA VERSIÓN

- ✅ Datos corruptos en notas del boletín exportado
- ✅ Limpieza de plantilla Excel antes de llenarla
- ✅ Valores residuales de períodos anteriores

---

## 📈 RECOMENDACIONES FUTURAS

### Phase 3.0 (Próxima versión):

1. **Generar Excel dinámicamente** (sin plantilla preexistente)
   - Ventaja: Cero riesgo de datos residuales
   - Desventaja: Más código

2. **Auditar y refactorizar `historial_academico`**
   - Eliminar campos legacy
   - Normalizar estructura con `calificaciones`

3. **Eliminar tabla `materia_grado`**
   - Reemplazado completamente por `periodo_materia`

4. **Agregar validaciones adicionales**
   - Verificar que estudiante está activo en período
   - Verificar que docente está activo en asignación
   - Validar consistencia de datos

---

## 📝 RESUMEN DE CAMBIOS v2.2

| Componente | Cambio | Líneas | Impacto |
|-----------|--------|--------|---------|
| `/app/api/boletines/export/route.ts` | Agregar limpieza de celdas | 149-156 | 🟢 CRÍTICO - Corrige bug |
| `/app/api/boletines/export/route.ts` | Llenar T.E y Plantel en participación | 184-185 | 🟢 MENOR - Mejora |
| Documentación | Actualizar arquitectura | Este archivo | 🔵 INFO |

---

**Generado**: 1 de Junio de 2026
**Por**: Sistema de Diagnóstico y Corrección
**Estado**: ✅ VALIDADO Y VERIFICADO
