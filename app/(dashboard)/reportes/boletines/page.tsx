'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  Search, 
  FileDown, 
  GraduationCap, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  History
} from 'lucide-react';
import Link from 'next/link';

interface NotaResumen {
  materia_id: string;
  materia: string;
  codigo: string;
  nota: number;
  tiene_nota: boolean;
  es_complementaria: boolean;
  origen: 'actual' | 'historico' | 'pendiente';
  periodo_id?: number;
}

interface EstudianteBoletin {
  id: string;
  cedula: string;
  apellidos: string;
  nombres: string;
  periodo_id: number;
  periodo_nombre: string;
  notas: NotaResumen[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function BoletinesPage() {
  const [estudiantes, setEstudiantes] = useState<EstudianteBoletin[]>([]);
  const [periodos, setPeriodos] = useState<{id: number; nombre: string}[]>([]);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<string>('1');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false, hasPrev: false
  });

  // Debounce del buscador (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination(prev => ({ ...prev, page: 1 })); // reset a página 1 al buscar
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Cargar periodos
  useEffect(() => {
    fetch('/api/periodos')
      .then(r => r.json())
      .then(data => {
        if (data.periodos) setPeriodos(data.periodos);
      })
      .catch(console.error);
  }, []);

  // Cargar estudiantes
  const cargarEstudiantes = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        periodo_id: periodoSeleccionado,
        search: debouncedSearch,
        page: String(page),
        limit: '20',
        ano_escolar: '2025-2026' // Ajustar dinámicamente si agregas selector de año
      });
      
      const res = await fetch(`/api/boletines?${params}`);
      const data = await res.json();
      
      if (data.estudiantes) {
        setEstudiantes(data.estudiantes);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error cargando boletines:', error);
    } finally {
      setLoading(false);
    }
  }, [periodoSeleccionado, debouncedSearch]);

  useEffect(() => {
    cargarEstudiantes(pagination.page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarEstudiantes]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    cargarEstudiantes(newPage);
  };

  // Exportar boletín a Excel
  const exportarBoletin = async (estudiante: EstudianteBoletin) => {
    setExportando(estudiante.id);
    try {
      const res = await fetch('/api/boletines/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudiante_id: estudiante.id,
          periodo_id: parseInt(periodoSeleccionado),
          ano_escolar: '2025-2026'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error generando boletín');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Boletin_${estudiante.apellidos}_${estudiante.nombres}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert('Error al generar el boletín: ' + error.message);
      console.error(error);
    } finally {
      setExportando(null);
    }
  };

  const getNotaColor = (nota: number, tiene: boolean) => {
    if (!tiene) return 'text-slate-300 bg-slate-50';
    if (nota >= 16) return 'text-emerald-600 bg-emerald-50';
    if (nota >= 12) return 'text-blue-600 bg-blue-50';
    if (nota >= 10) return 'text-amber-600 bg-amber-50';
    return 'text-rose-600 bg-rose-50';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-blue-600" />
            Boletines de Calificaciones
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Consulta histórica y generación de certificaciones oficiales
          </p>
        </div>
        
        <div className="flex gap-2">
          <Link 
            href="/reportes/boletines/historico"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <History size={16} />
            Cargar Notas Antiguas
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre, apellido o cédula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <XCircle size={16} />
            </button>
          )}
        </div>

        <div className="relative sm:w-64">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <select
            value={periodoSeleccionado}
            onChange={(e) => setPeriodoSeleccionado(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none appearance-none cursor-pointer"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <CheckCircle2 size={16} className="text-blue-500" />
        Mostrando {estudiantes.length} de {pagination.total} estudiantes
        {debouncedSearch && ` (filtrado por "${debouncedSearch}")`}
      </div>

      {/* Lista */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : estudiantes.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No se encontraron estudiantes</p>
            <p className="text-slate-400 text-sm mt-1">
              {debouncedSearch ? 'Intenta con otra búsqueda' : 'No hay estudiantes activos en este periodo'}
            </p>
          </div>
        ) : (
          estudiantes.map((est) => (
            <div key={est.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all">
              
              {/* Cabecera del estudiante */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{est.apellidos} {est.nombres}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md font-mono">CI: {est.cedula}</span>
                      <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-medium">{est.periodo_nombre}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => exportarBoletin(est)}
                  disabled={exportando === est.id}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {exportando === est.id ? (
                    <><Loader2 size={16} className="animate-spin" /> Generando...</>
                  ) : (
                    <><FileDown size={16} /> Generar Boletín</>
                  )}
                </button>
              </div>

              {/* Resumen de 5 notas principales */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {est.notas.slice(0, 5).map((nota, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border ${nota.tiene_nota ? 'border-slate-200' : 'border-slate-100 bg-slate-50/50'}`}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 truncate" title={nota.materia}>
                      {nota.materia.length > 24 ? nota.materia.substring(0, 24) + '...' : nota.materia}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-xl font-bold px-2 py-0.5 rounded-lg ${getNotaColor(nota.nota, nota.tiene_nota)}`}>
                        {nota.tiene_nota ? nota.nota.toFixed(1) : '--'}
                      </span>
                      <span className="text-xs text-slate-400">/20</span>
                    </div>
                    {nota.origen === 'historico' && (
                      <span className="text-[10px] text-amber-600 font-medium mt-1 block flex items-center gap-0.5">
                        <History size={10} /> Histórico
                      </span>
                    )}
                  </div>
                ))}
                
                {est.notas.length < 5 && Array.from({ length: 5 - est.notas.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/30">
                    <p className="text-[10px] text-slate-400 uppercase">Sin materia</p>
                    <span className="text-xl font-bold text-slate-200">--</span>
                  </div>
                ))}
              </div>

              {/* Materias complementarias y resumen histórico */}
              {est.notas.some(n => n.es_complementaria && n.tiene_nota) && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-violet-600 mb-2 flex items-center gap-1">
                    <BookOpen size={12} /> Materias Complementarias
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {est.notas.filter(n => n.es_complementaria && n.tiene_nota).map((nota, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-violet-50 text-violet-700 rounded-lg text-xs font-medium">
                        {nota.materia}: <strong>{nota.nota.toFixed(1)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas históricas de períodos anteriores */}
              {est.notas.some(n => n.origen === 'historico' && n.tiene_nota) && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-amber-600 mb-2 flex items-center gap-1">
                    <History size={12} /> Calificaciones de Períodos Anteriores
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {est.notas.filter(n => n.origen === 'historico' && n.tiene_nota).map((nota, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium">
                        {nota.materia}: <strong>{nota.nota.toFixed(1)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Paginación */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-2xl p-3 border border-gray-100">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={!pagination.hasPrev}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <span className="text-sm text-slate-500 font-medium">
            Página {pagination.page} de {pagination.totalPages}
          </span>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={!pagination.hasNext}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}