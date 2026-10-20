import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import {
  ErrorDocumento,
  esUuid,
  generarDocumento,
  listarEstudiantes,
} from '@/lib/documentosAcademicos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function autorizado(request: NextRequest) {
  const actor = verifyToken(
    request.cookies.get('token')?.value ?? ''
  );

  if (!actor) {
    throw new ErrorDocumento(
      401,
      'Debe iniciar sesión.'
    );
  }

  if (
    !['director', 'secretaria'].includes(
      actor.rol
    )
  ) {
    throw new ErrorDocumento(
      403,
      'Solo director y secretaría pueden consultar y generar estos documentos.'
    );
  }
}
function responderError(error: unknown) {
  if (error instanceof ErrorDocumento) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  console.error('Documentos académicos:', error);

  return NextResponse.json(
    {
      error:
        'No se pudo generar o consultar el documento. Revise la terminal del servidor.',
    },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  try {
    autorizado(request);

    const periodo = Number(
      request.nextUrl.searchParams.get('periodo_id')
    );

    if (
      !Number.isInteger(periodo) ||
      periodo < 1 ||
      periodo > 6
    ) {
      throw new ErrorDocumento(
        400,
        'Seleccione un período entre 1 y 6.'
      );
    }

    const busqueda = (
      request.nextUrl.searchParams.get('search') || ''
    ).trim();

    if (busqueda.length > 150) {
      throw new ErrorDocumento(
        400,
        'La búsqueda es demasiado larga.'
      );
    }

    const estudiantes = await listarEstudiantes(
      periodo,
      busqueda
    );

    return NextResponse.json(
      {
        estudiantes,
        limite: 100,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return responderError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    autorizado(request);

    let recibido: unknown;

    try {
      recibido = await request.json();
    } catch {
      throw new ErrorDocumento(
        400,
        'La solicitud no contiene un JSON válido.'
      );
    }

    if (
      typeof recibido !== 'object' ||
      recibido === null ||
      Array.isArray(recibido)
    ) {
      throw new ErrorDocumento(
        400,
        'La solicitud no es válida.'
      );
    }

    const body = recibido as Record<string, unknown>;
    const tipo = body.tipo ?? 'boletin';

    if (
      tipo !== 'boletin' &&
      tipo !== 'certificadas'
    ) {
      throw new ErrorDocumento(
        400,
        'Tipo de documento no válido.'
      );
    }

    if (!esUuid(body.estudiante_id)) {
      throw new ErrorDocumento(
        400,
        'Seleccione un estudiante válido.'
      );
    }

    if (
      tipo === 'boletin' &&
      !esUuid(body.intento_id)
    ) {
      throw new ErrorDocumento(
        400,
        'Seleccione el intento académico del boletín.'
      );
    }

    const documento = await generarDocumento(
      body.estudiante_id,
      tipo,
      typeof body.intento_id === 'string'
        ? body.intento_id
        : undefined
    );

    return new NextResponse(
      documento.contenido,
      {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':
            `attachment; filename="${documento.nombre}"`,
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return responderError(error);
  }
}