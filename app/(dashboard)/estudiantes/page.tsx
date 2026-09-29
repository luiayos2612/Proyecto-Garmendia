'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  Plus, 
  Filter, 
  MoreVertical, 
  Users, 
  GraduationCap,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface Estudiante {
  id: string;
  nombres: string;
  apellidos: string;
  cedula_escolar: string;
  periodo_id: number;
  periodo_nombre: string;
  genero: string;
  total_materias?: number;
  activo: boolean;
}

export default function EstudiantesPage() {
  const router = useRouter();
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [periodoFilter, setPeriodoFilter] = useState('');

  useEffect(() => {
    fetch('/api/estudiantes')
      .then(res => res.json())
      .then(data => {
        setEstudiantes(data.estudiantes || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error:', err);
        setLoading(false);
      });
  }, []);

  const grados = ['Todos los periodos', 'Periodo 1', 'Periodo 2', 'Periodo 3', 'Periodo 4', 'Periodo 5', 'Periodo 6'];

  const estudiantesFiltrados = estudiantes.filter((est: Estudiante) => {
    const matchBusqueda =
      est.nombres?.toLowerCase().includes(busqueda.toLowerCase()) ||
      est.apellidos?.toLowerCase().includes(busqueda.toLowerCase()) ||
      est.cedula_escolar?.toLowerCase().includes(busqueda.toLowerCase());
    const matchPeriodo = periodoFilter ? est.periodo_id === parseInt(periodoFilter) : true;
    return matchBusqueda && matchPeriodo;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Gestión de Estudiantes</h1>
          <p className="text-slate-500 text-sm mt-1">Administración de matrícula y materias</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => router.push('/estudiantes/nuevo')}
            className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
          >
            <Plus size={18} />
            <span>Nuevo Estudiante</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Estudiantes</p>
            <p className="text-2xl font-extrabold text-slate-900">{estudiantes.length}</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <GraduationCap size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Activos</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {estudiantes.filter((e: Estudiante) => e.activo).length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
            <Filter size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Grados</p>
            <p className="text-2xl font-extrabold text-slate-900">{grados.length}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, apellido o cédula..." 
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <select
            value={periodoFilter}
            onChange={(e) => setPeriodoFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">Todos los periodos</option>
            {[1,2,3,4,5,6].map(p => (
              <option key={p} value={p}>{`Periodo ${p}`}</option>
            ))}
          </select>
          
          <button className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
            <Filter size={16} />
            Más filtros
          </button>
        </div>
      </div>

      {/* TABLA DE ESTUDIANTES */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Estudiante</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Documento</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Período</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Materias</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-right py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {estudiantesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={48} className="text-slate-300" />
                      <p className="font-medium">No se encontraron estudiantes</p>
                      <p className="text-sm text-slate-400">Intenta con otros filtros de búsqueda</p>
                    </div>
                  </td>
                </tr>
              ) : (
                estudiantesFiltrados.map((est: Estudiante) => (
                  <tr 
                    key={est.id} 
                    className="group hover:bg-blue-50/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/estudiantes/${est.id}`)}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {est.nombres?.[0]}{est.apellidos?.[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{est.apellidos} {est.nombres}</p>
                          <p className="text-xs text-slate-500 capitalize">{est.genero}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                        {est.cedula_escolar || 'N/A'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        Periodo {est.periodo_id}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100">
                        {est.total_materias || 0} materias
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        est.activo 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${est.activo ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {est.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/30">
          <p className="text-xs text-slate-500 font-medium">
            Mostrando {estudiantesFiltrados.length} de {estudiantes.length} estudiantes
          </p>
          <div className="flex gap-2">
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg border border-slate-200 transition-all disabled:opacity-50">
              <ChevronLeft size={16} />
            </button>
            <button className="px-3 py-1.5 text-xs font-bold text-white bg-blue-900 rounded-lg">1</button>
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg border border-slate-200 transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}