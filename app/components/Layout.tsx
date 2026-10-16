'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  UserRound,
  School,
  BookMarked,
  ClipboardCheck,
  CreditCard,
  X,
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
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
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

    useEffect(() => {
    const termino = searchTerm.trim();

    if (termino.length < 2) {
      setSearchResults(null);
      setShowSearchResults(false);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setSearchLoading(true);

        const response = await fetch(
          `/api/busqueda?q=${encodeURIComponent(termino)}`
        );

        if (!response.ok) {
          throw new Error('No se pudo realizar la búsqueda');
        }

        const data = await response.json();

        setSearchResults(data);
        setShowSearchResults(true);
      } catch (error) {
        console.error('Error al buscar:', error);
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const limpiarBusqueda = () => {
    setSearchTerm('');
    setSearchResults(null);
    setShowSearchResults(false);
  };

  const navegarResultado = (href: string) => {
    limpiarBusqueda();
    router.push(href);
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

        <nav className="sidebar-scroll flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
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
            <div
              ref={searchContainerRef}
              className="relative w-full max-w-[440px]"
            >
              <Search
                size={19}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onFocus={() => {
                  if (searchResults) {
                    setShowSearchResults(true);
                  }
                }}
                placeholder="Buscar estudiantes, docentes, notas, pagos..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-10 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />

              {searchTerm && (
                <button
                  type="button"
                  onClick={limpiarBusqueda}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  <X size={16} />
                </button>
              )}

              {showSearchResults && (
                <div className="absolute left-0 top-[calc(100%+8px)] z-50 max-h-[430px] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {searchLoading && (
                    <div className="px-3 py-4 text-sm text-slate-500">
                      Buscando información...
                    </div>
                  )}

                  {!searchLoading &&
                    searchResults &&
                    Object.values(searchResults).every(
                      (resultados: any) =>
                        !Array.isArray(resultados) || resultados.length === 0
                    ) && (
                      <div className="px-3 py-4 text-sm text-slate-500">
                        No se encontraron resultados para “{searchTerm}”.
                      </div>
                    )}

                  {!searchLoading && searchResults?.estudiantes?.length > 0 && (
                    <div className="mb-2">
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Estudiantes
                      </p>

                      {searchResults.estudiantes.map((estudiante: any) => (
                        <button
                          key={estudiante.id}
                          type="button"
                          onClick={() =>
                            navegarResultado(`/estudiantes/${estudiante.id}`)
                          }
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-blue-50"
                        >
                          <UserRound size={18} className="text-blue-600" />

                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {estudiante.nombre}
                            </p>
                            <p className="text-xs text-slate-500">
                              C.I.: {estudiante.cedula || 'Sin cédula'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {!searchLoading && searchResults?.docentes?.length > 0 && (
                    <div className="mb-2 border-t border-slate-100 pt-2">
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Docentes
                      </p>

                      {searchResults.docentes.map((docente: any) => (
                        <button
                          key={docente.id}
                          type="button"
                          onClick={() => navegarResultado(`/docentes/${docente.id}`)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-violet-50"
                        >
                          <School size={18} className="text-violet-600" />

                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {docente.nombre}
                            </p>
                            <p className="text-xs text-slate-500">
                              C.I.: {docente.cedula || 'Sin cédula'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {!searchLoading && searchResults?.materias?.length > 0 && (
                    <div className="mb-2 border-t border-slate-100 pt-2">
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Materias
                      </p>

                      {searchResults.materias.map((materia: any) => (
                        <button
                          key={materia.id}
                          type="button"
                          onClick={() => navegarResultado(`/materias/${materia.id}`)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-amber-50"
                        >
                          <BookMarked size={18} className="text-amber-600" />

                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {materia.nombre}
                            </p>
                            <p className="text-xs text-slate-500">
                              Código: {materia.codigo || 'Sin código'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {!searchLoading && searchResults?.asignaciones?.length > 0 && (
                    <div className="mb-2 border-t border-slate-100 pt-2">
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Asignaciones
                      </p>

                      {searchResults.asignaciones.map((asignacion: any) => (
                        <button
                          key={asignacion.id}
                          type="button"
                          onClick={() =>
                            navegarResultado(`/asignaciones/${asignacion.id}`)
                          }
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-cyan-50"
                        >
                          <ClipboardCheck size={18} className="text-cyan-600" />

                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {asignacion.titulo}
                            </p>
                            <p className="line-clamp-1 text-xs text-slate-500">
                              {asignacion.descripcion || 'Sin descripción'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {!searchLoading && searchResults?.pagos?.length > 0 && (
                    <div className="border-t border-slate-100 pt-2">
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Pagos
                      </p>

                      {searchResults.pagos.map((pago: any) => (
                        <button
                          key={pago.id}
                          type="button"
                          onClick={() => navegarResultado(`/pagos/${pago.id}`)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-emerald-50"
                        >
                          <CreditCard size={18} className="text-emerald-600" />

                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              Pago: {pago.referencia || `#${pago.id}`}
                            </p>
                            <p className="text-xs text-slate-500">
                              Monto: {pago.monto} · Estado: {pago.estado}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
