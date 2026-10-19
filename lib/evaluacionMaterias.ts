export type TipoEvaluacion = 'numerica' | 'cualitativa';
export type ResultadoCualitativo = 'AP' | 'IN';

export function tipoEvaluacionMateria(
  nombre: string
): TipoEvaluacion {
  const normalizado = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  return ['IDIOMAS', 'OFICIO'].includes(normalizado)
    ? 'cualitativa'
    : 'numerica';
}

type ResultadoValidacion =
  | {
      ok: true;
      nota: number | null;
      resultado_cualitativo: ResultadoCualitativo | null;
      texto: string;
    }
  | {
      ok: false;
      error: string;
    };

function tieneValor(valor: unknown) {
  return (
    valor !== undefined &&
    valor !== null &&
    !(typeof valor === 'string' && valor.trim() === '')
  );
}

export function validarResultadoMateria(
  nombreMateria: string,
  notaRecibida: unknown,
  resultadoRecibido: unknown
): ResultadoValidacion {
  const tipo = tipoEvaluacionMateria(nombreMateria);

  if (tipo === 'cualitativa') {
    if (tieneValor(notaRecibida)) {
      return {
        ok: false,
        error:
          'Idiomas y Oficio no admiten notas numéricas. ' +
          'Seleccione AP o IN.',
      };
    }

    const resultado =
      typeof resultadoRecibido === 'string'
        ? resultadoRecibido.trim().toUpperCase()
        : '';

    if (resultado !== 'AP' && resultado !== 'IN') {
      return {
        ok: false,
        error:
          'Debe seleccionar AP — Aprobado o IN — Inasistentes.',
      };
    }

    return {
      ok: true,
      nota: null,
      resultado_cualitativo: resultado,
      texto:
        resultado === 'AP'
          ? 'AP — Aprobado'
          : 'IN — Inasistentes',
    };
  }

  if (tieneValor(resultadoRecibido)) {
    return {
      ok: false,
      error: 'Esta materia utiliza una nota numérica de 1.00 a 5.00.',
    };
  }

  if (
    !tieneValor(notaRecibida) ||
    !['number', 'string'].includes(typeof notaRecibida)
  ) {
    return {
      ok: false,
      error: 'Debe ingresar una nota numérica.',
    };
  }

  const nota = Number(notaRecibida);

  if (
    !Number.isFinite(nota) ||
    nota < 1 ||
    nota > 5 ||
    Math.abs(nota * 100 - Math.round(nota * 100)) > 0.000001
  ) {
    return {
      ok: false,
      error:
        'La nota debe estar entre 1.00 y 5.00, ' +
        'con máximo dos decimales.',
    };
  }

  return {
    ok: true,
    nota,
    resultado_cualitativo: null,
    texto: `${nota.toFixed(2)}/5`,
  };
}