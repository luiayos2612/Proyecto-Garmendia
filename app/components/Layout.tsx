'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  UserPlus,
  BookOpen,
  FileText,
  Settings,
  LogOut,
  Bell,
  Search,
  ChevronRight,
  ChevronDown,
  PlusCircle,
  ClipboardList,
  Activity,
} from 'lucide-react';
import { LOGO_BASE64 } from './logo';
import { useLoading } from './LoadingContext';

type MenuSubItem = {
  title: string;
  href: string;
  icon: any;
  soloDirector?: boolean;
};

type MenuItem = {
  id: string;
  title: string;
  icon: any;
  href: string;
  subItems: MenuSubItem[];
  soloDirector?: boolean;
};

const menuStructure: MenuItem[] = [
  {
    id: 'inicio',
    title: 'Inicio',
    icon: LayoutDashboard,
    href: '/dashboard',
    subItems: [],
  },
  {
    id: 'academico',
    title: 'Académico',
    icon: GraduationCap,
    href: '#',
    subItems: [
      { title: 'Estudiantes', href: '/estudiantes', icon: Users },
      { title: 'Nueva Inscripcion', href: '/estudiantes/nuevo', icon: PlusCircle, soloDirector: true },
      { title: 'Docentes', href: '/docentes', icon: GraduationCap, soloDirector: true },
      { title: 'Materias', href: '/materias', icon: BookOpen, soloDirector: true },
      { title: 'Asignaciones', href: '/asignaciones', icon: ClipboardList },
      { title: 'Calificaciones', href: '/calificaciones', icon: FileText },
    ],
  },
  {
    id: 'admin',
    title: 'Administración',
    icon: Settings,
    href: '#',
    soloDirector: true,
    subItems: [
      { title: 'Usuarios', href: '/usuarios', icon: UserPlus },
      { title: 'Pagos', href: '/pagos', icon: FileText },
      { title: 'Finanzas', href: '/administracion/finanzas', icon: Activity },
      { title: 'Cupos', href: '/cupos', icon: GraduationCap },
    ],
  },
  {
    id: 'reportes',
    title: 'Reportes',
    icon: FileText,
    href: '/reportes',
    soloDirector: true,
    subItems: [
      { title: 'Auditoría', href: '/reportes/auditoria', icon: Activity },
      { title: 'Boletines', href: '/reportes/boletines', icon: FileText },
      { title: 'Estadísticas', href: '/reportes/estadisticas', icon: FileText },
    ],
  },
  {
    id: 'config',
    title: 'Configuración',
    icon: Settings,
    href: '/configuracion',
    soloDirector: true,
    subItems: [],
  },
];

interface LayoutProps {
  children: React.ReactNode;
  rol: string;
  nombre: string;
}

export default function Layout({ children, rol, nombre }: LayoutProps) {
  const pathname = usePathname();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['academico']);
  const { isLoading } = useLoading();

  const esDirector = rol === 'director';

  const menuVisible = menuStructure
    .filter((item) => !item.soloDirector || esDirector)
    .map((item) => ({
      ...item,
      subItems: item.subItems.filter((sub) => !sub.soloDirector || esDirector),
    }));

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    // ✅ MODIFICADO: antes era router.push('/login').
    // window.location.href fuerza que TODO el árbol de React se desmonte
    // y se vuelva a pedir al servidor, eliminando cualquier estado de rol
    // "pegado" en memoria del navegador (Router Cache de Next.js).
    window.location.href = '/login';
  };

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuId) ? prev.filter((id) => id !== menuId) : [...prev, menuId]
    );
  };

  const isActive = (href: string) => {
    if (href === '#') return false;
    return pathname === href || pathname?.startsWith(href + '/');
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <aside className="w-64 bg-[#1e3a8a] fixed left-0 top-0 h-screen z-30 flex flex-col shadow-2xl">
        <div className="p-5 border-b border-white/10 bg-gradient-to-br from-blue-900 to-blue-800">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 flex-shrink-0">
              {isLoading && (
                <div className="absolute -inset-1.5 rounded-full border-[2.5px] border-transparent border-t-white/90 border-r-white/40 animate-spin" />
              )}
              <div className="h-12 w-12 rounded-full overflow-hidden bg-white/10 border-2 border-white/20 flex items-center justify-center transition-all duration-500">
                <img src={LOGO_BASE64} alt="Logo" className="object-contain p-1 w-full h-full" />
              </div>
            </div>
            <div>
              <h1 className="font-bold text-white text-sm leading-tight">Julio Garmendia</h1>
              <p className="text-[10px] text-blue-200">Sistema de Gestión</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {menuVisible.map((item) => {
            const Icon = item.icon;
            const hasSubItems = item.subItems.length > 0;
            const isExpanded = expandedMenus.includes(item.id);
            const isMenuActive = hasSubItems && item.subItems.some((sub) => isActive(sub.href));

            return (
              <div key={item.id} className="mb-0.5">
                <button
                  onClick={hasSubItems ? () => toggleMenu(item.id) : undefined}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isMenuActive || isActive(item.href)
                      ? 'bg-white/15 text-white shadow-lg border border-white/10'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Link
                    href={hasSubItems ? item.href : item.href}
                    className="flex items-center gap-3 flex-1"
                    onClick={(e) => {
                      if (hasSubItems) e.preventDefault();
                    }}
                  >
                    <Icon size={20} />
                    <span>{item.title}</span>
                  </Link>
                  {hasSubItems && (
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>

                {hasSubItems && isExpanded && (
                  <div className="mt-0.5 ml-3 pl-3 border-l border-white/20 space-y-0.5 animate-in slide-in-from-top-2 duration-200">
                    {item.subItems.map((sub) => {
                      const SubIcon = sub.icon;
                      const subActive = isActive(sub.href);
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 ${
                            subActive
                              ? 'bg-blue-500/30 text-white font-semibold border-l-2 border-white'
                              : 'text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <SubIcon size={16} />
                          <span>{sub.title}</span>
                          {subActive && <ChevronRight size={14} className="ml-auto" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 bg-blue-900/50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-rose-300 hover:bg-white/5 rounded-xl transition-all"
          >
            <LogOut size={20} />
            <span className="text-sm font-bold">Cerrar Sesión</span>
          </button>
          <div className="mt-4 text-center">
            <p className="text-[10px] text-blue-300">v1.0 - 2026</p>
            <p className="text-[10px] text-blue-400">Servicio Comunitario</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col md:ml-64 h-screen overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md w-full hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar estudiante, materia..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className="h-8 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-3 bg-slate-50 pl-4 pr-2 py-1.5 rounded-full border border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-900">{nombre}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase">
                  {esDirector ? 'Director' : 'Docente'}
                </p>
              </div>
              <div className="h-8 w-8 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center border-2 border-white">
                {nombre?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
