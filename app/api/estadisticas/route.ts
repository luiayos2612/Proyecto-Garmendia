import { NextRequest, NextResponse } from 'next/server';
import { Pool, type PoolClient } from 'pg';
import ExcelJS from 'exceljs';
import { join } from 'path';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

const MAX_ESTUDIANTES = 30;
const FILA_INICIO = 17;

const COMPONENTES = [
  { tipo: 'lengua', columna: 'L', filaProfesor: 57 },
  { tipo: 'matematica', columna: 'M', filaProfesor: 58 },
  { tipo: 'memoria', columna: 'N', filaProfesor: 59 },
  { tipo: 'ciencias', columna: 'O', filaProfesor: 60 },
  { tipo: 'participacion', columna: 'P', filaProfesor: 61 },
  { tipo: 'idiomas', columna: 'Q', filaProfesor: 62 },
  { tipo: 'oficio', columna: 'R', filaProfesor: 63 },
] as const;

type TipoComponente =
  (typeof COMPONENTES)[number]['tipo'];

interface Estudiante {
  id: string;
  cedula: string;
  apellidos: string;
  nombres: string;
  genero: string | null;
  fecha_nacimiento: string | null;
  intento_id: string;
  numero_intento: number;
}

interface Inscripcion {
  id: string;
  estudiante_id: string;
  intento_id: string;
  materia_id: string;
  materia: string;
  tipo_inscripcion: string;
  nota: string | number | null;
  resultado_cualitativo: string | null;
  fecha_resultado: string | null;
}

interface Contador {
  inscritos: number;
  aprobados: number;
  noAprobados: number;
  inasistentes: number;
  pendientes: number;
}

class ErrorResumen extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function normalizar(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function identificarComponente(
  nombre: string
): TipoComponente {
  const valor = normalizar(nombre);

  if (
    valor.includes('LENGUA') &&
    (
      valor.includes('COMUNICACION') ||
      valor.includes('CULTURA')
    )
  ) {
    return 'lengua';
  }

  if (
    valor === 'MATEMATICA' ||
    valor === 'MATEMATICAS'
  ) {
    return 'matematica';
  }

  if (
    valor.includes('MEMORIA') &&
    valor.includes('CIUDADANIA')
  ) {
    return 'memoria';
  }

  if (valor === 'CIENCIAS NATURALES') {
    return 'ciencias';
  }

  if (
    valor.includes('PARTICIPACION') &&
    valor.includes('COMUNITARIA')
  ) {
    return 'participacion';
  }

  if (
    valor === 'IDIOMAS' ||
    valor === 'IDIOMA EXTRANJERO'
  ) {
    return 'idiomas';
  }

  if (
    valor === 'OFICIO' ||
    valor === 'COMPONENTE LABORAL'
  ) {
    return 'oficio';
  }

  throw new ErrorResumen(
    409,
    `La materia "${nombre}" no tiene una casilla identificada en el resumen. No se exportará omitiéndola.`
  );
}

function escribir(
  hoja: ExcelJS.Worksheet,
  direccion: string,
  valor: ExcelJS.CellValue
) {
  const celda = hoja.getCell(direccion);
  const principal = celda.isMerged
    ? celda.master
    : celda;

  principal.value = valor;
}

function notaEntera(
  valor: string | number | null,
  materia: string
) {
  if (valor === null || valor === undefined) {
    return null;
  }

  const nota = Number(valor);

  if (
    !Number.isInteger(nota) ||
    nota < 1 ||
    nota > 5
  ) {
    throw new ErrorResumen(
      409,
      `"${materia}" tiene una nota no válida para este reporte: ${valor}. Debe ser un entero entre 1 y 5.`
    );
  }

  return nota;
}

function resultadoImpreso(
  inscripcion: Inscripcion,
  tipo: TipoComponente
): number | 'AP' | 'IN' | null {
  if (tipo === 'idiomas' || tipo === 'oficio') {
    const resultado = inscripcion.resultado_cualitativo;

    if (resultado === null || resultado === '') {
      if (inscripcion.nota !== null) {
        throw new ErrorResumen(
          409,
          `"${inscripcion.materia}" tiene una nota numérica antigua. Debe revisarse su resultado AP/IN antes de exportar.`
        );
      }

      return null;
    }

    if (resultado !== 'AP' && resultado !== 'IN') {
      throw new ErrorResumen(
        409,
        `Resultado cualitativo no válido en "${inscripcion.materia}".`
      );
    }

    return resultado;
  }

  const nota = notaEntera(
    inscripcion.nota,
    inscripcion.materia
  );

  if (nota === null) {
    return null;
  }

  if (tipo === 'participacion') {
    return nota >= 3 ? 'AP' : 'IN';
  }

  return nota;
}

function actualizarContador(
  contador: Contador,
  resultado: number | 'AP' | 'IN' | null
) {
  contador.inscritos++;

  if (resultado === null) {
    contador.pendientes++;
    return;
  }

  if (resultado === 'IN') {
    contador.inasistentes++;
    return;
  }

  if (resultado === 'AP' || resultado >= 3) {
    contador.aprobados++;
    return;
  }

  contador.noAprobados++;
}

function periodoEnLetras(periodo: number) {
  const nombres: Record<number, string> = {
    1: 'UNO',
    2: 'DOS',
    3: 'TRES',
    4: 'CUATRO',
    5: 'CINCO',
    6: 'SEIS',
  };

  return nombres[periodo];
}

function fechaCaracas() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const obtener = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value || '';

  return {
    ano: obtener('year'),
    mes: obtener('month'),
    dia: obtener('day'),
  };
}

