import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import ExcelJS from 'exceljs';
import { join } from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/* ───────────────────────────────────────────────
   MAPEO DE CELDAS — Resumen Académico Oficial
   Basado en plantilla: /public/templates/resumen_academico.xlsx
   ─────────────────────────────────────────────── */

const FILA_INICIO_ESTUDIANTES = 17;
const MAX_ESTUDIANTES = 30;

const MATERIAS_RESUMEN = [
  { key: 'LENGUA CULTURA Y COMUNICACION', col: 'L', label: 'LC', basica: true },
  { key: 'MATEMATICA',                  col: 'M', label: 'MA', basica: true },
  { key: 'MEMORIA TERRITORIO Y CIUDADANIA', col: 'N', label: 'MT', basica: true },
  { key: 'CIENCIAS NATURALES',          col: 'O', label: 'CN', basica: true },
  { key: 'COMPONENTE DE PARTICIPACION E INTEGRACION COMUNITARIA', col: 'P', label: 'PART', basica: false },
  { key: 'IDIOMAS',                     col: 'Q', label: 'IDIO', basica: false },
  { key: 'OFICIO',                      col: 'R', label: 'FORM', basica: false },
];

const PROFESORES_FILAS = [
  { key: 'LENGUA CULTURA Y COMUNICACION', fila: 57, label: 'LENGUA CULTURA Y COMUNICACIÓN' },
  { key: 'MATEMATICA',                  fila: 58, label: 'MATEAMTICA' },
  { key: 'MEMORIA TERRITORIO Y CIUDADANIA', fila: 59, label: 'MEMORIA TERRITORIO Y CIUDADANIA' },
  { key: 'CIENCIAS NATURALES',          fila: 60, label: 'CIENCIAS NATURALES' },
  { key: 'COMPONENTE DE PARTICIPACION E INTEGRACION COMUNITARIA', fila: 61, label: 'COMPONENTE DE PART. E INTEG' },
  { key: 'IDIOMAS',                     fila: 62, label: 'COMPONENTES DE IDIOMAS' },
  { key: 'OFICIO',                      fila: 63, label: 'COMPONENTES DE FORMACION LABORAL' },
];

/* ───────────────────────────────────────────────
   UTILIDADES
   ─────────────────────────────────────────────── */

function periodoEnLetras(num: number): string {
  const map: Record<number, string> = {
    1: 'UNO', 2: 'DOS', 3: 'TRES', 4: 'CUATRO', 5: 'CINCO', 6: 'SEIS'
  };
  return map[num] || String(num);
}

