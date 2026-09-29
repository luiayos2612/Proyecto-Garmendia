'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BookOpen, 
  Plus, 
  Search, 
  MoreVertical, 
  GraduationCap,
  Layers,
  Filter
} from 'lucide-react';

interface Materia {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  grados_aplicables: string;
  activa: boolean;
}

export default function MateriasPage() {
  const router = useRouter();
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    fetch('/api/materias')
      .then(r => r.json())
      .then(data => {
        setMaterias(data.materias || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error:', err);
        setLoading(false);
      });
  }, []);

  const materiasFiltradas = materias.filter(m => 
    m.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    m.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    m.descripcion?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const getGradosLabel = (grados: string) => {
    const labels: Record<string, string> = {
      'todos': 'Todos los grados',
      '1ro-3ro': '1ro a 3ro',
      '4to-6to': '4to a 6to',
      '1ro-2do': '1ro y 2do',
      '5to-6to': '5to y 6to'
    };
    return labels[grados] || grados;
  };

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
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Gestión de Materias</h1>
          <p className="text-slate-500 text-sm mt-1">Asignaturas del currículo escolar</p>
        </div>
        <button 
          onClick={() => router.push('/materias/nuevo')}
          className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Nueva Materia</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Materias</p>
            <p className="text-2xl font-extrabold text-slate-900">{materias.length}</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Layers size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Activas</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {materias.filter(m => m.activa !== false).length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
            <GraduationCap size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Áreas</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {new Set(materias.map(m => m.grados_aplicables)).size}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, código o descripción..." 
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Grid de Materias */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {materiasFiltradas.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
            <BookOpen size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No se encontraron materias</p>
          </div>
        ) : (
          materiasFiltradas.map((materia) => (
            <div 
              key={materia.id} 
              className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer"
              onClick={() => router.push(`/materias/${materia.id}`)}
            >
              {/* Header Card */}
              <div className="flex justify-between items-start mb-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0">
                  {materia.codigo}
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    // Acción editar
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <MoreVertical size={18} />
                </button>
              </div>

              {/* Info */}
              <div className="mb-4">
                <h3 className="font-bold text-slate-900 text-lg mb-2">{materia.nombre}</h3>
                <p className="text-sm text-slate-500 line-clamp-2">{materia.descripcion || 'Sin descripción'}</p>
              </div>

              {/* Grados */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Aplica para:</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100">
                    <GraduationCap size={12} className="mr-1" />
                    {getGradosLabel(materia.grados_aplicables)}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  ID: {materia.id.slice(0, 8)}
                </span>
                <span className={`w-2 h-2 rounded-full ${materia.activa !== false ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}