async function revertir(
  client: PoolClient | undefined,
  abierta: boolean
) {
  if (!client || !abierta) return;

  try {
    await client.query('ROLLBACK');
  } catch (error) {
    console.error('Rollback de resumen:', error);
  }
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  let abierta = false;

  try {
    const actor = verifyToken(
      request.cookies.get('token')?.value ?? ''
    );

    if (!actor) {
      throw new ErrorResumen(
        401,
        'Debe iniciar sesión.'
      );
    }

    if (!['director', 'secretaria'].includes(actor.rol)) {
      throw new ErrorResumen(
        403,
        'No tiene permisos para generar este reporte.'
      );
    }

    let recibido: unknown;

    try {
      recibido = await request.json();
    } catch {
      throw new ErrorResumen(
        400,
        'La solicitud no contiene un JSON válido.'
      );
    }

    if (
      typeof recibido !== 'object' ||
      recibido === null ||
      Array.isArray(recibido)
    ) {
      throw new ErrorResumen(
        400,
        'Solicitud no válida.'
      );
    }

    const body = recibido as Record<string, unknown>;
    const periodoId = Number(body.periodo_id);

    const anoEscolar =
      typeof body.ano_escolar === 'string'
        ? body.ano_escolar.trim()
        : '';

    if (
      !Number.isInteger(periodoId) ||
      periodoId < 1 ||
      periodoId > 6
    ) {
      throw new ErrorResumen(
        400,
        'Seleccione un período entre 1 y 6.'
      );
    }

    if (!anoEscolar || anoEscolar.length > 30) {
      throw new ErrorResumen(
        400,
        'Seleccione un año escolar.'
      );
    }

    client = await pool.connect();

    await client.query(
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
    );
    abierta = true;

    const periodoResult = await client.query(
      'SELECT numero FROM periodos WHERE numero = $1',
      [periodoId]
    );

    if (periodoResult.rows.length !== 1) {
      throw new ErrorResumen(
        404,
        'El período no existe.'
      );
    }

    const configuracionResult = await client.query(
      'SELECT clave, valor FROM configuracion'
    );

    const configuracion: Record<string, string> = {};

    for (const fila of configuracionResult.rows) {
      configuracion[fila.clave] = fila.valor;
    }

    /*
     * Un intento por estudiante:
     * el más reciente del período y año solicitado.
     * No filtra por el estado actual del estudiante.
     */
    const estudiantesResult = await client.query(
      `
        WITH intentos_elegidos AS (
          SELECT DISTINCT ON (ia.estudiante_id)
            ia.estudiante_id,
            ia.id AS intento_id,
            ia.numero_intento
          FROM intentos_academicos ia
          WHERE ia.periodo_id = $1
            AND ia.ano_escolar = $2
            AND ia.estado IN (
              'en_curso', 'cerrado', 'culminado'
            )
          ORDER BY
            ia.estudiante_id,
            ia.numero_intento DESC,
            ia.created_at DESC,
            ia.id DESC
        )
        SELECT
          e.id,
          e.cedula,
          e.apellidos,
          e.nombres,
          e.genero,
          e.fecha_nacimiento::text AS fecha_nacimiento,
          elegido.intento_id,
          elegido.numero_intento
        FROM intentos_elegidos elegido
        JOIN estudiantes e
          ON e.id = elegido.estudiante_id
        WHERE EXISTS (
          SELECT 1
          FROM inscripciones_materias im
          WHERE im.intento_id = elegido.intento_id
            AND im.estudiante_id = e.id
        )
        ORDER BY e.apellidos, e.nombres, e.id
      `,
      [periodoId, anoEscolar]
    );

    const estudiantes =
      estudiantesResult.rows as Estudiante[];

    if (estudiantes.length === 0) {
      throw new ErrorResumen(
        404,
        'No hay estudiantes inscritos en ese período y año escolar.'
      );
    }

    if (estudiantes.length > MAX_ESTUDIANTES) {
      throw new ErrorResumen(
        409,
        `Hay ${estudiantes.length} estudiantes. La plantilla admite 30 por página. No se generó un archivo incompleto; se necesita habilitar la exportación de varias páginas.`
      );
    }

    const intentosIds = estudiantes.map(
      (estudiante) => estudiante.intento_id
    );

    const inscripcionesResult = await client.query(
      `
        SELECT
          im.id,
          im.estudiante_id,
          im.intento_id,
          im.materia_id,
          im.tipo_inscripcion,
          m.nombre AS materia,

          CASE
            WHEN c.id IS NOT NULL THEN c.nota
            ELSE h.nota
          END AS nota,

          CASE
            WHEN c.id IS NOT NULL
              THEN c.resultado_cualitativo
            ELSE h.resultado_cualitativo
          END AS resultado_cualitativo,

          COALESCE(
            c.fecha_cierre::text,
            ia.fecha_cierre::text
          ) AS fecha_resultado

        FROM inscripciones_materias im
        JOIN intentos_academicos ia
          ON ia.id = im.intento_id
          AND ia.estudiante_id = im.estudiante_id
        JOIN materias m
          ON m.id = im.materia_id
        LEFT JOIN calificaciones c
          ON c.inscripcion_id = im.id
        LEFT JOIN historial_academico h
          ON h.inscripcion_id = im.id
        WHERE im.intento_id = ANY($1::uuid[])
        ORDER BY im.estudiante_id, m.nombre, im.id
      `,
      [intentosIds]
    );

    const inscripciones =
      inscripcionesResult.rows as Inscripcion[];

    const idsInscripciones = new Set<string>();

    for (const inscripcion of inscripciones) {
      if (idsInscripciones.has(inscripcion.id)) {
        throw new ErrorResumen(
          409,
          'Una inscripción tiene varios resultados relacionados. Revise ese registro antes de exportar.'
        );
      }

      idsInscripciones.add(inscripcion.id);
    }

    const docentesResult = await client.query(
      `
        SELECT
          ad.id,
          ad.materia_id,
          m.nombre AS materia,
          d.apellidos,
          d.nombres,
          d.cedula
        FROM asignaciones_docentes ad
        JOIN materias m ON m.id = ad.materia_id
        JOIN docentes d ON d.id = ad.docente_id
        WHERE ad.periodo_id = $1
          AND ad.ano_escolar = $2
          AND ad.activa = true
          AND d.activo = true
          AND m.activa = true
        ORDER BY m.nombre, ad.id
      `,
      [periodoId, anoEscolar]
    );

    await client.query('COMMIT');
    abierta = false;

    const libro = new ExcelJS.Workbook();

    /*
     * No se genera un formato improvisado si falta
     * la plantilla: el error debe ser visible.
     */
    await libro.xlsx.readFile(
      join(
        process.cwd(),
        'public',
        'templates',
        'resumen_academico.xlsx'
      )
    );

    const hoja = libro.getWorksheet(
      'RESUMEN ACADEMICO'
    );

    if (!hoja) {
      throw new ErrorResumen(
        500,
        'La plantilla no contiene la hoja RESUMEN ACADEMICO.'
      );
    }

    /*
     * Limpieza del área de estudiantes.
     * Se escriben solo las celdas principales
     * de los rangos combinados.
     */
    for (let fila = 17; fila <= 46; fila++) {
      for (let columna = 1; columna <= 18; columna++) {
        const celda = hoja.getCell(fila, columna);

        if (
          !celda.isMerged ||
          celda.master.address === celda.address
        ) {
          celda.value = null;
        }
      }
    }

    /*
     * Columnas auxiliares S:AG:
     * contienen las I precargadas y fórmulas antiguas.
     */
    for (let fila = 1; fila <= 73; fila++) {
      for (let columna = 19; columna <= 33; columna++) {
        const celda = hoja.getCell(fila, columna);

        if (
          !celda.isMerged ||
          celda.master.address === celda.address
        ) {
          celda.value = null;
        }
      }
    }

    for (let columna = 19; columna <= 33; columna++) {
      hoja.getColumn(columna).hidden = true;
    }

    // Sustituir todas las fórmulas de los totales.
    for (const componente of COMPONENTES) {
      for (const fila of [47, 48, 49, 50]) {
        escribir(
          hoja,
          `${componente.columna}${fila}`,
          null
        );
      }

      escribir(
        hoja,
        `D${componente.filaProfesor}`,
        null
      );

      escribir(
        hoja,
        `G${componente.filaProfesor}`,
        null
      );
    }

    const fecha = fechaCaracas();

    const meses = [
      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL',
      'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
      'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE',
      'DICIEMBRE',
    ];

    escribir(hoja, 'I3', anoEscolar);
    escribir(
      hoja,
      'O3',
      periodoEnLetras(periodoId)
    );
    escribir(hoja, 'J4', 'FINAL DEL PERIODO');
    escribir(
      hoja,
      'P4',
      `${meses[Number(fecha.mes) - 1]} ${fecha.ano}`
    );

    /*
     * Mantener los textos institucionales de la
     * plantilla cuando no existe configuración.
     */
    if (
      configuracion.codigo_plantel &&
      configuracion.nombre_plantel
    ) {
      escribir(
        hoja,
        'A6',
        `Código del Plantel: ${configuracion.codigo_plantel}    Nombre: ${configuracion.nombre_plantel}`
      );
    }

    if (
      configuracion.direccion_plantel &&
      configuracion.telefono_plantel
    ) {
      escribir(
        hoja,
        'A7',
        `Dirección: ${configuracion.direccion_plantel}    Teléfono: ${configuracion.telefono_plantel}`
      );
    }

    if (
      configuracion.municipio &&
      configuracion.entidad_federal &&
      configuracion.zona_educativa
    ) {
      escribir(
        hoja,
        'A8',
        `Municipio: ${configuracion.municipio}    Entidad Federal: ${configuracion.entidad_federal}    Zona Educativa: ${configuracion.zona_educativa}`
      );
    }

    if (
      configuracion.director_nombre &&
      configuracion.director_cedula
    ) {
      escribir(
        hoja,
        'A9',
        `Director(a): ${configuracion.director_nombre}    Cédula de Identidad: ${configuracion.director_cedula}`
      );

      escribir(
        hoja,
        'A69',
        configuracion.director_nombre
      );

      escribir(
        hoja,
        'A71',
        configuracion.director_cedula
      );
    }

    const contadores = new Map<
      TipoComponente,
      Contador
    >();

    for (const componente of COMPONENTES) {
      contadores.set(componente.tipo, {
        inscritos: 0,
        aprobados: 0,
        noAprobados: 0,
        inasistentes: 0,
        pendientes: 0,
      });
    }

    let totalTutorias = 0;

    estudiantes.forEach((estudiante, indice) => {
      const fila = FILA_INICIO + indice;

      escribir(hoja, `A${fila}`, indice + 1);
      escribir(
        hoja,
        `B${fila}`,
        estudiante.cedula
      );
      hoja.getCell(`B${fila}`).numFmt = '@';

      escribir(
        hoja,
        `C${fila}`,
        estudiante.apellidos
      );

      escribir(
        hoja,
        `D${fila}`,
        estudiante.nombres
      );

      escribir(hoja, `E${fila}`, '');
      escribir(hoja, `G${fila}`, '');

      escribir(
        hoja,
        `H${fila}`,
        estudiante.genero
          ? estudiante.genero.charAt(0).toUpperCase()
          : ''
      );

      if (estudiante.fecha_nacimiento) {
        const fechaNacimiento =
          estudiante.fecha_nacimiento.slice(0, 10);

        if (
          /^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)
        ) {
          escribir(
            hoja,
            `I${fila}`,
            Number(fechaNacimiento.slice(8, 10))
          );
          escribir(
            hoja,
            `J${fila}`,
            Number(fechaNacimiento.slice(5, 7))
          );
          escribir(
            hoja,
            `K${fila}`,
            Number(fechaNacimiento.slice(0, 4))
          );
        }
      }

      const componentesOcupados = new Set<
        TipoComponente
      >();

      const delIntento = inscripciones.filter(
        (inscripcion) =>
          inscripcion.intento_id === estudiante.intento_id
      );

      for (const inscripcion of delIntento) {
        if (inscripcion.tipo_inscripcion === 'tutoria') {
          totalTutorias++;
          continue;
        }

        if (inscripcion.tipo_inscripcion !== 'regular') {
          throw new ErrorResumen(
            409,
            'Se encontró un tipo de inscripción no reconocido.'
          );
        }

        const tipo = identificarComponente(
          inscripcion.materia
        );

        if (componentesOcupados.has(tipo)) {
          throw new ErrorResumen(
            409,
            `El intento de ${estudiante.apellidos} ${estudiante.nombres} tiene dos materias para la misma casilla del reporte.`
          );
        }

        componentesOcupados.add(tipo);

        const componente = COMPONENTES.find(
          (item) => item.tipo === tipo
        )!;

        const resultado = resultadoImpreso(
          inscripcion,
          tipo
        );

        escribir(
          hoja,
          `${componente.columna}${fila}`,
          resultado
        );

        hoja.getCell(
          `${componente.columna}${fila}`
        ).numFmt =
          typeof resultado === 'number' ? '0' : '@';

        actualizarContador(
          contadores.get(tipo)!,
          resultado
        );
      }
    });

    for (
      let indice = estudiantes.length;
      indice < MAX_ESTUDIANTES;
      indice++
    ) {
      escribir(
        hoja,
        `A${FILA_INICIO + indice}`,
        indice + 1
      );
    }

    let totalPendientes = 0;

    for (const componente of COMPONENTES) {
      const contador = contadores.get(
        componente.tipo
      )!;

      escribir(
        hoja,
        `${componente.columna}47`,
        contador.inscritos
      );
      escribir(
        hoja,
        `${componente.columna}48`,
        contador.inasistentes
      );
      escribir(
        hoja,
        `${componente.columna}49`,
        contador.aprobados
      );
      escribir(
        hoja,
        `${componente.columna}50`,
        contador.noAprobados
      );

      totalPendientes += contador.pendientes;
    }

    // Corregir el rótulo de la plantilla.
    escribir(hoja, 'D48', 'Inasistentes');

    const profesores = new Map<
      TipoComponente,
      { nombre: string; cedula: string }
    >();

    for (const docente of docentesResult.rows) {
      const tipo = identificarComponente(
        docente.materia
      );

      if (profesores.has(tipo)) {
        throw new ErrorResumen(
          409,
          'Hay más de una asignación vigente para un componente del reporte. Revise Asignaciones.'
        );
      }

      profesores.set(tipo, {
        nombre:
          `${docente.apellidos} ${docente.nombres}`.trim(),
        cedula: docente.cedula,
      });
    }

    for (const componente of COMPONENTES) {
      const profesor = profesores.get(
        componente.tipo
      );

      escribir(
        hoja,
        `D${componente.filaProfesor}`,
        profesor?.nombre || ''
      );

      escribir(
        hoja,
        `G${componente.filaProfesor}`,
        profesor?.cedula || ''
      );
    }

    if (configuracion.plan_estudio) {
      escribir(
        hoja,
        'K53',
        configuracion.plan_estudio
      );
    }

    if (configuracion.plan_codigo) {
      escribir(
        hoja,
        'K55',
        configuracion.plan_codigo
      );
    }

    if (configuracion.estrategia_estudio) {
      escribir(
        hoja,
        'K57',
        configuracion.estrategia_estudio
      );
    }

    escribir(
      hoja,
      'K59',
      periodoEnLetras(periodoId)
    );

    if (configuracion.seccion) {
      escribir(
        hoja,
        'K61',
        configuracion.seccion
      );
    }

    escribir(hoja, 'Q62', estudiantes.length);
    escribir(hoja, 'Q63', estudiantes.length);

    escribir(
      hoja,
      'D66',
      `${fecha.dia}/${fecha.mes}/${fecha.ano}`
    );

    const observaciones = [
      'Se utiliza el intento más reciente de cada estudiante en el período y año seleccionados.',
      totalPendientes > 0
        ? `Calificaciones pendientes: ${totalPendientes}. No se cuentan como inasistencia ni como no aprobadas.`
        : '',
      totalTutorias > 0
        ? 'Tutorías detalladas en la hoja TUTORIAS.'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    escribir(hoja, 'A64', 'Observaciones:');
    escribir(hoja, 'C64', observaciones);

    /*
     * No inventa resultados numéricos de inasistencia.
     * IN se cuenta en la fila Inasistentes.
     */
    hoja.pageSetup.printArea = 'A1:R73';

    if (totalTutorias > 0) {
      const tutoriasHoja = libro.addWorksheet(
        'TUTORIAS'
      );

      tutoriasHoja.columns = [
        { header: 'Cédula', key: 'cedula', width: 18 },
        { header: 'Estudiante', key: 'estudiante', width: 36 },
        { header: 'Período cursante', key: 'periodo', width: 20 },
        { header: 'Año escolar', key: 'ano', width: 16 },
        { header: 'Intento', key: 'intento', width: 12 },
        { header: 'Materia en tutoría', key: 'materia', width: 45 },
        { header: 'Nota', key: 'nota', width: 12 },
        { header: 'Resultado', key: 'resultado', width: 18 },
        { header: 'Fecha de registro', key: 'fecha', width: 22 },
      ];

      for (const inscripcion of inscripciones) {
        if (inscripcion.tipo_inscripcion !== 'tutoria') {
          continue;
        }

        const estudiante = estudiantes.find(
          (item) =>
            item.intento_id === inscripcion.intento_id
        );

        if (!estudiante) continue;

        const nota = notaEntera(
          inscripcion.nota,
          inscripcion.materia
        );

        tutoriasHoja.addRow({
          cedula: estudiante.cedula,
          estudiante:
            `${estudiante.apellidos} ${estudiante.nombres}`,
          periodo: periodoId,
          ano: anoEscolar,
          intento: estudiante.numero_intento,
          materia: inscripcion.materia,
          nota,
          resultado:
            nota === null
              ? 'Pendiente'
              : nota >= 3
                ? 'Aprobado'
                : 'No aprobado',
          fecha:
            inscripcion.fecha_resultado
              ? inscripcion.fecha_resultado.slice(0, 10)
              : '',
        });
      }

      tutoriasHoja.getRow(1).font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };

      tutoriasHoja.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' },
      };

      tutoriasHoja.views = [
        { state: 'frozen', ySplit: 1 },
      ];

      tutoriasHoja.pageSetup.orientation =
        'landscape';

      tutoriasHoja.pageSetup.fitToPage = true;
      tutoriasHoja.pageSetup.fitToWidth = 1;
      tutoriasHoja.pageSetup.fitToHeight = 0;
    }

    const buffer = await libro.xlsx.writeBuffer();

    const nombre =
      `ResumenAcademico_Periodo_${periodoId}_` +
      `${anoEscolar}_${fecha.ano}-${fecha.mes}-${fecha.dia}.xlsx`;

    return new NextResponse(
      new Uint8Array(buffer),
      {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':
            `attachment; filename="${nombre.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`,
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    await revertir(client, abierta);

    if (error instanceof ErrorResumen) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Error de resumen académico:', error);

    return NextResponse.json(
      {
        error:
          'No se pudo generar el resumen académico. Revise la terminal del servidor.',
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}