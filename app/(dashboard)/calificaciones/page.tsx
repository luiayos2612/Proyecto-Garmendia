'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Filter, Search, ChevronRight } from 'lucide-react';

const PERIODOS            = [1, 2, 3, 4, 5, 6];

interface Calificacion {
  id: string;
  estudiante: string;
  estudiante_id: string;
  materia: string;
  materia_codigo: string;
  docente: string;
  nota: number | null;
  periodo_id: number;
  periodo_nombre: string;
  observaciones: string;
}

interface Stat { periodo_id: number; periodo_nombre: string; total: string; }
interface Docente { id: string; apellidos: string; nombres: string; }
interface Materia { id: string; nombre: string; }

export default function CalificacionesPage() {
  const router = useRouter();
  const [calificaciones, setCalificaciones] = useState<Calificacion[]>([]);
  const [stats,    setStats]    = useState<Stat[]>([]);
  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [filtros, setFiltros] = useState({
    periodo_id: '', docente_id: '', materia_id: ''
  });

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.periodo_id) params.set('periodo_id', filtros.periodo_id);
      if (filtros.docente_id) params.set('docente_id',  filtros.docente_id);
      if (filtros.materia_id) params.set('materia_id',  filtros.materia_id);

      const [calRes, docRes, matRes] = await Promise.all([
        fetch(`/api/calificaciones?${params}`).then(r => r.json()),
        fetch('/api/docentes').then(r => r.json()),
        fetch('/api/materias').then(r => r.json()),
      ]);

      setCalificaciones(calRes.calificaciones || []);
      setStats(calRes.stats || []);
      setDocentes(docRes.docentes || []);
      setMaterias(matRes.materias || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarDatos(); }, [filtros]);

  const filtradas = calificaciones.filter(c =>
    c.estudiante?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.materia?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const notaColor = (nota: number | null) => {
    if (nota === null) return 'bg-slate-100 text-slate-500';
    if (nota >= 18)    return 'bg-emerald-100 text-emerald-700';
    if (nota >= 10)    return 'bg-blue-100 text-blue-700';
    return 'bg-red-100 text-red-700';
  };

  const selectClass = "px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-blue-500";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen size={28} className="text-blue-600" />
            Gestión de Calificaciones
          </h1>
          <p className="text-slate-500 text-sm mt-1">Administra las notas por periodos de los estudiantes</p>
        </div>
        <button
          onClick={() => router.push('/calificaciones/nuevo')}
          className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2">
          <Plus size={18} />
          Cargar Calificaciones
        </button>
      </div>

      {/* Stats por período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {PERIODOS.map((p, i) => {
          const stat = stats.find(s => s.periodo_id === p);
          const colors = [
            'from-blue-400 to-blue-600',
            'from-violet-400 to-violet-600',
            'from-emerald-400 to-emerald-600',
            'from-orange-400 to-orange-600',
            'from-pink-400 to-pink-600',
            'from-teal-400 to-teal-600',
          ];
          return (
            <button key={p}
              onClick={() => setFiltros(f => ({ ...f, periodo_id: f.periodo_id === String(p) ? '' : String(p) }))}
              className={`rounded-2xl p-4 text-left transition-all border-2 ${
                filtros.periodo_id === String(p)
                  ? 'border-blue-600 shadow-lg shadow-blue-600/20'
                  : 'border-transparent hover:border-slate-200'
              } bg-white`}>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[i % colors.length]} text-white flex items-center justify-center font-bold text-sm mb-2`}>
                {p}
              </div>
              <p className="text-2xl font-extrabold text-slate-900">{stat?.total || 0}</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">notas en Período {p}</p>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <Filter size={16} />
          Filtros de Búsqueda
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <select value={filtros.docente_id}
            onChange={e => setFiltros(f => ({ ...f, docente_id: e.target.value }))}
            className={selectClass}>
            <option value="">Todos los docentes</option>
            {docentes.map(d => (
              <option key={d.id} value={d.id}>{d.apellidos} {d.nombres}</option>
            ))}
          </select>

          <select value={filtros.materia_id}
            onChange={e => setFiltros(f => ({ ...f, materia_id: e.target.value }))}
            className={selectClass}>
            <option value="">Todas las materias</option>
            {materias.map(m => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>

          <select value={filtros.periodo_id}
            onChange={e => setFiltros(f => ({ ...f, periodo_id: e.target.value }))}
            className={selectClass}>
            <option value="">Todos los periodos</option>
            {PERIODOS.map(p => <option key={p} value={p}>Periodo {p}</option>)}
          </select>

          <div className="hidden sm:block" />
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Buscar por estudiante o materia..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-200">
                <tr>
                  {['Estudiante','Materia','Docente','Nota','Período',''].map(h => (
                    <th key={h} className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <BookOpen size={40} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No hay calificaciones registradas</p>
                      <p className="text-slate-400 text-sm mt-1">Usa el botón "Cargar Calificaciones" para comenzar</p>
                    </td>
                  </tr>
                ) : (
                  filtradas.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <p className="font-bold text-slate-900 text-sm">{c.estudiante}</p>
                      </td>
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{c.materia}</p>
                          <p className="text-xs text-slate-400 font-mono">{c.materia_codigo}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm text-slate-600">{c.docente}</p>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1.5 rounded-lg text-sm font-extrabold ${notaColor(c.nota)}`}>
                          {c.nota !== null ? parseFloat(String(c.nota)).toFixed(2) : '—'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs font-bold">
                          Período {c.periodo_id}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30">
          <p className="text-xs text-slate-500 font-medium">
            Mostrando {filtradas.length} de {calificaciones.length} calificaciones
          </p>
        </div>
      </div>
    </div>
  );
}