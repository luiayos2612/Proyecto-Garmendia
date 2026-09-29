import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/favicon.ico',
  '/logo.svg',
];

// ✅ NUEVO: se agregaron '/estudiantes/nuevo', '/materias', '/cupos'
// El docente NO debe poder crear estudiantes, ni gestionar materias/cupos.
const RUTAS_SOLO_ADMIN = [
  '/usuarios',
  '/api/usuarios',
  '/docentes',
  '/api/docentes',
  '/pagos',
  '/api/pagos',
  '/reportes/auditoria',
  '/api/auditoria',
  '/configuracion',
  '/api/configuracion',
  '/administracion',
  '/estudiantes/nuevo',   // ✅ NUEVO: alta de estudiante, solo director/secretaria
  '/materias',            // ✅ NUEVO: gestión de materias, solo director
  '/api/materias',        // ✅ NUEVO
  '/cupos',               // ✅ NUEVO: aprobación de cupos, solo director
  '/api/cupos',           // ✅ NUEVO
];

const RUTAS_SOLO_DIRECTOR = [
  '/reportes/boletines',
  '/api/boletines',
];

function coincideRuta(pathname: string, lista: string[]) {
  return lista.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function normalizeBase64Url(value: string) {
  return value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + (4 - (value.length % 4)) % 4, '=');
}

function base64UrlDecode(value: string) {
  const base64 = normalizeBase64Url(value);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const encoded = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Uint8Array.from(
      atob(normalizeBase64Url(signature)),
      (c) => c.charCodeAt(0)
    );

    const verified = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(encoded)
    );

    if (!verified) return null;

    const payloadJson = JSON.parse(base64UrlDecode(payload));
    const currentTime = Math.floor(Date.now() / 1000);

    if (!payloadJson.exp || currentTime >= payloadJson.exp) return null;

    return payloadJson;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_static')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;
  const jwtSecret = process.env.JWT_SECRET || '';

  const payload = token && jwtSecret ? await verifyJwt(token, jwtSecret) : null;

  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Bloqueo exclusivo de director (Boletines) — regla más estricta primero
  if (payload.rol !== 'director' && coincideRuta(pathname, RUTAS_SOLO_DIRECTOR)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Solo el administrador puede acceder a este recurso' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Bloqueo de docente en rutas administrativas generales
  if (payload.rol === 'docente' && coincideRuta(pathname, RUTAS_SOLO_ADMIN)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No tiene permisos para acceder a este recurso' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/webpack|favicon.ico|logo.svg).*)'],
};