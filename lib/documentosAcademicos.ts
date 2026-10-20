
import ExcelJS from 'exceljs';
import { join } from 'path';
import { Pool, type PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export class ErrorDocumento extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface IntentoDocumento {
  id: string;
  periodo_id: number;
  numero_intento: number;
  ano_escolar: string;
  estado: string;
  resultado_cierre: string | null;
  lapso_academico: string | null;
}

interface Estudiante {
  id: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
}

interface Resultado {
  inscripcion_id: string;
  materia_id: string;
  materia: string;
  periodo_id: number;
  intento_id: string;
  numero_intento: number;
  ano_escolar: string;
  tipo_inscripcion: string;
  nota: number | null;
  resultado_cualitativo: string | null;
  fecha: string | null;
  nota_recuperada: number | null;
  fecha_recuperacion: string | null;
}

export function esUuid(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      valor
    )
  );
}

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

type Componente =
  | 'lengua'
  | 'matematica'
  | 'ciencias'
  | 'memoria'
  | 'participacion'
  | 'idiomas'
  | 'oficio';

function componente(nombre: string): Componente {
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

  if (valor === 'CIENCIAS NATURALES') {
    return 'ciencias';
  }

  if (
    valor.includes('MEMORIA') &&
    valor.includes('CIUDADANIA')
  ) {
    return 'memoria';
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

  throw new ErrorDocumento(
    409,
    `La materia "${nombre}" no está mapeada en las plantillas. No se exportó para evitar omitirla.`
  );
}

function notaEntera(valor: unknown, materia: string) {
  if (valor === null || valor === undefined) {
    return null;
  }

  const nota = Number(valor);

  if (
    !Number.isInteger(nota) ||
    nota < 1 ||
    nota > 5
  ) {
    throw new ErrorDocumento(
      409,
      `"${materia}" tiene una nota fuera del formato entero de 1 a 5: ${valor}. Revise ese registro; no se redondeará automáticamente.`
    );
  }

  return nota;
}

const NUMEROS: Record<number, string> = {
  1: 'UNO',
  2: 'DOS',
  3: 'TRES',
  4: 'CUATRO',
  5: 'CINCO',
};

function enLetras(nota: number, conCategoria: boolean) {
  const texto = NUMEROS[nota];

  if (!texto) {
    throw new ErrorDocumento(
      409,
      'No existe equivalencia para la nota recibida.'
    );
  }

  return conCategoria
    ? `${texto} (E${nota})`
    : texto;
}

function cualitativo(resultado: Resultado) {
  const tipo = componente(resultado.materia);

  if (tipo === 'participacion') {
    const nota = notaEntera(
      resultado.nota,
      resultado.materia
    );

    return nota === null
      ? null
      : nota >= 3
        ? 'AP'
        : 'IN';
  }

  const valor = resultado.resultado_cualitativo;

  if (valor === null || valor === '') {
    return null;
  }

  if (valor !== 'AP' && valor !== 'IN') {
    throw new ErrorDocumento(
      409,
      `Resultado cualitativo no válido en "${resultado.materia}".`
    );
  }

  return valor;
}

function letrasCualitativas(valor: string) {
  return valor === 'AP'
    ? 'APROBADO'
    : 'INASISTENTES';
}

function tieneResultado(resultado: Resultado) {
  return (
    resultado.nota !== null ||
    resultado.resultado_cualitativo !== null
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

function fechaPartes(fecha: string | null) {
  if (!fecha) {
    return { mes: '', ano: '' };
  }

  const fechaCorta = fecha.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorta)) {
    return { mes: '', ano: '' };
  }

  return {
    mes: fechaCorta.slice(5, 7),
    ano: fechaCorta.slice(0, 4),
  };
}

function fechaHumana(fecha: string | null) {
  if (!fecha) return '';

  const corta = fecha.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(corta)) {
    return '';
  }

  return [
    corta.slice(8, 10),
    corta.slice(5, 7),
    corta.slice(0, 4),
  ].join('/');
}

function hoyCaracas() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const obtener = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value || '';

  return `${obtener('day')}/${obtener('month')}/${obtener('year')}`;
}

