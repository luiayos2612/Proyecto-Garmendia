# 📚 ARQUITECTURA DEL SISTEMA GARMENDIA

## Documento Actualizado: 4 de Mayo de 2026
**Sistema de Gestión Escolar - Unidad Educativa Julio Garmendia**
**Versión 2.0 - Migración a Estructura de 6 Periodos**

---

## 📋 TABLA DE CONTENIDOS

1. [Visión General](#visión-general)
2. [Cambios Principales v2.0](#cambios-principales-v20)
3. [Estructura de Carpetas](#estructura-de-carpetas)
4. [Stack Tecnológico](#stack-tecnológico)
5. [Arquitectura del Proyecto](#arquitectura-del-proyecto)
6. [Flujo de Datos](#flujo-de-datos)
7. [Sistema de Autenticación](#sistema-de-autenticación)
8. [Base de Datos](#base-de-datos)
9. [APIs Disponibles](#apis-disponibles)
10. [Componentes Frontend](#componentes-frontend)
11. [Rutas y Navegación](#rutas-y-navegación)
12. [Middleware y Seguridad](#middleware-y-seguridad)
13. [Consideraciones para Futuros Proyectos](#consideraciones-para-futuros-proyectos)

---

## 🎯 Visión General

**Practica-Local v2.0** es un Sistema de Gestión Escolar construido con **Next.js 14** que permite administrar:

- ✅ **Estudiantes**: Inscripciones por 6 periodos académicos
- ✅ **Periodos**: Estructura de 6 periodos con materias obligatorias y complementarias
- ✅ **Docentes**: Información y asignaciones por periodo
- ✅ **Materias**: Cursos con relación periodo-materia (obligatorias/complementarias)
- ✅ **Calificaciones**: Registro de notas y promedios por periodo
- ✅ **Pagos**: Gestión de mensualidades y otros pagos (con soporte USD/Bs)
- ✅ **Usuarios**: Control de roles y accesos
- ✅ **Auditoría**: Registro completo de cambios en el sistema
- ✅ **Reportes**: Boletines, estadísticas y control de estudio

### Características Principales:
- 🔐 Autenticación con JWT y cookies seguras
- 🎨 Interfaz moderna con Tailwind CSS y animaciones
- 📊 Dashboard con métricas en tiempo real
- 🗄️ Base de datos PostgreSQL (Neon) con nueva estructura de periodos
- 🔒 Middleware de protección de rutas
- 📱 Responsive design para mobile y desktop
- 🎓 **NUEVO**: Sistema de 6 periodos académicos
- 💱 **NUEVO**: Soporte bimoneda (USD/Bs) en pagos

---

## 🔄 Cambios Principales v2.1 (EN PROGRESO - 70% Completado)

**ESTADO ACTUAL:** Sistema en migración INCOMPLETA. Algunas funcionalidades trabajando, otras con errores críticos.

### Migración: Grado/Sección → 6 Periodos Académicos + Sistema de Cupos

#### Antes (v1.x):
```
Estructura: Grado + Sección
├─ 1er Grado Sección A (5 materias)
├─ 1er Grado Sección B (5 materias)
├─ 1er Año Sección A (6 materias)
└─ ... (múltiples combinaciones)

Tablas:
├─ estudiantes (grado, seccion)
├─ materias (grado)
├─ materia_grado (relación)
├─ asignaciones_docentes (grado, seccion)
```

#### Ahora (v2.0):
```
Estructura: 6 Periodos Académicos
├─ Periodo 1 (5 obligatorias)
├─ Periodo 2 (5 obligatorias)
├─ Periodo 3 (5 obligatorias)
├─ Periodo 4 (5 obligatorias)
├─ Periodo 5 (5 obligatorias)
└─ Periodo 6 (5 obligatorias + 2 complementarias)

Tablas:
├─ periodos (NUEVA - 6 filas)
├─ periodo_materia (NUEVA - relación periodo-materia)
├─ estudiantes (periodo_id)
├─ asignaciones_docentes (periodo_id)
├─ inscripciones_materias (periodo_id)
└─ materia_grado (DEPRECATED)
```

### APIs Nuevas/Modificadas

**✅ NUEVAS:**
- `GET /api/periodos` - Obtener los 6 periodos
- `GET /api/periodos/[id]/materias` - Materias de un periodo (obligatorias + complementarias)

**🔄 MODIFICADAS:**
- `GET /api/estudiantes` - Ahora filtra por `periodo_id` (no grado/sección)
- `POST /api/estudiantes` - Body: `periodo_id` + `materias_complementarias`
- `GET /api/asignaciones` - Filtra por `periodo_id`
- `POST /api/asignaciones` - Body requiere `periodo_id`
- `GET /api/calificaciones` - Retorna `periodo_id` y `periodo_nombre`

### Cambios en Frontend

**Páginas Actualizadas:**
- ✅ `/estudiantes/nuevo` - Selector periodo (1-6), materias obligatorias/complementarias
- ✅ `/estudiantes` - Filtro por periodo
- ✅ `/asignaciones` - Selector periodo, agrupación por periodo
- ✅ `/calificaciones/nuevo` - Selector periodo (carga asignaciones + estudiantes)
- ✅ `/calificaciones` - Filtros por periodo

### Cambios en Base de Datos

**Nuevas Tablas:**
- `periodos` - Información de 6 periodos académicos
- `periodo_materia` - Relación periodo ↔ materia (con flag obligatoria/complementaria)

**Columnas Eliminadas:**
- `estudiantes.grado`
- `estudiantes.seccion`
- `asignaciones_docentes.grado`
- `asignaciones_docentes.seccion`
- `inscripciones_materias.grado`
- `inscripciones_materias.seccion`

**Columnas Agregadas:**
- `estudiantes.periodo_id` (FK → periodos.numero)
- `asignaciones_docentes.periodo_id` (FK → periodos.numero)
- `inscripciones_materias.periodo_id` (FK → periodos.numero)

---

## 📁 Estructura de Carpetas

```
practica-local/
├── 📂 app/                              # Carpeta principal de Next.js (App Router)
│   ├── 📂 (auth)/                       # Layout group para rutas de autenticación
│   │   └── 📂 login/
│   │       ├── page.tsx                 # Página de login
│   │       └── LoginCard.tsx            # Componente de formulario login
│   │
│   ├── 📂 (dashboard)/                  # Layout group para rutas protegidas
│   │   ├── layout.tsx                   # Layout compartido del dashboard
│   │   ├── 📂 dashboard/
│   │   │   └── page.tsx                 # Página principal del dashboard
│   │   ├── 📂 estudiantes/
│   │   │   ├── page.tsx                 # Listado de estudiantes
│   │   │   └── 📂 nuevo/
│   │   │       └── page.tsx             # Formulario crear estudiante
│   │   ├── 📂 docentes/
│   │   │   ├── page.tsx                 # Listado de docentes
│   │   │   └── 📂 nuevo/
│   │   │       └── page.tsx             # Formulario crear docente
│   │   ├── 📂 materias/
│   │   │   ├── page.tsx                 # Listado de materias
│   │   │   └── 📂 nuevo/
│   │   │       └── page.tsx             # Formulario crear materia
│   │   ├── 📂 asignaciones/
│   │   │   └── page.tsx                 # Asignaciones docentes-materias
│   │   ├── 📂 calificaciones/
│   │   │   ├── page.tsx                 # Listado de calificaciones
│   │   │   └── 📂 nuevo/
│   │   │       └── page.tsx             # Formulario crear calificación
│   │   ├── 📂 pagos/
│   │   │   ├── page.tsx                 # Listado de pagos
│   │   │   └── 📂 [id]/
│   │   │       └── page.tsx             # Detalle de pago
│   │   ├── 📂 usuarios/
│   │   │   └── page.tsx                 # Gestión de usuarios
│   │   ├── 📂 reportes/
│   │   │   ├── page.tsx                 # Listado de reportes
│   │   │   └── 📂 auditoria/
│   │   │       └── page.tsx             # Reporte de auditoría
│   │   |
│   |   |___ 📂 administracion/                # Nueva carpeta administrativa
│   │        └── 📂 control-de-estudio/ 
│   │             
│   │
│   ├── 📂 api/                          # Rutas API (Backend)
│   │   ├── 📂 auth/
│   │   │   ├── 📂 login/
│   │   │   │   └── route.ts             # POST: Autenticación
│   │   │   └── 📂 logout/
│   │   │       └── route.ts             # POST: Cierre de sesión
│   │   ├── 📂 usuarios/
│   │   │   ├── route.ts                 # GET: Listar, POST: Crear
│   │   │   └── 📂 [id]/
│   │   │       └── route.ts             # PATCH: Actualizar, DELETE: Eliminar
│   │   ├── 📂 estudiantes/
│   │   │   ├── route.ts                 # GET: Listar, POST: Crear
│   │   │   └── 📂 [id]/
│   │   │       └── route.ts             # GET, PATCH, DELETE
│   │   ├── 📂 docentes/
│   │   │   └── route.ts                 # CRUD de docentes
│   │   ├── 📂 materias/
│   │   │   ├── route.ts                 # CRUD de materias
│   │   │   └── 📂 por-grado/
│   │   │       └── route.ts             # GET: Materias por grado
│   │   ├── 📂 asignaciones/
│   │   │   └── route.ts                 # CRUD de asignaciones
│   │   ├── 📂 calificaciones/
│   │   │   └── route.ts                 # CRUD de calificaciones
│   │   ├── 📂 pagos/
│   │   │   ├── route.ts                 # GET: Listar, POST: Crear
│   │   │   ├── 📂 [id]/
│   │   │   │   └── route.ts             # GET, PATCH, DELETE pago
│   │   │   └── 📂 estudiante/
│   │   │       └── 📂 [id]/
│   │   │           └── route.ts         # GET: Pagos por estudiante
│   │   ├── 📂 representantes/
│   │   │   └── route.ts                 # CRUD de representantes
│   │   ├── 📂 auditoria/
│   │   │   └── route.ts                 # GET: Registro de auditoría
│   │   ├── 📂 dashboard/
│   │   │   └── route.ts                 # GET: Datos dashboard
│   │   ├── 📂 configuracion/            # Nuevo: Gestión de configuración del sistema
│   │   │   └── route.ts                 # GET: Obtener config, PATCH: Actualizar
│   │   └── 📂 test-db/
│   │       └── route.ts                 # GET: Prueba conexión DB
│   │
│   ├── 📂 components/
│   │   ├── Layout.tsx                   # Componente layout principal (sidebar + header)
│   │   ├── LoadingContext.tsx           # Context para estado de carga global
│   │   ├── LoginCard.tsx                # Componente de tarjeta login
│   │   └── logo.ts                      # Logo en base64
│   │
│   ├── 📂 fonts/
│   │   ├── GeistVF.woff                 # Fuente Geist
│   │   └── GeistMonoVF.woff             # Fuente Geist Mono
│   │
│   ├── layout.tsx                       # Layout raíz de la aplicación
│   ├── page.tsx                         # Página raíz (redirige a /login)
│   ├── globals.css                      # Estilos globales
│   └── favicon.ico                      # Favicon
│
├── 📂 lib/                              # Utilidades compartidas
│   ├── auth.ts                          # Funciones de autenticación (JWT, bcrypt)
│   └── db.ts                            # Pool de conexión PostgreSQL
│
├── 📂 public/                           # Archivos estáticos públicos
│
├── middleware.ts                        # Middleware de Next.js (protección de rutas)
├── next.config.mjs                      # Configuración de Next.js
├── tailwind.config.ts                   # Configuración de Tailwind CSS
├── postcss.config.mjs                   # Configuración de PostCSS
├── tsconfig.json                        # Configuración de TypeScript
├── package.json                         # Dependencias del proyecto
├── package-lock.json                    # Lock file de npm
├── .eslintrc.json                       # Configuración de ESLint
├── .gitignore                           # Archivos ignorados en git
│
├── 📄 GUIA_APIS_Y_INSTALACION.md        # Guía de APIs e instalación
└── 📄 ARQUITECTURA_DEL_SISTEMA.md       # Este archivo

```

---

## 💻 Stack Tecnológico

### Frontend
| Tecnología | Versión | Uso |
|-----------|---------|-----|
| **Next.js** | 14.2.35 | Framework React con SSR |
| **React** | 18.x | Librería UI |
| **TypeScript** | 5.x | Tipado estático |
| **Tailwind CSS** | 3.4.1 | Estilos utility-first |
| **Lucide React** | 1.8.0 | Iconografía |
| **Motion** | 12.38.0 | Animaciones fluidas |
| **PostCSS** | 8.x | Procesamiento CSS |

### Backend
| Tecnología | Versión | Uso |
|-----------|---------|-----|
| **Node.js** | LTS | Runtime JavaScript |
| **Next.js API Routes** | 14.2.35 | Rutas API REST |
| **PostgreSQL** (Neon) | 14+ | Base de datos |
| **pg** | 8.20.0 | Driver PostgreSQL |

### Seguridad & Autenticación
| Librería | Versión | Uso |
|---------|---------|-----|
| **jsonwebtoken** | 9.0.3 | Generación y verificación JWT |
| **bcryptjs** | 3.0.3 | Hashing de contraseñas |

### Herramientas de Desarrollo
| Herramienta | Versión | Uso |
|------------|---------|-----|
| **ESLint** | 8.x | Linting |
| **TypeScript** | 5.x | Tipado estático |

---

## 🏗️ Arquitectura del Proyecto

### Arquitectura General

```
┌─────────────────────────────────────────────────────────┐
│                     NAVEGADOR WEB                         │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│              MIDDLEWARE DE NEXT.JS                        │
│  (Verificación de JWT, protección de rutas)              │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│  FRONTEND (SSR)  │    │   API ROUTES     │
│  - Componentes   │    │  - Autenticación │
│  - Páginas       │    │  - CRUD          │
│  - State Mgmt    │    │  - Lógica        │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   POOL DE CONEXIÓN     │
        │     PostgreSQL         │
        └────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   NEON DATABASE        │
        │   (PostgreSQL en la    │
        │    nube)               │
        └────────────────────────┘
```

### Patrón de Autenticación

```
1. Usuario entra credenciales
                ↓
2. LoginPage.tsx envía POST /api/auth/login
                ↓
3. route.ts valida contra BD
                ↓
4. Si válido: genera JWT y lo setea en cookie
                ↓
5. Middleware verifica JWT en cada solicitud
                ↓
6. Si válido: permite acceso
   Si no: redirige a /login
```

### Flujo de Datos - CRUD

```
┌──────────────────────────────────────────────────────┐
│                  PÁGINA REACT                         │
│  - Formulario o tabla                                │
│  - Estado local con useState                         │
└────────┬─────────────────────────────────────────────┘
         │ fetch() con método HTTP
         ▼
┌──────────────────────────────────────────────────────┐
│              API ROUTE (.ts)                         │
│  - Recibe request                                    │
│  - Valida datos                                      │
│  - Ejecuta query en BD                               │
│  - Registra en auditoría                             │
│  - Retorna response JSON                             │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│            BASE DE DATOS POSTGRESQL                  │
│  - Inserta/Actualiza/Deleta                          │
│  - Valida constraints                                │
│  - Retorna resultado                                 │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│           AUDITORIA (Tabla auditoria)                │
│  - Registra acción                                   │
│  - Usuario que lo hizo                               │
│  - Datos afectados                                   │
│  - Timestamp                                         │
└──────────────────────────────────────────────────────┘
```

---

## 🔐 Sistema de Autenticación

### Flujo de Login

```
Usuario en /login
       │
       ▼
Ingresa: email + password
       │
       ▼
POST /api/auth/login
       │
       ├─► Valida campos no vacíos
       │
       ├─► Query: SELECT usuario WHERE email = $1
       │
       ├─► Si no existe: return 401 "Usuario no encontrado"
       │
       ├─► Si existe pero inactivo: return 403 "Usuario desactivado"
       │
       ├─► Compara password con bcrypt
       │   └─► Si no match: return 401 "Contraseña incorrecta"
       │
       ├─► Genera JWT con: userId, email, rol, nombre
       │
       ├─► SET cookie 'token' (httpOnly, secure, sameSite=strict)
       │
       ├─► Registra en auditoría (acción: LOGIN)
       │
       └─► Retorna 200 + datos usuario
              │
              ▼
         Redirige a /dashboard
```

### Middleware de Protección

```
middleware.ts ejecuta en CADA REQUEST
       │
       ├─► Extrae pathname
       │
       ├─► ¿Es ruta pública (/login, /api/auth/login)?
       │   └─► SÍ: Permite acceso
       │
       ├─► ¿Es archivo estático (_next, favicon)?
       │   └─► SÍ: Permite acceso
       │
       ├─► Extrae token de cookies
       │
       ├─► ¿Token existe?
       │   └─► NO: Redirige a /login
       │
       ├─► Verifica JWT con crypto.subtle
       │   └─► NO válido: Redirige a /login
       │
       ├─► ¿JWT expiró?
       │   └─► SÍ: Redirige a /login
       │
       └─► Permite acceso a ruta protegida
```

### Estructura de Cookie

```typescript
{
  httpOnly: true,           // No accessible desde JavaScript (previene XSS)
  secure: true,             // Solo en HTTPS en producción
  sameSite: 'strict',       // Previene CSRF
  path: '/',                // Disponible en toda la app
  maxAge: 8 * 60 * 60,      // 8 horas
}
```

### Payload JWT

```typescript
{
  userId: string,           // ID del usuario
  email: string,            // Email del usuario
  rol: string,              // Rol (admin, docente, etc)
  nombre: string,           // Nombre completo
  iat: number,              // Issued at (timestamp)
  exp: number,              // Expiration (timestamp)
}
```

---

## 🗄️ Base de Datos

### Estructura de Tablas

```sql
-- ✅ NUEVA: Tabla de Periodos
periodos
├── numero (INT PRIMARY KEY: 1-6)
├── nombre (VARCHAR: "Periodo 1" - "Periodo 6")
├── descripcion (TEXT)
├── activo (BOOLEAN)
└── created_at (TIMESTAMP)

-- ✅ NUEVA: Tabla de Periodo-Materia
periodo_materia
├── id (UUID PRIMARY KEY)
├── periodo_id (INT FK → periodos.numero)
├── materia_id (UUID FK → materias.id)
├── es_obligatoria (BOOLEAN)
├── orden (INT)
└── created_at (TIMESTAMP)

-- Tabla de Usuarios
users
├── id (UUID/INT)
├── email (VARCHAR UNIQUE)
├── nombre_completo (VARCHAR)
├── password_hash (VARCHAR)
├── rol (VARCHAR: admin, docente, etc)
├── activo (BOOLEAN)
└── created_at (TIMESTAMP)

-- 🔄 MODIFICADA: Tabla de Estudiantes
estudiantes
├── id (UUID/INT)
├── nombres (VARCHAR)
├── apellidos (VARCHAR)
├── cedula (VARCHAR UNIQUE)
├── cedula_escolar (VARCHAR)
├── periodo_id (INT FK → periodos.numero) [✅ NUEVO]
│   └── Reemplaza: grado, seccion (❌ ELIMINADOS)
├── genero (VARCHAR)
├── estado (VARCHAR: verificacion, activo, etc)
├── activo (BOOLEAN)
├── fecha_nacimiento (DATE)
├── fecha_ingreso (TIMESTAMP)
└── created_at (TIMESTAMP)

-- Tabla de Docentes
docentes
├── id (UUID/INT)
├── nombres (VARCHAR)
├── apellidos (VARCHAR)
├── cedula (VARCHAR UNIQUE)
├── email (VARCHAR)
├── especialidad (VARCHAR)
├── activo (BOOLEAN)
└── created_at (TIMESTAMP)

-- 🔄 MODIFICADA: Tabla de Materias
materias
├── id (UUID/INT)
├── nombre (VARCHAR)
├── codigo (VARCHAR UNIQUE)
├── descripcion (TEXT)
├── grados_aplicables (VARCHAR) [Reemplaza: grado]
├── nivel (VARCHAR)
├── activa (BOOLEAN)
└── created_at (TIMESTAMP)

-- 🔄 MODIFICADA: Tabla de Asignaciones (Docente -> Materia)
asignaciones_docentes
├── id (UUID/INT)
├── docente_id (FK)
├── materia_id (FK)
├── periodo_id (INT FK → periodos.numero) [✅ NUEVO]
│   └── Reemplaza: grado, seccion (❌ ELIMINADOS)
├── ano_escolar (VARCHAR: "2025-2026")
├── activa (BOOLEAN)
└── created_at (TIMESTAMP)

-- 🔄 MODIFICADA: Tabla de Inscripciones
inscripciones_materias
├── id (UUID/INT)
├── estudiante_id (FK)
├── materia_id (FK)
├── periodo_id (INT FK → periodos.numero) [✅ NUEVO]
│   └── Reemplaza: grado, seccion (❌ ELIMINADOS)
├── ano_escolar (VARCHAR)
├── activa (BOOLEAN)
└── created_at (TIMESTAMP)

-- Tabla de Calificaciones (SIN CAMBIOS)
calificaciones
├── id (UUID/INT)
├── estudiante_id (FK)
├── materia_id (FK)
├── docente_id (FK)
├── asignacion_id (FK → asignaciones_docentes.id)
├── lapso (INT: 1-4)
├── nota (DECIMAL: 0-20)
├── observaciones (TEXT)
├── activa (BOOLEAN)
└── created_at (TIMESTAMP)

-- 🔄 MODIFICADA: Tabla de Pagos (Soporte USD/Bs)
pagos
├── id (UUID/INT)
├── estudiante_id (FK)
├── tipo (VARCHAR: inscripcion, mensualidad, evento)
├── concepto (VARCHAR)
├── monto (DECIMAL USD)
├── monto_original_usd (DECIMAL) [✅ NUEVO]
├── descuento_aplicado (DECIMAL) [✅ NUEVO]
├── monto_bs (DECIMAL) [✅ NUEVO - para pagos en Bs]
├── tasa_cambio_usada (DECIMAL) [✅ NUEVO]
├── metodo_pago (VARCHAR)
├── referencia (VARCHAR)
├── estado (VARCHAR: pendiente, verificacion, confirmado)
├── fecha_pago (TIMESTAMP)
└── created_at (TIMESTAMP)

-- Tabla de Auditoría
auditoria
├── id (UUID/INT)
├── tabla_afectada (VARCHAR)
├── accion (VARCHAR: INSERT, UPDATE, DELETE, LOGIN)
├── usuario_id (VARCHAR)
├── datos_nuevos (JSON)
├── datos_anteriores (JSON)
└── timestamp (TIMESTAMP)

-- Tabla de Representantes
representantes
├── id (UUID/INT)
├── nombres (VARCHAR)
├── apellidos (VARCHAR)
├── cedula (VARCHAR)
├── estudiante_id (FK)
└── created_at (TIMESTAMP)

-- ❌ DEPRECATED: Tabla de Materia-Grado (Ya no se usa)
materia_grado
├── id (UUID/INT)
├── materia_id (FK)
├── grado (VARCHAR)
└── created_at (TIMESTAMP)
[Reemplazada por: periodo_materia]
```

### Estructura de Periodos

```
PERIODO 1-5 (Similares):
├─ 5 Materias Obligatorias:
│  ├─ LENGUA CULTURA Y COMUNICACIÓN
│  ├─ MATEMATICA
│  ├─ MEMORIA TERRITORIO Y CIUDADANIA
│  ├─ CIENCIAS NATURALES
│  └─ COMPONENTE DE PARTICIPACION E INTEGRACION COMUNITARIA
└─ 0 Materias Complementarias

PERIODO 6 (Diferente):
├─ 5 Materias Obligatorias: [IGUAL A 1-5]
└─ 2 Materias Complementarias (máx 1 seleccionable):
   ├─ IDIOMAS
   └─ OFICIO
```

### Índices de Performance

```sql
CREATE INDEX idx_estudiantes_periodo ON estudiantes(periodo_id);
CREATE INDEX idx_inscripciones_periodo ON inscripciones_materias(periodo_id);
CREATE INDEX idx_asignaciones_periodo ON asignaciones_docentes(periodo_id);
CREATE INDEX idx_periodo_materia_periodo ON periodo_materia(periodo_id);
```

### Conexión a BD

```typescript
// lib/db.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Necesario para Neon
  },
});

export default pool;
```

**Variables de Entorno Requeridas:**
```
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=tu-secret-key-super-seguro
NODE_ENV=development|production
```

---

## 🔌 APIs Disponibles

### 1. Autenticación

#### POST /api/auth/login
```typescript
// Request
{
  "email": "admin@garmendia.edu",
  "password": "password123"
}

// Response (200)
{
  "message": "Login exitoso",
  "user": {
    "id": "1",
    "email": "admin@garmendia.edu",
    "nombre": "Director Jorge",
    "rol": "admin"
  }
}
```

#### POST /api/auth/logout
```typescript
// Limpia cookie de sesión
// Response (200)
{ "message": "Sesión cerrada" }
```

---

### 2. Periodos (✅ NUEVO v2.0)

#### GET /api/periodos
Obtener los 6 periodos académicos
```bash
GET http://localhost:3000/api/periodos

Response:
{
  "periodos": [
    { "id": 1, "nombre": "Periodo 1", "descripcion": "...", "activo": true },
    { "id": 2, "nombre": "Periodo 2", "descripcion": "...", "activo": true },
    ...
    { "id": 6, "nombre": "Periodo 6", "descripcion": "...", "activo": true }
  ],
  "total": 6
}
```

#### GET /api/periodos/[id]/materias
Obtener materias de un periodo (separadas en obligatorias/complementarias)
```bash
GET http://localhost:3000/api/periodos/1/materias

Response:
{
  "periodo": { "id": 1, "nombre": "Periodo 1", "descripcion": "..." },
  "obligatorias": [
    { "id": "uuid", "codigo": "LCC001", "nombre": "LENGUA CULTURA Y COMUNICACIÓN", "descripcion": "...", "orden": 1 },
    { "id": "uuid", "codigo": "MAT001", "nombre": "MATEMATICA", "descripcion": "...", "orden": 2 },
    ...
  ],
  "complementarias": [],
  "total": 5,
  "resumen": { "obligatorias": 5, "complementarias": 0 }
}

// PERIODO 6 responde con complementarias:
"complementarias": [
  { "id": "uuid", "codigo": "IDI001", "nombre": "IDIOMAS", "descripcion": "...", "orden": 1 },
  { "id": "uuid", "codigo": "OFI001", "nombre": "OFICIO", "descripcion": "...", "orden": 2 }
]
```

---

### 3. Usuarios

#### GET /api/usuarios
Listar todos los usuarios

#### POST /api/usuarios
Crear nuevo usuario

#### PATCH /api/usuarios/[id]
Actualizar usuario

#### DELETE /api/usuarios/[id]
Eliminar usuario

---

### 4. Estudiantes (🔄 MODIFICADA v2.0)

#### GET /api/estudiantes
Listar estudiantes con filtro por periodo
```bash
# Sin filtro: retorna todos
GET http://localhost:3000/api/estudiantes

# Con filtro por periodo (1-6)
GET http://localhost:3000/api/estudiantes?periodo_id=1

Response:
{
  "estudiantes": [
    {
      "id": "uuid",
      "cedula": "12345678",
      "nombres": "Carlos",
      "apellidos": "Martínez",
      "periodo_id": 1,
      "periodo_nombre": "Periodo 1",      // ✅ NUEVO
      "genero": "M",
      "estado": "activo",
      "total_materias": 5
    }
  ]
}
```

#### POST /api/estudiantes
Crear estudiante con período (reemplaza grado/sección)
```bash
Request:
{
  "cedula": "12345678",
  "cedula_escolar": "EST-001",
  "apellidos": "Martínez",
  "nombres": "Carlos",
  "fecha_nacimiento": "2010-05-15",
  "genero": "M",
  "periodo_id": 1,                          // ✅ NUEVO (1-6)
  "materias_complementarias": ["uuid-idioma"],  // ✅ NUEVO (solo para periodo 6)
  "pago": {
    "monto": "25.00",                       // USD
    "metodo_pago": "Efectivo USD",          // O "Pago Móvil", "Transferencia Bs"
    "referencia": "REF123",                 // Opcional
    "fecha_pago": "2026-04-29",
    "monto_bs": "12000",                    // ✅ NUEVO (si metodo es Bs)
    "tasa_cambio_usada": "480"              // ✅ NUEVO (si metodo es Bs)
  }
}

Response (201):
{
  "success": true,
  "message": "Estudiante registrado. Pago de inscripción en verificación.",
  "estudiante": { /* datos */ },
  "materias_inscritas": 5                   // O 6 si seleccionó complementaria
}
```

#### GET /api/estudiantes/[id]
Ver detalle de estudiante

#### PATCH /api/estudiantes/[id]
Actualizar estudiante

#### DELETE /api/estudiantes/[id]
Eliminar estudiante

---

### 5. Docentes

#### GET /api/docentes
Listar docentes activos

#### POST /api/docentes
Crear nuevo docente

#### PATCH /api/docentes/[id]
Actualizar docente

#### DELETE /api/docentes/[id]
Eliminar docente

---

### 6. Materias

#### GET /api/materias
Listar todas las materias

#### GET /api/materias/por-grado?grado=6
Obtener materias por grado (LEGACY - usar periodos ahora)

#### POST /api/materias
Crear materia

#### PATCH /api/materias/[id]
Actualizar materia

#### DELETE /api/materias/[id]
Eliminar materia

---

### 7. Asignaciones (🔄 MODIFICADA v2.0)

#### GET /api/asignaciones
Listar asignaciones con filtro por periodo
```bash
# Sin filtro: retorna todas
GET http://localhost:3000/api/asignaciones

# Con filtro por periodo
GET http://localhost:3000/api/asignaciones?periodo_id=2

Response:
{
  "asignaciones": [
    {
      "id": "uuid",
      "docente_id": "uuid",
      "materia_id": "uuid",
      "docente": "María González",
      "materia": "MATEMATICA",
      "codigo": "MAT001",
      "periodo_id": 2,                    // ✅ NUEVO
      "periodo_nombre": "Periodo 2",      // ✅ NUEVO
      "ano_escolar": "2025-2026"
    }
  ]
}
```

#### POST /api/asignaciones
Crear asignación con periodo
```bash
Request:
{
  "docente_id": "uuid-docente",
  "materia_id": "uuid-materia",
  "periodo_id": 2                          // ✅ NUEVO (1-6)
}

Response (201):
{
  "asignacion": { /* datos */ }
}
```

#### PATCH /api/asignaciones/[id]
Actualizar asignación

#### DELETE /api/asignaciones/[id]
Eliminar asignación

---

### 8. Calificaciones (🔄 MODIFICADA v2.0)

#### GET /api/calificaciones
Listar calificaciones con filtros
```bash
# Filtrar por periodo
GET http://localhost:3000/api/calificaciones?periodo_id=1&lapso=1

Response:
{
  "calificaciones": [
    {
      "id": "uuid",
      "estudiante": "Carlos Martínez",
      "materia": "MATEMATICA",
      "docente": "María González",
      "lapso": 1,
      "nota": 18.5,
      "periodo_id": 1,                    // ✅ NUEVO
      "periodo_nombre": "Periodo 1",      // ✅ NUEVO
      "observaciones": "Buen desempeño"
    }
  ],
  "stats": [                              // ✅ ACTUALIZADO: agrupa por periodo
    {
      "periodo_id": 1,
      "periodo_nombre": "Periodo 1",
      "total": "150"
    }
  ]
}
```

#### POST /api/calificaciones
Registrar calificación (sin cambios en body)
```bash
Request:
{
  "estudiante_id": "uuid",
  "materia_id": "uuid",
  "docente_id": "uuid",
  "asignacion_id": "uuid",                // Importante: asignacion_id contiene periodo
  "lapso": 1,
  "nota": 15.5,
  "observaciones": "Buen desempeño"
}

Response (201):
{
  "calificacion": { /* datos */ }
}
```

#### PATCH /api/calificaciones/[id]
Actualizar calificación

#### DELETE /api/calificaciones/[id]
Eliminar calificación

---

### 9. Pagos (🔄 MODIFICADA v2.0 - Soporte USD/Bs)

#### GET /api/pagos
Listar pagos

#### GET /api/pagos/estudiante/[id]
Pagos de un estudiante específico

#### POST /api/pagos
Registrar pago (con soporte USD/Bs)
```bash
Request:
{
  "estudiante_id": "uuid",
  "tipo": "inscripcion|mensualidad|evento",
  "monto": 25.00,                         // Siempre en USD
  "metodo_pago": "Efectivo USD|Pago Móvil|Transferencia Bs|Zelle",
  "referencia": "123456789",
  "fecha_pago": "2026-04-29",
  "monto_bs": 12000,                      // ✅ Si pago es en Bs
  "tasa_cambio_usada": 480                // ✅ Si pago es en Bs
}
```

#### PATCH /api/pagos/[id]
Actualizar pago

#### DELETE /api/pagos/[id]
Eliminar pago

---

### 10. Auditoría

#### GET /api/auditoria
Obtener registro de auditoría completo
```bash
GET http://localhost:3000/api/auditoria?tabla=estudiantes&accion=INSERT

Response:
[
  {
    "id": "uuid",
    "tabla_afectada": "estudiantes",
    "accion": "INSERT",
    "usuario_id": "sistema",
    "datos_nuevos": { /* objeto JSON */ },
    "timestamp": "2026-04-28T10:30:00Z"
  }
]
```

---

### 11. Dashboard

#### GET /api/dashboard
Datos resumidos del dashboard
```bash
Response:
{
  "totalEstudiantes": 450,
  "totalDocentes": 35,
  "promedioGeneral": "17.2",
  "asistencia": "94%",
  "boletines": 5
}
```

---

### 12. Configuración

#### GET /api/configuracion
Obtener configuraciones del sistema
```bash
Response:
{
  "costo_inscripcion": "25.00",
  "costo_semestre": "150.00",
  "tasa_cambio": "480",
  "monto_mensualidad": "25.00"
}
```

#### PATCH /api/configuracion
Actualizar configuraciones
```bash
Request:
{
  "costo_inscripcion": "25.00",
  "tasa_cambio": "480"
}

// Si se envía costo_semestre, monto_mensualidad se calcula automáticamente:
// monto_mensualidad = costo_semestre / 6
```

---

### Componentes Principales Frontend (🔄 ACTUALIZADOS v2.0)

#### 1. Formulario de Inscripción (`/estudiantes/nuevo/page.tsx`)

**Cambios:**
- ❌ Eliminado: Selector de grado + sección
- ✅ Agregado: Selector periodo (1-6)
- ✅ Agregado: Visualización de materias obligatorias (badges)
- ✅ Agregado: Selector de materia complementaria (radio, solo para periodo 6)

**Flujo:**
```
Paso 1: Datos personales (cedula, nombres, apellidos, genero, fecha_nacimiento)
Paso 2: Seleccionar periodo → carga automática de materias obligatorias + complementarias
Paso 3: Mostrar materias y pago
Paso 4: Confirmación y envío

POST /api/estudiantes con:
├─ cedula, apellidos, nombres, genero
├─ periodo_id (1-6)
├─ materias_complementarias: ["uuid"] (si aplica)
└─ pago: { monto, metodo_pago, monto_bs, tasa_cambio_usada, ... }
```

#### 2. Listado de Estudiantes (`/estudiantes/page.tsx`)

**Cambios:**
- ❌ Eliminados: Filtros por grado + sección
- ✅ Agregado: Filtro por periodo (1-6)
- ✅ Eliminadas: Columnas grado/seccion
- ✅ Agregada: Columna periodo_nombre

**Query:** `GET /api/estudiantes?periodo_id={id}`

#### 3. Página de Asignaciones (`/asignaciones/page.tsx`)

**Cambios:**
- ❌ Eliminados: Selectores grado + sección
- ✅ Agregado: Selector periodo
- ✅ Agrupación cambia de "1er Grado Sec A" → "Periodo 1"

**POST body:**
```json
{
  "docente_id": "uuid",
  "materia_id": "uuid",
  "periodo_id": 1
}
```

#### 4. Nueva Calificación (`/calificaciones/nuevo/page.tsx`)

**Cambios:**
- Paso 1: Selector periodo (en lugar de grado/sección)
- Paso 2: Carga automática de asignaciones + estudiantes del periodo

**Queries:** 
```
GET /api/asignaciones?periodo_id={id}
GET /api/estudiantes?periodo_id={id}
```

#### 5. Consulta de Calificaciones (`/calificaciones/page.tsx`)

**Cambios:**
- ❌ Eliminados: Filtros grado/sección
- ✅ Agregado: Filtro periodo (Todos, Periodo 1-6)
- ✅ Stats agrupadas por periodo (no por grado)

**Query:** `GET /api/calificaciones?periodo_id={id}&lapso={id}`

---

### Layout Principal (`app/components/Layout.tsx`)

```typescript
Features:
├─ Sidebar con menú de navegación
├─ Header con buscador y notificaciones
├─ Avatar del usuario
├─ Botón de logout
├─ Indicador de carga global (anillo giratorio)
├─ Menús expandibles
├─ Links activos resaltados
└─ Responsive (mobile-first)

Estructura del Menú:
├─ Inicio → /dashboard
├─ Académico (expandible)
│  ├─ Estudiantes → /estudiantes
│  ├─ Nueva Inscripción → /estudiantes/nuevo
│  ├─ Docentes → /docentes
│  ├─ Materias → /materias
│  ├─ Asignaciones → /asignaciones
│  └─ Calificaciones → /calificaciones
├─ Administración (expandible)
│  ├─ Usuarios → /usuarios
│  └─ Pagos → /pagos
├─ Reportes (expandible)
│  ├─ Auditoría → /reportes/auditoria
│  ├─ Boletines → /reportes/boletines
│  └─ Estadísticas → /reportes/estadisticas
├─ Configuración → /configuracion
└─ Cerrar Sesión
```

### Contexto de Carga (`app/components/LoadingContext.tsx`)

```typescript
// Proporciona isLoading globalmente
// Utilizado para:
├─ Mostrar indicador en el logo
├─ Deshabilitar botones durante peticiones
├─ Controlar estado de carga global
└─ Acceso desde cualquier componente con useLoading()
```

### Componente LoginCard (`app/(auth)/login/LoginCard.tsx`)

```typescript
Features:
├─ Formulario de login responsivo
├─ Validación de campos
├─ Mostrar/ocultar password
├─ Indicador de carga
├─ Mensajes de error
├─ Estilos con animaciones Motion
└─ Diseño moderno con gradientes
```

---

## 🗺️ Rutas y Navegación

### Estructura de Rutas

```
PÚBLICAS (sin autenticación requerida):
├─ / → Redirige a /login
└─ /login → Página de login

PRIVADAS (requieren token JWT válido):
├─ /dashboard → Dashboard principal
├─ /estudiantes → Listado de estudiantes
│  └─ /estudiantes/nuevo → Crear estudiante
├─ /docentes → Listado de docentes
│  └─ /docentes/nuevo → Crear docente
├─ /materias → Listado de materias
│  └─ /materias/nuevo → Crear materia
├─ /asignaciones → Gestionar asignaciones
├─ /calificaciones → Listado de calificaciones
│  └─ /calificaciones/nuevo → Crear calificación
├─ /pagos → Listado de pagos
│  └─ /pagos/[id] → Detalle de pago
├─ /usuarios → Gestión de usuarios
├─ /reportes → Listado de reportes
│  ├─ /reportes/auditoria → Reporte de auditoría
│  ├─ /reportes/boletines → Boletines
│  └─ /reportes/estadisticas → Estadísticas
└─ /administracion/control-de-estudio → Control de estudio
```

### Route Groups (Layouts Compartidos)

```
(auth)
└─ Rutas sin el layout protegido
   └─ login/

(dashboard)
└─ Todas las rutas protegidas comparten el mismo layout
   ├─ dashboard/
   ├─ estudiantes/
   ├─ docentes/
   ├─ etc...
```

---

## 🔒 Middleware y Seguridad

### Ubicación: `middleware.ts`

```typescript
Flujo:
┌─ Cada request pasa por middleware
├─ Verifica si es ruta pública
├─ Verifica si es archivo estático
├─ Extrae y valida JWT de cookies
├─ Verifica firma del token
├─ Verifica expiración del token
└─ Permite o redirige según resultado
```

### Rutas Públicas Permitidas

```typescript
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/favicon.ico',
  '/logo.svg',
];
```

### Verificación JWT

```typescript
Algoritmo HMAC-SHA256
Verificación:
├─ Divide token en 3 partes (header.payload.signature)
├─ Reconstruye el contenido firmado
├─ Verifica la firma usando crypto.subtle
├─ Decodifica el payload en base64
├─ Valida que exp > timestamp actual
└─ Retorna true/false
```

### Headers de Seguridad

```typescript
// Automáticamente establecidos por Next.js
├─ X-Content-Type-Options: nosniff
├─ X-Frame-Options: DENY
├─ X-XSS-Protection: 1; mode=block
└─ Strict-Transport-Security (en producción)
```

---

## 📚 Consideraciones para Futuros Proyectos

### ✅ Buenas Prácticas Aplicadas

1. **Separación de Responsabilidades**
   - Frontend: componentes React, UI
   - Backend: API routes, lógica de negocio
   - Base de datos: persistencia de datos

2. **Autenticación Segura**
   - JWT con HMAC-SHA256
   - Cookies httpOnly para prevenir XSS
   - Verificación de tokens en middleware
   - Hashing de contraseñas con bcrypt

3. **Auditoría Completa**
   - Todos los cambios registrados
   - Quién hizo qué cambio y cuándo
   - Datos anteriores y nuevos guardados

4. **Escalabilidad**
   - Pool de conexiones reutilizable
   - Componentes reutilizables
   - API modular por entidad

5. **Type Safety**
   - TypeScript en todo el proyecto
   - Interfaces definidas
   - Validación de tipos

### 🔧 Recomendaciones para Mejoras Futuras

#### 1. Validación de Datos Mejorada
```typescript
// Usar librerías como Zod o Yup
import { z } from 'zod';

const usuarioSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nombre_completo: z.string().min(3),
});

// En la ruta API:
const validado = usuarioSchema.parse(body);
```

#### 2. Rate Limiting
```typescript
// Para prevenir ataques de fuerza bruta
// Usar ratelimit de Vercel o similar
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 h'),
});
```

#### 3. Logging Centralizado
```typescript
// Registrar errores y eventos
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

#### 4. Caché (Redis)
```typescript
// Para datos que no cambian frecuentemente
// Dashboard, materias por grado, etc.
import redis from '@upstash/redis';

const materiasCache = await redis.get(`materias:${grado}`);
if (materiasCache) return materiasCache;
// Si no existe, obtener de BD y guardar en caché
```

#### 5. Tests Automatizados
```typescript
// Jest para tests unitarios
// Playwright para e2e
import { test, expect } from '@playwright/test';

test('login exitoso', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'admin@test.com');
  await page.fill('input[name="password"]', 'pass123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
```

#### 6. Error Handling Uniforme
```typescript
// Crear una clase para errores personalizados
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public isOperational = true,
  ) {
    super(message);
  }
}

// Usar en rutas:
try {
  // lógica
} catch (error) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }
  return NextResponse.json(
    { error: 'Error interno' },
    { status: 500 }
  );
}
```

#### 7. Variables de Entorno Validadas
```typescript
// Validar en startup
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'NODE_ENV',
];

requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    throw new Error(`Variable de entorno ${envVar} no definida`);
  }
});
```

#### 8. Pagination en APIs
```typescript
// Para listados grandes
const page = parseInt(searchParams.get('page') ?? '1');
const limit = parseInt(searchParams.get('limit') ?? '10');
const offset = (page - 1) * limit;

const result = await pool.query(
  'SELECT * FROM estudiantes LIMIT $1 OFFSET $2',
  [limit, offset]
);

return NextResponse.json({
  data: result.rows,
  page,
  limit,
  total: totalCount,
  pages: Math.ceil(totalCount / limit),
});
```

#### 9. Soft Deletes
```typescript
// En lugar de eliminar, marcar como inactivo
// Todos los modelos ya tienen campo 'activo'
// Modificar queries para ignorar inactivos:
SELECT * FROM estudiantes WHERE activo = true;
```

#### 10. Database Migrations
```typescript
// Usar Prisma o Knex para versionado de BD
// Facilita updates y rollbacks

// Ejemplo con Knex:
exports.up = function(knex) {
  return knex.schema.createTable('usuarios', function(table) {
    table.increments('id').primary();
    table.string('email').unique();
    table.string('password_hash');
    table.timestamps();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('usuarios');
};
```

---

## 🚀 Guía Rápida para Nuevos Desarrolladores

### 1. Configurar Proyecto Localmente

```bash
# Clonar repositorio
git clone <repo-url>
cd practica-local

# Instalar dependencias
npm install

# Crear .env.local
cp .env.example .env.local

# Agregar variables:
DATABASE_URL=postgresql://...
JWT_SECRET=tu-secret-key

# Ejecutar en desarrollo
npm run dev

# Aplicación disponible en http://localhost:3000
```

### 2. Crear Nueva Página

```bash
# Crear carpeta y archivo
mkdir -p app/(dashboard)/nuevo-modulo
touch app/(dashboard)/nuevo-modulo/page.tsx

# Contenido básico:
'use client';

import { useEffect, useState } from 'react';

export default function NuevoModuloPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/nuevo-modulo')
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Cargando...</div>;

  return <div>{/* Tu contenido aquí */}</div>;
}
```

### 3. Crear Nueva API

```bash
# Crear ruta
mkdir -p app/api/nuevo-modulo
touch app/api/nuevo-modulo/route.ts

# Contenido:
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM nueva_tabla');
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
```

### 4. Flujo Git Típico

```bash
# Crear rama nueva
git checkout -b feature/nueva-funcionalidad

# Hacer cambios
# ...

# Commit
git add .
git commit -m "feat: descripción de cambios"

# Push
git push origin feature/nueva-funcionalidad

# Crear Pull Request en GitHub
```

### 5. Debugging

```typescript
// Console en backend (visible en terminal)
console.log('Datos:', data);
console.error('Error:', error);

// Console en frontend (visible en Dev Tools)
console.log('Estado:', state);

// Usar middleware personalizado para logs
// Verificar auditoría en BD para cambios

// Testing: usar /api/test-db para verificar conexión
```

---

## 📝 Resumen de Archivos Importantes

| Archivo | Propósito |
|---------|-----------|
| `middleware.ts` | Protección de rutas y validación JWT |
| `lib/auth.ts` | Funciones de autenticación (JWT, bcrypt) |
| `lib/db.ts` | Pool de conexión PostgreSQL |
| `app/components/Layout.tsx` | Layout principal con sidebar |
| `app/components/LoadingContext.tsx` | Estado de carga global |
| `app/(auth)/login/page.tsx` | Página de login |
| `app/(dashboard)/dashboard/page.tsx` | Dashboard principal |
| `app/api/auth/login/route.ts` | API de autenticación |
| `app/api/*/route.ts` | Rutas CRUD por entidad |
| `tailwind.config.ts` | Configuración de estilos |
| `next.config.mjs` | Configuración de Next.js |
| `tsconfig.json` | Configuración de TypeScript |

---

## 🎓 Referencias Útiles

- **Next.js Docs**: https://nextjs.org/docs
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **JWT.io**: https://jwt.io/
- **Neon Database**: https://neon.tech/docs

---

---

## 💱 Sistema de Pagos Bimoneda (v2.0)

### Soporte USD / Bolívares

**Métodos de Pago Soportados:**
```
USD:
├─ Efectivo USD
├─ Zelle

Bolívares:
├─ Pago Móvil
└─ Transferencia Bs
```

**Validación en Servidor:**
```typescript
// Si se selecciona método en Bs:
if (metodoBs.includes(metodo_pago)) {
  // Se REQUIERE:
  ├─ monto_bs (monto en bolívares)
  ├─ tasa_cambio_usada (tasa usada para cálculo)
  
  // Se VALIDA:
  esperado = monto_usd * tasa_cambio_usada
  if (|esperado - monto_bs| > 0.01) {
    ERROR: "Monto en Bs no coincide"
  }
}
```

**Tabla de Pagos Enriquecida:**
```
pagos (campos de divisa)
├─ monto (USD neto acreditado)
├─ monto_original_usd (monto antes de descuento)
├─ descuento_aplicado (si aplica)
├─ monto_bs (si pago fue en Bs)
├─ tasa_cambio_usada (tasa de conversión)
└─ metodo_pago (indica divisa indirectamente)
```

---

## 📊 Flujo de Datos Actualizado (v2.0)

### Inscripción de Estudiante (Nuevo Flujo)

```
1. Usuario accede a /estudiantes/nuevo
        ↓
2. Selecciona PERIODO (1-6)
        ↓
3. Sistema carga: GET /api/periodos/{id}/materias
   ├─ Retorna materias obligatorias (5)
   └─ Retorna complementarias (0 o 2 según periodo)
        ↓
4. Usuario ingresa datos personales
   ├─ Cedula, nombres, apellidos
   ├─ Fecha nacimiento, genero
   └─ (Solo si aplicable) selecciona 1 complementaria
        ↓
5. Usuario registra PAGO
   ├─ Monto inscripción (de config)
   ├─ Método (USD o Bs)
   ├─ Si Bs: requiere monto_bs + tasa_cambio
   └─ Referencia (opcional)
        ↓
6. POST /api/estudiantes (transacción):
   ├─ Crea estudiante (estado: verificacion)
   ├─ Auto-inscribe en 5 materias obligatorias
   ├─ Auto-inscribe en 1 complementaria (si aplica)
   ├─ Registra pago (estado: verificacion)
   └─ Registra en auditoría
        ↓
7. Retorna: { success, estudiante, materias_inscritas }
```

### Asignación Docente (Nuevo Flujo)

```
1. Usuario accede a /asignaciones
        ↓
2. Selecciona PERIODO (1-6)
        ↓
3. Sistema carga: GET /api/asignaciones?periodo_id={id}
   └─ Retorna asignaciones agrupadas por periodo
        ↓
4. Selector: Docente → Materia → Periodo
        ↓
5. POST /api/asignaciones:
   ├─ docente_id
   ├─ materia_id
   └─ periodo_id (1-6)
        ↓
6. Registra en auditoría
   └─ "Docente X asignado a MATERIA en PERIODO Y"
```

### Calificación (Flujo Actualizado)

```
1. Usuario accede a /calificaciones/nuevo
        ↓
2. Selecciona PERIODO (1-6)
        ↓
3. Carga en paralelo:
   ├─ GET /api/asignaciones?periodo_id={id}
   └─ GET /api/estudiantes?periodo_id={id}
        ↓
4. Selector: Asignación (docente+materia) → Estudiante
        ↓
5. Ingresa: Lapso (1-4), Nota (0-20), Observaciones
        ↓
6. POST /api/calificaciones (sin cambios en body)
   ├─ estudiante_id
   ├─ materia_id
   ├─ docente_id
   ├─ asignacion_id (contiene periodo_id)
   ├─ lapso
   └─ nota
        ↓
7. Registra en auditoría enriquecida
   └─ "Nota X a ESTUDIANTE en MATERIA (PERIODO Y)"
```

---

## ✨ Conclusión

**v2.0** migra el sistema de una arquitectura grado/sección a una estructura moderna de 6 periodos académicos, mejorando:

✅ **Escalabilidad**: Estructura flexible para 6 periodos vs múltiples grado-secciones
✅ **Claridad**: Periodos académicos estándar (1-6) vs nombres variables
✅ **Flexibilidad**: Soporte de materias obligatorias y complementarias
✅ **Internacionalización**: Soporte bimoneda (USD/Bs) en pagos
✅ **Auditoría**: Registro completo con datos enriquecidos

El sistema mantiene principios de escalabilidad, seguridad y mantenibilidad. Está listo para ser ampliado con nuevas funcionalidades.

---

**Fecha de Actualización**: 4 de Mayo de 2026
**Versión del Sistema**: 2.0
**Estado**: Producción

---

*Documento creado como guía de referencia para el equipo de desarrollo. Actualizar según cambios en la arquitectura.*
