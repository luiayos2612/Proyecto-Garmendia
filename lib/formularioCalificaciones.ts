import type { TipoEvaluacion } from '@/lib/evaluacionMaterias';

export function valorCalificacionExistente(
  tipo: TipoEvaluacion,
  nota: number | string | null | undefined,
  resultado: string | null | undefined
): string {
  if (tipo === 'cualitativa') {
    return resultado === 'AP' || resultado === 'IN'
      ? resultado
      : '';
  }

  return nota == null ? '' : String(nota);
}

export function valorCalificacionValido(
  tipo: TipoEvaluacion,
  valor: string
): boolean {
  if (tipo === 'cualitativa') {
    return valor === 'AP' || valor === 'IN';
  }

  if (valor.trim() === '') return false;

  const numero = Number(valor);

  return (
    Number.isFinite(numero) &&
    numero >= 1 &&
    numero <= 5 &&
    Math.abs(numero * 100 - Math.round(numero * 100)) <= 0.000001
  );
}

export function camposCalificacion(
  tipo: TipoEvaluacion,
  valor: string
) {
  if (tipo === 'cualitativa') {
    return {
      nota: null,
      resultado_cualitativo: valor,
    };
  }

  return {
    nota: Number(valor),
    resultado_cualitativo: null,
  };
}

export function normalizarValorCalificacion(
  tipo: TipoEvaluacion,
  valor: string
): string {
  if (tipo === 'cualitativa') return valor.trim();

  return valor.trim() === '' ? '' : String(Number(valor));
}