export async function listarEstudiantes(
  periodo: number,
  busqueda: string
) {
  const resultado = await pool.query(
    `
      SELECT
        e.id,
        e.cedula,
        e.nombres,
        e.apellidos,

        (
          SELECT json_agg(
            json_build_object(
              'id', ia.id,
              'periodo_id', ia.periodo_id,
              'numero_intento', ia.numero_intento,
              'ano_escolar', ia.ano_escolar,
              'estado', ia.estado
            )
            ORDER BY
              ia.numero_intento DESC,
              ia.created_at DESC,
              ia.id DESC
          )
          FROM intentos_academicos ia
          WHERE ia.estudiante_id = e.id
            AND ia.periodo_id = $1
            AND ia.estado IN (
              'en_curso', 'cerrado', 'culminado'
            )
        ) AS intentos

      FROM estudiantes e

      WHERE EXISTS (
        SELECT 1
        FROM intentos_academicos ia
        WHERE ia.estudiante_id = e.id
          AND ia.periodo_id = $1
          AND ia.estado IN (
            'en_curso', 'cerrado', 'culminado'
          )
      )

      AND (
        $2 = ''
        OR CONCAT_WS(
          ' ',
          e.cedula,
          e.nombres,
          e.apellidos
        ) ILIKE '%' || $2 || '%'
      )

      ORDER BY e.apellidos, e.nombres
      LIMIT 100
    `,
    [periodo, busqueda]
  );

  return resultado.rows;
}

async function obtenerDatos(
  client: PoolClient,
  estudianteId: string
) {
  const estudianteResult = await client.query(
    `
      SELECT
        id,
        cedula,
        nombres,
        apellidos,
        fecha_nacimiento::text AS fecha_nacimiento
      FROM estudiantes
      WHERE id = $1::uuid
    `,
    [estudianteId]
  );

  if (estudianteResult.rows.length !== 1) {
    throw new ErrorDocumento(
      404,
      'El estudiante no existe.'
    );
  }

  const intentosResult = await client.query(
    `
      SELECT
        ia.id,
        ia.periodo_id,
        ia.numero_intento,
        ia.ano_escolar,
        ia.estado,
        ia.resultado_cierre,
        to_jsonb(ia)->>'lapso_academico'
          AS lapso_academico
      FROM intentos_academicos ia
      WHERE ia.estudiante_id = $1::uuid
        AND ia.estado IN (
          'en_curso', 'cerrado', 'culminado'
        )
      ORDER BY
        ia.periodo_id,
        ia.numero_intento,
        ia.created_at,
        ia.id
    `,
    [estudianteId]
  );

  const resultados = await client.query(
    `
      SELECT
        im.id AS inscripcion_id,
        im.materia_id,
        m.nombre AS materia,
        im.periodo_id,
        ia.id AS intento_id,
        ia.numero_intento,
        ia.ano_escolar,
        im.tipo_inscripcion,

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
        ) AS fecha,

        recuperacion.nota_final AS nota_recuperada,

        COALESCE(
          to_jsonb(recuperacion)->>'fecha_aprobacion',
          to_jsonb(recuperacion)->>'fecha_cierre',
          (
            SELECT MAX(c2.fecha_cierre)::text
            FROM inscripciones_materias im2
            JOIN calificaciones c2
              ON c2.inscripcion_id = im2.id
            WHERE im2.tutoria_id = recuperacion.id
              AND c2.nota >= 3
          )
        ) AS fecha_recuperacion

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

      LEFT JOIN tutorias_academicas recuperacion
        ON recuperacion.inscripcion_origen_id = im.id
        AND recuperacion.estado = 'aprobada'

      WHERE im.estudiante_id = $1::uuid
        AND ia.estado IN (
          'en_curso', 'cerrado', 'culminado'
        )

      ORDER BY
        ia.periodo_id,
        ia.numero_intento,
        ia.created_at,
        ia.id,
        im.id
    `,
    [estudianteId]
  );

  const filas: Resultado[] = resultados.rows.map(
    (fila) => ({
      ...fila,
      periodo_id: Number(fila.periodo_id),
      numero_intento: Number(fila.numero_intento),
      nota:
        fila.nota == null
          ? null
          : Number(fila.nota),
      nota_recuperada:
        fila.nota_recuperada == null
          ? null
          : Number(fila.nota_recuperada),
    })
  );

  const inscripciones = new Set<string>();

  for (const fila of filas) {
    if (inscripciones.has(fila.inscripcion_id)) {
      throw new ErrorDocumento(
        409,
        'Una inscripción devuelve varios resultados relacionados. Debe revisarse antes de certificar.'
      );
    }

    inscripciones.add(fila.inscripcion_id);
  }

  return {
    estudiante: estudianteResult.rows[0] as Estudiante,
    intentos: intentosResult.rows as IntentoDocumento[],
    resultados: filas,
  };
}

