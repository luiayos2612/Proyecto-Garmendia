'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  GraduationCap, 
  Plus, 
  Search, 
  MoreVertical, 
  Mail, 
  Phone,
  Filter
} from 'lucide-react';

interface Docente {
  id: string;
  cedula: string;
  apellidos: string;
  nombres: string;
  especialidad: string;
  telefono: string;
  email: string;
  activo: boolean;
}

export default function DocentesPage() {
  const router = useRouter();
  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    fetch('/api/docentes')
      .then(r => r.json())
      .then(data => {
        setDocentes(data.docentes || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error:', err);
        setLoading(false);
      });
  }, []);

  const docentesFiltrados = docentes.filter(d => 
    d.nombres?.toLowerCase().includes(busqueda.toLowerCase()) ||
    d.apellidos?.toLowerCase().includes(busqueda.toLowerCase()) ||
    d.cedula?.includes(busqueda) ||
    d.especialidad?.toLowerCase().includes(busqueda.toLowerCase())
  );

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
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Gestión de Docentes</h1>
          <p className="text-slate-500 text-sm mt-1">Personal docente y administrativo</p>
        </div>
        <button 
          onClick={() => router.push('/docentes/nuevo')}
          className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Nuevo Docente</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <GraduationCap size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Docentes</p>
            <p className="text-2xl font-extrabold text-slate-900">{docentes.length}</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Mail size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Con Email</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {docentes.filter(d => d.email).length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
            <Filter size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Especialidades</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {new Set(docentes.map(d => d.especialidad)).size}
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
            placeholder="Buscar por nombre, cédula o especialidad..." 
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Grid de Docentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {docentesFiltrados.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
            <GraduationCap size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No se encontraron docentes</p>
          </div>
        ) : (
          docentesFiltrados.map((docente) => (
            <div 
              key={docente.id} 
              className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer"
              onClick={() => router.push(`/docentes/${docente.id}`)}
            >
              {/* Header Card */}
              <div className="flex justify-between items-start mb-4">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0">
                  {docente.nombres?.[0]}{docente.apellidos?.[0]}
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
                <h3 className="font-bold text-slate-900 text-lg mb-1">
                  {docente.apellidos} {docente.nombres}
                </h3>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100">
                  {docente.especialidad}
                </span>
              </div>

              {/* Contacto */}
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone size={14} className="text-slate-400" />
                  <span>{docente.telefono || 'No disponible'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Mail size={14} className="text-slate-400" />
                  <span className="truncate">{docente.email || 'No disponible'}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  {docente.cedula}
                </span>
                <span className={`w-2 h-2 rounded-full ${docente.activo !== false ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}