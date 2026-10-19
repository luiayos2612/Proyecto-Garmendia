import { NextRequest } from 'next/server';
import { verificarPagoPorCuotas } from '@/lib/pagosPorCuota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return verificarPagoPorCuotas(request, id);
}