async function cargarLibro(
  archivo: string,
  nombreHoja: string
) {
  const libro = new ExcelJS.Workbook();

  await libro.xlsx.readFile(
    join(
      process.cwd(),
      'public',
      'templates',
      archivo
    )
  );

  const hoja = libro.getWorksheet(nombreHoja);

  if (!hoja) {
    throw new ErrorDocumento(
      500,
      `La plantilla no contiene la hoja "${nombreHoja}".`
    );
  }

  return { libro, hoja };
}

async function generarBoleta(
  datos: Awaited<ReturnType<typeof obtenerDatos>>,
  intentoId: string
) {
  const intento = datos.intentos.find(
    (item) => item.id === intentoId
  );

  if (!intento) {
    throw new ErrorDocumento(
      404,
      'El intento seleccionado no pertenece al estudiante o no está disponible.'
    );
  }

  const { libro, hoja } = await cargarLibro(
    'boleta_calificaciones.xlsx',
    'Boleta_Impresion'
  );

  const equivalencias = libro.getWorksheet(
    'Equivalencias'
  );

  if (!equivalencias) {
    throw new ErrorDocumento(
      500,
      'La boleta no contiene la hoja Equivalencias.'
    );
  }

  /*
   * Solo se escriben valores en Boleta_Impresion.
   * Las otras hojas se conservan sin llenarlas.
   */
  for (const direccion of [
    'J5',
    'B8',
    'E8',
    'B9',
    'C9',
    'B10',
    'D27',
    'E27',
    'A29',
    'A32',
  ]) {
    escribir(hoja, direccion, null);
  }

  for (let fila = 15; fila <= 21; fila++) {
    escribir(hoja, `D${fila}`, null);
    escribir(hoja, `E${fila}`, null);
  }

  for (const fila of [25, 26]) {
    for (const columna of ['A', 'B', 'C', 'D', 'E']) {
      escribir(hoja, `${columna}${fila}`, null);
    }
  }

  escribir(
    hoja,
    'B8',
    `${datos.estudiante.nombres} ${datos.estudiante.apellidos}`
  );
  escribir(hoja, 'E8', datos.estudiante.cedula);
  hoja.getCell('E8').numFmt = '@';

  escribir(hoja, 'B9', intento.ano_escolar);
  escribir(
    hoja,
    'C9',
    `Período Cursante: ${intento.periodo_id}°`
  );
  escribir(
    hoja,
    'B10',
    intento.lapso_academico || ''
  );

  const filas: Record<Componente, number> = {
    lengua: 15,
    matematica: 16,
    ciencias: 17,
    memoria: 18,
    participacion: 19,
    idiomas: 20,
    oficio: 21,
  };

  const resultados = datos.resultados.filter(
    (fila) => fila.intento_id === intento.id
  );

  const regulares = resultados.filter(
    (fila) => fila.tipo_inscripcion === 'regular'
  );

  const tutorias = resultados.filter(
    (fila) => fila.tipo_inscripcion === 'tutoria'
  );

  if (tutorias.length > 2) {
    throw new ErrorDocumento(
      409,
      'El intento tiene más de dos tutorías y la plantilla solamente dispone de dos filas.'
    );
  }

  const presentes = new Set<Componente>();
  const notasPromedio: number[] = [];

  for (const resultado of regulares) {
    const tipo = componente(resultado.materia);

    if (presentes.has(tipo)) {
      throw new ErrorDocumento(
        409,
        `Dos materias del intento apuntan al mismo componente: ${resultado.materia}.`
      );
    }

    presentes.add(tipo);

    const fila = filas[tipo];

    if (
      tipo === 'participacion' ||
      tipo === 'idiomas' ||
      tipo === 'oficio'
    ) {
      const valor = cualitativo(resultado);

      if (valor) {
        escribir(hoja, `D${fila}`, valor);
        escribir(
          hoja,
          `E${fila}`,
          letrasCualitativas(valor)
        );
      }

      continue;
    }

    const nota = notaEntera(
      resultado.nota,
      resultado.materia
    );

    if (nota !== null) {
      escribir(hoja, `D${fila}`, nota);
      hoja.getCell(`D${fila}`).numFmt = '0';

      escribir(
        hoja,
        `E${fila}`,
        enLetras(nota, true)
      );

      notasPromedio.push(nota);
    }
  }

  tutorias.forEach((resultado, indice) => {
    const fila = 25 + indice;
    const nota = notaEntera(
      resultado.nota,
      resultado.materia
    );

    escribir(hoja, `A${fila}`, resultado.materia);

    if (nota !== null) {
      escribir(hoja, `B${fila}`, nota);
      hoja.getCell(`B${fila}`).numFmt = '0';

      escribir(
        hoja,
        `C${fila}`,
        enLetras(nota, true)
      );

      notasPromedio.push(nota);

      const fecha = fechaPartes(resultado.fecha);
      escribir(hoja, `D${fila}`, fecha.mes);
      escribir(hoja, `E${fila}`, fecha.ano);
    }
  });

  const completas =
    resultados.length > 0 &&
    resultados.every(tieneResultado);

  if (notasPromedio.length > 0) {
    const promedio = Number(
      (
        notasPromedio.reduce(
          (suma, nota) => suma + nota,
          0
        ) / notasPromedio.length
      ).toFixed(2)
    );

    escribir(hoja, 'D27', promedio);
    hoja.getCell('D27').numFmt = '0.00';

    escribir(
      hoja,
      'E27',
      enLetras(Math.round(promedio), true)
    );

    if (completas) {
      const redondeado = Math.round(promedio);

      // A9=5, A10=4, A11=3, A12=2, A13=1.
      const filaObservacion = 14 - redondeado;
      const observacion = equivalencias.getCell(
        `B${filaObservacion}`
      ).text;

      escribir(hoja, 'A32', observacion);
    }
  }

  const textosCierre: Record<string, string> = {
    avance: 'Resultado Final: Aprobado',
    avance_con_tutorias:
      'Resultado Final: Avance con tutorías',
    repeticion: 'Resultado Final: Repetición',
    recuperacion_final:
      'Resultado Final: Recuperación final',
    culminacion: 'Resultado Final: Estudios culminados',
  };

  const cierre =
    intento.resultado_cierre &&
    textosCierre[intento.resultado_cierre];

  escribir(
    hoja,
    'A29',
    intento.estado === 'en_curso'
      ? completas
        ? 'Resultado Final: Pendiente de cierre académico'
        : 'Resultado Final: Calificaciones pendientes'
      : cierre ||
        'Resultado Final: Consultar cierre académico'
  );

  /*
   * La zona I:J es el selector manual de ejemplo,
   * fuera de la boleta imprimible A:E.
   */
  hoja.getColumn(9).hidden = true;
  hoja.getColumn(10).hidden = true;

  libro.views = [
  {
    x: 0,
    y: 0,
    width: 12000,
    height: 9000,
    visibility: 'visible',
    firstSheet: 0,
    activeTab: libro.worksheets.indexOf(hoja),
  },
 ];

  return libro;
}

