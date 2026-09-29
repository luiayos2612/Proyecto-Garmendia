import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import Layout from '../components/Layout';
import { UserProvider } from '../components/UserContext';

// ✅ NUEVO: fuerza que este layout NUNCA se sirva desde el Router Cache
// del navegador. Cada navegación a /dashboard/* vuelve a pasar por aquí,
// que vuelve a leer la cookie real. Esto es el "cinturón de seguridad"
// que complementa el cambio de router.push -> window.location.href.
export const dynamic = 'force-dynamic';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value ?? '';
  const payload = verifyToken(token);

  const rol = payload?.rol ?? 'docente';
  const nombre = payload?.nombre ?? 'Usuario';

  return (
    <UserProvider rol={rol} nombre={nombre}>
      <Layout rol={rol} nombre={nombre}>
        {children}
      </Layout>
    </UserProvider>
  );
}