function normalizar(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatFechaLarga(fecha: Date): string {
  const meses = [
    'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
    'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
  ];
  return `${meses[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

/* ───────────────────────────────────────────────
   HANDLER POST
   ─────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { periodo_id, ano_escolar } = body;

    if (!periodo_id || !ano_escolar) {
      return NextResponse.json(
        { error: 'periodo_id y ano_escolar son requeridos' },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      /* 1️⃣  Período */
      const periodoRes = await client.query(
        'SELECT numero, nombre FROM periodos WHERE numero = $1',
        [periodo_id]
      );
      const periodo = periodoRes.rows[0];
      if (!periodo) {
        return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
      }

      /* 2️⃣  Configuración del plantel (con fallback al modelo oficial) */
      const configRes = await client.query('SELECT clave, valor FROM configuracion');
      const cfg: Record<string, string> = {};
      configRes.rows.forEach((r: any) => { cfg[r.clave] = r.valor; });

      const plantel = {
        codigo:          cfg['codigo_plantel']          || 'PN02271519',
        nombre:          cfg['nombre_plantel']          || 'UNIDAD EDUCATIVA DE ADULTO JULIO GARMENDIA',
        direccion:       cfg['direccion_plantel']       || 'Calle Vargas con Madeleine Zona Colonial de Petare, ed.. 06 piso 02 local 01-02',
        telefono:        cfg['telefono_plantel']        || '0212-2394560/ 0212-2320814',
        municipio:       cfg['municipio']               || 'Sucre',
        entidad_federal: cfg['entidad_federal']         || 'Miranda',
        zona_educativa:  cfg['zona_educativa']          || 'Miranda',
        director:        cfg['director_nombre']         || 'Jorge Luis Gómez Alcántara',
        director_ci:     cfg['director_cedula']         || 'V-8756214',
        plan:            cfg['plan_estudio']            || 'BACHILLER',
        plan_codigo:     cfg['plan_codigo']             || '31058',
        estrategia:      cfg['estrategia_estudio']      || 'PRESENCIAL',
        seccion:         cfg['seccion']                 || 'U',
      };

      /* 3️⃣  Estudiantes inscritos en el período (máx 30 por formato) */
      const estRes = await client.query(
        `SELECT DISTINCT
           e.id,
           e.cedula,
           e.apellidos,
           e.nombres,
           e.fecha_nacimiento,
           e.genero
         FROM estudiantes e
         JOIN inscripciones_materias im ON im.estudiante_id = e.id
         WHERE im.periodo_id = $1
           AND im.ano_escolar = $2
           AND e.activo = true
         ORDER BY e.apellidos, e.nombres
         LIMIT $3`,
        [periodo_id, ano_escolar, MAX_ESTUDIANTES]
      );
      const estudiantes = estRes.rows;

      /* 4️⃣  Calificaciones del período */
      const calRes = await client.query(
        `SELECT c.estudiante_id,
                m.nombre AS materia,
                c.nota
         FROM calificaciones c
         JOIN materias m ON m.id = c.materia_id
         JOIN asignaciones_docentes ad ON ad.id = c.asignacion_id
         WHERE ad.periodo_id = $1
           AND ad.ano_escolar = $2`,
        [periodo_id, ano_escolar]
      );

      const notasMap = new Map<string, Record<string, number>>();
      calRes.rows.forEach((r: any) => {
        const key = r.estudiante_id;
        if (!notasMap.has(key)) notasMap.set(key, {});
        const matKey = normalizar(r.materia);
        notasMap.get(key)![matKey] = parseFloat(r.nota);
      });

      /* 5️⃣  Docentes asignados */
      const docRes = await client.query(
        `SELECT m.nombre AS materia,
                d.apellidos,
                d.nombres,
                d.cedula
         FROM asignaciones_docentes ad
         JOIN materias m ON m.id = ad.materia_id
         JOIN docentes d ON d.id = ad.docente_id
         WHERE ad.periodo_id = $1
           AND ad.ano_escolar = $2
           AND ad.activa = true`,
        [periodo_id, ano_escolar]
      );

      const docentesMap = new Map<string, { nombre: string; cedula: string }>();
      docRes.rows.forEach((r: any) => {
        const key = normalizar(r.materia);
        docentesMap.set(key, {
          nombre: `${r.apellidos} ${r.nombres}`.trim(),
          cedula: r.cedula,
        });
      });

      /* 6️⃣  GENERAR EXCEL (plantilla o desde cero) */
      const workbook = new ExcelJS.Workbook();
      const templatePath = join(process.cwd(), 'public', 'templates', 'resumen_academico.xlsx');

      try {
        await workbook.xlsx.readFile(templatePath);
      } catch (err) {
        console.warn('[estadisticas] Plantilla no encontrada, generando estructura base');
        workbook.addWorksheet('RESUMEN ACADEMICO');
      }

      const ws = workbook.getWorksheet(1) || workbook.addWorksheet('RESUMEN ACADEMICO');
      const hoy = new Date();

      /* ─── LIMPIEZA PREVENTIVA (v2.2 pattern) ─── */
      // Estudiantes filas 17-46
      for (let i = 0; i < MAX_ESTUDIANTES; i++) {
        const f = FILA_INICIO_ESTUDIANTES + i;
        ['A','B','C','D','E','G','H','I','J','K','L','M','N','O','P','Q','R'].forEach((c) => {
          ws.getCell(`${c}${f}`).value = null;
        });
      }
      // Totales
      ['L','M','N','O','P','Q','R'].forEach((c) => {
        [47,48,49,50].forEach((f) => { ws.getCell(`${c}${f}`).value = null; });
      });
      // Profesores
      PROFESORES_FILAS.forEach((p) => {
        ws.getCell(`D${p.fila}`).value = null;
        ws.getCell(`G${p.fila}`).value = null;
      });
      // Identificación curso
      ws.getCell('K59').value = null;
      // Firmas
      ws.getCell('A69').value = null;
      ws.getCell('A71').value = null;
      // Fecha
      ws.getCell('D66').value = null;
      // Observaciones
      ws.getCell('A64').value = null;
      // Contadores estudiantes
      ws.getCell('Q62').value = null;
      ws.getCell('Q63').value = null;

      /* ─── ENCABEZADO ADMINISTRATIVO ─── */
      ws.getCell('I3').value = ano_escolar;
      ws.getCell('O3').value = periodoEnLetras(periodo.numero);
      ws.getCell('J4').value = 'FINAL DEL PERIODO';
      ws.getCell('P4').value = formatFechaLarga(hoy);

      // Datos del plantel (celdas mergeadas A6:R6, A7:R7, A8:R8, A9:R9)
      ws.getCell('A6').value =
        `Código del Plantel:        ${plantel.codigo}                                  Nombre:   ${plantel.nombre}`;
      ws.getCell('A7').value =
        `Dirección:                ${plantel.direccion}                             Teléfono:    ${plantel.telefono}`;
      ws.getCell('A8').value =
        `Municipio:      ${plantel.municipio}                                                               Entidad Federal:          ${plantel.entidad_federal}                                                       Zona Educativa:      ${plantel.zona_educativa}`;
      ws.getCell('A9').value =
        `Director(a):        ${plantel.director}                                                                   Cedula de Identidad:    ${plantel.director_ci}`;

      /* ─── ESTUDIANTES ─── */
      const totales: Record<string, { inscritos: number; aprobados: number; noAprobados: number }> = {};
      MATERIAS_RESUMEN.forEach((m) => {
        totales[m.col] = { inscritos: 0, aprobados: 0, noAprobados: 0 };
      });

      estudiantes.forEach((est: any, idx: number) => {
        const f = FILA_INICIO_ESTUDIANTES + idx;
        const notas = notasMap.get(est.id) || {};

        ws.getCell(`A${f}`).value = idx + 1;
        ws.getCell(`B${f}`).value = est.cedula;
        ws.getCell(`C${f}`).value = est.apellidos;
        ws.getCell(`D${f}`).value = est.nombres;
        // E:F mergeada → lugar nacimiento (no disponible en BD actual)
        ws.getCell(`E${f}`).value = '';
        // G → entidad federal (no disponible)
        ws.getCell(`G${f}`).value = '';
        // H → sexo
        ws.getCell(`H${f}`).value = est.genero ? est.genero.charAt(0).toUpperCase() : '';

        if (est.fecha_nacimiento) {
          const fn = new Date(est.fecha_nacimiento);
          ws.getCell(`I${f}`).value = fn.getDate();
          ws.getCell(`J${f}`).value = fn.getMonth() + 1;
          ws.getCell(`K${f}`).value = fn.getFullYear();
        }

        MATERIAS_RESUMEN.forEach((mat) => {
          const notaRaw = notas[mat.key];
          if (typeof notaRaw === 'number' && !isNaN(notaRaw)) {
            totales[mat.col].inscritos++;
            ws.getCell(`${mat.col}${f}`).value = notaRaw;
            if (notaRaw >= 10) {
              totales[mat.col].aprobados++;
            } else {
              totales[mat.col].noAprobados++;
            }
          }
        });
      });

      // Rellenar filas restantes con correlativos vacíos (hasta 30)
      for (let i = estudiantes.length; i < MAX_ESTUDIANTES; i++) {
        ws.getCell(`A${FILA_INICIO_ESTUDIANTES + i}`).value = i + 1;
      }

      /* ─── TOTALES (sobrescribir fórmulas con valores calculados) ─── */
      MATERIAS_RESUMEN.forEach((mat) => {
        const t = totales[mat.col];
        ws.getCell(`${mat.col}47`).value = estudiantes.length;           // Inscritos
        ws.getCell(`${mat.col}48`).value = 0;                           // Insistentes (no aplica)
        ws.getCell(`${mat.col}49`).value = t.aprobados;                 // Aprobados
        ws.getCell(`${mat.col}50`).value = t.noAprobados;               // No Aprobados
      });

      /* ─── PROFESORES ─── */
      PROFESORES_FILAS.forEach((pm) => {
        const doc = docentesMap.get(pm.key);
        if (doc) {
          ws.getCell(`D${pm.fila}`).value = doc.nombre;
          ws.getCell(`G${pm.fila}`).value = doc.cedula;
        } else {
          ws.getCell(`D${pm.fila}`).value = '*';
          ws.getCell(`G${pm.fila}`).value = '*';
        }
      });

      /* ─── IDENTIFICACIÓN DEL CURSO ─── */
      ws.getCell('K53').value = plantel.plan;
      ws.getCell('K55').value = plantel.plan_codigo;
      ws.getCell('K57').value = plantel.estrategia;
      ws.getCell('K59').value = periodoEnLetras(periodo.numero);
      ws.getCell('K61').value = plantel.seccion;

      /* ─── OBSERVACIONES Y FECHAS ─── */
      ws.getCell('A64').value = '';
      ws.getCell('D66').value = hoy;
      ws.getCell('G66').value = '';

      /* ─── FIRMAS ─── */
      ws.getCell('A69').value = plantel.director;
      ws.getCell('A71').value = plantel.director_ci;

      /* ─── CONTADORES DE ESTUDIANTES ─── */
      ws.getCell('Q62').value = estudiantes.length;
      ws.getCell('Q63').value = estudiantes.length;

      /* ─── BUFFER Y RESPUESTA ─── */
      const buffer = await workbook.xlsx.writeBuffer();

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Estadisticas_${periodo.nombre}_${ano_escolar}.xlsx"`,
        },
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[estadisticas] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}