async function generarCertificacion(
  datos: Awaited<ReturnType<typeof obtenerDatos>>
) {
  const { libro, hoja } = await cargarLibro(
    'boletines_template.xlsx',
    'CERTIFICACION DE NOTAS'
  );

  const bloques = [
    { periodo: 1, inicio: 22, derecha: false },
    { periodo: 2, inicio: 22, derecha: true },
    { periodo: 3, inicio: 31, derecha: false },
    { periodo: 4, inicio: 31, derecha: true },
    { periodo: 5, inicio: 40, derecha: false },
    { periodo: 6, inicio: 40, derecha: true },
  ];

  for (const bloque of bloques) {
    const columnas = bloque.derecha
      ? ['K', 'L', 'M', 'N', 'O', 'P']
      : ['C', 'D', 'E', 'F', 'G', 'H'];

    // Cuatro materias numéricas.
    for (let i = 0; i < 4; i++) {
      for (const columna of columnas) {
        escribir(
          hoja,
          `${columna}${bloque.inicio + i}`,
          null
        );
      }
    }

    // Participación: dos renglones de la plantilla.
    for (const fila of [
      bloque.inicio + 4,
      bloque.inicio + 5,
    ]) {
      for (const columna of columnas) {
        escribir(hoja, `${columna}${fila}`, null);
      }
    }
  }

  // Filas de resultados de Idiomas y Oficio.
  for (let fila = 49; fila <= 52; fila++) {
    for (const columna of [
      'A', 'C', 'E', 'F', 'G',
      'J', 'K', 'M', 'N', 'O',
    ]) {
      escribir(hoja, `${columna}${fila}`, null);
    }
  }

  /*
   * C47 y K47 son etiquetas de aprobación precargadas.
   * Se conservan las demás etiquetas del formulario.
   */
  escribir(hoja, 'C47', 'RESULTADO');
  escribir(hoja, 'K47', 'RESULTADO');

  escribir(hoja, 'C9', datos.estudiante.cedula);
  escribir(hoja, 'C10', datos.estudiante.apellidos);
  escribir(hoja, 'K10', datos.estudiante.nombres);
  escribir(
    hoja,
    'K9',
    fechaHumana(datos.estudiante.fecha_nacimiento)
  );

  escribir(hoja, 'C11', '');
  escribir(hoja, 'K11', '');

  escribir(hoja, 'M4', hoyCaracas());

  // No atribuir una transferencia de estudios inexistente.
  escribir(hoja, 'A54', '');
  escribir(hoja, 'A55', '');

  /*
   * Una casilla por materia y período:
   * conserva la inscripción regular del intento más reciente,
   * incluso si todavía está pendiente.
   */
  const vigentes = new Map<string, Resultado>();

  for (const resultado of datos.resultados) {
    if (resultado.tipo_inscripcion !== 'regular') {
      continue;
    }

    componente(resultado.materia);

    vigentes.set(
      `${resultado.periodo_id}:${resultado.materia_id}`,
      resultado
    );
  }

  const posiciones: Partial<
    Record<Componente, number>
  > = {
    lengua: 0,
    matematica: 1,
    memoria: 2,
    ciencias: 3,
  };

  const ocupadas = new Set<string>();

  for (const resultadoOriginal of vigentes.values()) {
    const tipo = componente(resultadoOriginal.materia);

    if (tipo === 'idiomas' || tipo === 'oficio') {
      continue;
    }

    const bloque = bloques.find(
      (item) =>
        item.periodo === resultadoOriginal.periodo_id
    );

    if (!bloque) {
      throw new ErrorDocumento(
        409,
        'Hay un resultado fuera de los períodos 1 al 6.'
      );
    }

    const posicion =
      `${bloque.periodo}:${tipo}`;

    if (ocupadas.has(posicion)) {
      throw new ErrorDocumento(
        409,
        'Dos materias distintas apuntan a la misma casilla de certificación.'
      );
    }

    ocupadas.add(posicion);

    const recuperada =
      resultadoOriginal.nota_recuperada !== null;

    const resultado: Resultado = {
      ...resultadoOriginal,
      nota: recuperada
        ? resultadoOriginal.nota_recuperada
        : resultadoOriginal.nota,
      fecha: recuperada
        ? resultadoOriginal.fecha_recuperacion
        : resultadoOriginal.fecha,
    };

    const num = bloque.derecha ? 'K' : 'C';
    const letras = bloque.derecha ? 'L' : 'D';
    const mes = bloque.derecha ? 'N' : 'F';
    const ano = bloque.derecha ? 'O' : 'G';
    const plantel = bloque.derecha ? 'P' : 'H';

    if (tipo === 'participacion') {
      const valor = cualitativo(resultado);

      if (!valor) continue;

      const fila =
        bloque.inicio + (valor === 'AP' ? 4 : 5);

      escribir(
        hoja,
        `${num}${fila}`,
        `${valor} — ${letrasCualitativas(valor)}`
      );

      const fecha = fechaPartes(resultado.fecha);

      escribir(hoja, `${mes}${fila}`, fecha.mes);
      escribir(hoja, `${ano}${fila}`, fecha.ano);
      escribir(hoja, `${plantel}${fila}`, 1);

      continue;
    }

    const desplazamiento = posiciones[tipo];

    if (desplazamiento === undefined) continue;

    const nota = notaEntera(
      resultado.nota,
      resultado.materia
    );

    if (nota === null) continue;

    const fila = bloque.inicio + desplazamiento;

    escribir(hoja, `${num}${fila}`, nota);
    hoja.getCell(`${num}${fila}`).numFmt = '0';

    escribir(
      hoja,
      `${letras}${fila}`,
      enLetras(nota, false)
    );

    const fecha = fechaPartes(resultado.fecha);

    escribir(hoja, `${mes}${fila}`, fecha.mes);
    escribir(hoja, `${ano}${fila}`, fecha.ano);
    escribir(hoja, `${plantel}${fila}`, 1);
  }

  /*
   * Idiomas y Oficio tienen su propio bloque.
   * Una fila por período con resultado;
   * si hay AP, se conserva la aprobación registrada
   * sin reemplazarla por una inasistencia posterior.
   */
  for (const tipo of ['idiomas', 'oficio'] as const) {
    const porPeriodo = new Map<number, Resultado>();

    for (const resultado of datos.resultados) {
      if (
        resultado.tipo_inscripcion !== 'regular' ||
        componente(resultado.materia) !== tipo ||
        !resultado.resultado_cualitativo
      ) {
        continue;
      }

      const anterior = porPeriodo.get(
        resultado.periodo_id
      );

      if (
        anterior?.resultado_cualitativo === 'AP'
      ) {
        continue;
      }

      porPeriodo.set(
        resultado.periodo_id,
        resultado
      );
    }

    const resultados = Array.from(
      porPeriodo.values()
    ).sort(
      (a, b) => a.periodo_id - b.periodo_id
    );

    if (resultados.length > 4) {
      throw new ErrorDocumento(
        409,
        `La certificación tiene cuatro filas para ${tipo}, pero existen resultados en más de cuatro períodos. No se truncará el historial.`
      );
    }

    resultados.forEach((resultado, indice) => {
      const valor = cualitativo(resultado);

      if (!valor) return;

      const fila = 49 + indice;
      const fecha = fechaPartes(resultado.fecha);

      const columnaResultado =
        tipo === 'idiomas' ? 'C' : 'K';
      const columnaMes =
        tipo === 'idiomas' ? 'E' : 'M';
      const columnaAno =
        tipo === 'idiomas' ? 'F' : 'N';
      const columnaPeriodo =
        tipo === 'idiomas' ? 'G' : 'O';

      escribir(
        hoja,
        `${columnaResultado}${fila}`,
        `${valor} — ${letrasCualitativas(valor)}`
      );
      escribir(
        hoja,
        `${columnaMes}${fila}`,
        fecha.mes
      );
      escribir(
        hoja,
        `${columnaAno}${fila}`,
        fecha.ano
      );
      escribir(
        hoja,
        `${columnaPeriodo}${fila}`,
        resultado.periodo_id
      );
    });
  }

  return libro;
}

export async function generarDocumento(
  estudianteId: string,
  tipo: 'boletin' | 'certificadas',
  intentoId?: string
) {
  const client = await pool.connect();
  let abierta = false;

  try {
    await client.query(
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
    );
    abierta = true;

    const datos = await obtenerDatos(
      client,
      estudianteId
    );

    await client.query('COMMIT');
    abierta = false;

    const libro =
      tipo === 'boletin'
        ? await generarBoleta(
            datos,
            intentoId || ''
          )
        : await generarCertificacion(datos);

    const buffer = await libro.xlsx.writeBuffer();

    const nombreBase = [
      tipo === 'boletin'
        ? 'Boletin'
        : 'Notas_Certificadas',
      datos.estudiante.apellidos,
      datos.estudiante.nombres,
    ]
      .join('_')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    return {
      contenido: new Uint8Array(buffer),
      nombre: `${nombreBase}.xlsx`,
    };
  } finally {
    if (abierta) {
      await client.query('ROLLBACK').catch(
        (error) => {
          console.error(
            'Rollback de documentos:',
            error
          );
        }
      );
    }

    client.release();
  }
}