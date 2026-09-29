'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Link2, 
  Plus, 
  Search, 
  MoreVertical, 
  GraduationCap,
  BookOpen,
  Users,
  Filter,
  X,
  CheckCircle2,
  UserCircle
} from 'lucide-react';

interface Asignacion {
  id: string;
  periodo_id: number;
  periodo_nombre: string;
  docente: string;
  materia: string;
  codigo: string;
}

interface Docente {
  id: string;
  apellidos: string;
  nombres: string;
  especialidad: string;
}

interface Materia {
  id: string;
  nombre: string;
  codigo: string;
}

export default function AsignacionesPage() {
  const router = useRouter();
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  
  const [formData, setFormData] = useState({
    docente_id: '',
    materia_id: '',
    periodo_id: 1
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [resAsig, resDoc, resMat] = await Promise.all([
        fetch('/api/asignaciones').then(r => r.json()),
        fetch('/api/docentes').then(r => r.json()),
        fetch('/api/materias').then(r => r.json())
      ]);
      
      setAsignaciones(resAsig.asignaciones || []);
      setDocentes(resDoc.docentes || []);
      setMaterias(resMat.materias || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const response = await fetch('/api/asignaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await cargarDatos();
        setShowModal(false);
        setFormData({ docente_id: '', materia_id: '', periodo_id: 1 });
      } else {
        const data = await response.json();
        alert(data.error || 'Error al asignar');
      }
    } catch (error) {
      alert('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const asignacionesFiltradas = asignaciones.filter(a =>
    a.materia?.toLowerCase().includes(busqueda.toLowerCase()) ||
    a.docente?.toLowerCase().includes(busqueda.toLowerCase()) ||
    a.codigo?.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Agrupar por período para mejor visualización
  const asignacionesPorPeriodo = asignacionesFiltradas.reduce((acc, asig) => {
    const key = `Periodo ${asig.periodo_id}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(asig);
    return acc;
  }, {} as Record<string, Asignacion[]>);

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
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Asignaciones Docentes</h1>
          <p className="text-slate-500 text-sm mt-1">Asignar materias a docentes por período</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Nueva Asignación</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Link2 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Asignaciones</p>
            <p className="text-2xl font-extrabold text-slate-900">{asignaciones.length}</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <UserCircle size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Docentes Asignados</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {new Set(asignaciones.map(a => a.docente)).size}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Materias Asignadas</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {new Set(asignaciones.map(a => a.materia)).size}
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
            placeholder="Buscar por materia, docente o período..." 
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Lista de Asignaciones Agrupadas por Período */}
      <div className="space-y-6">
        {Object.entries(asignacionesPorPeriodo).length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
            <Link2 size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay asignaciones registradas</p>
            <p className="text-sm text-slate-400 mt-1">Crea una nueva asignación para comenzar</p>
          </div>
        ) : (
          Object.entries(asignacionesPorPeriodo).map(([periodo, asigs]) => (
            <div key={periodo} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Header del Período */}
              <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <GraduationCap size={20} className="text-blue-700" />
                  </div>
                  <h3 className="font-bold text-slate-900">{periodo}</h3>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  {asigs.length} materia(s)
                </span>
              </div>

              {/* Lista de asignaciones */}
              <div className="divide-y divide-slate-100">
                {asigs.map((asig) => (
                  <div 
                    key={asig.id} 
                    className="group p-4 hover:bg-blue-50/30 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 flex items-center justify-center font-bold text-sm shrink-0">
                        {asig.codigo}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{asig.materia}</p>
                        <p className="text-sm text-slate-500 flex items-center gap-1">
                          <UserCircle size={14} />
                          {asig.docente}
                        </p>
                      </div>
                    </div>
                    
                    <button 
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        // TODO: Eliminar asignación
                        if (confirm('¿Eliminar esta asignación?')) {
                          // fetch delete
                        }
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Nueva Asignación */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Link2 size={24} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Nueva Asignación</h2>
                  <p className="text-sm text-slate-500">Asignar materia a docente</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Docente */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Docente *
                </label>
                <select 
                  value={formData.docente_id}
                  onChange={(e) => setFormData({...formData, docente_id: e.target.value})}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="">Seleccione docente...</option>
                  {docentes.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.apellidos} {d.nombres} — {d.especialidad}
                    </option>
                  ))}
                </select>
              </div>

              {/* Materia */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Materia *
                </label>
                <select 
                  value={formData.materia_id}
                  onChange={(e) => setFormData({...formData, materia_id: e.target.value})}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="">Seleccione materia...</option>
                  {materias.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} ({m.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Período *
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {[1,2,3,4,5,6].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormData({...formData, periodo_id: p})}
                      className={`py-2 px-1 rounded-xl text-sm font-bold border-2 transition-all ${
                        formData.periodo_id === p
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={submitting || !formData.docente_id || !formData.materia_id || !formData.periodo_id}
                  className="flex-1 px-4 py-3 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-950 transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  {submitting ? 'Asignando...' : 'Asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}