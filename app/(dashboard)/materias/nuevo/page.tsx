'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save, BookOpen, CheckCircle2 } from 'lucide-react';

const GRADOS_PRIMARIA = ['1er Grado','2do Grado','3er Grado','4to Grado','5to Grado','6to Grado'];
const GRADOS_BACHILLERATO = ['1er Año','2do Año','3er Año','4to Año','5to Año'];

export default function NuevaMateriaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    grados: [] as string[] // ✅ Array de grados específicos
  });

  const toggleGrado = (grado: string) => {
    setFormData(prev => ({
      ...prev,
      grados: prev.grados.includes(grado)
        ? prev.grados.filter(g => g !== grado)
        : [...prev.grados, grado]
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      if (!formData.codigo || !formData.nombre) {
        throw new Error('El código y nombre son obligatorios');
      }
      if (formData.grados.length === 0) {
        throw new Error('Selecciona al menos un grado');
      }

      const response = await fetch('/api/materias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear la materia');
      }

      router.push('/materias');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
  const labelClass = "text-xs font-bold text-slate-500 uppercase tracking-wider";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()}
          className="p-2 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-slate-200 shadow-sm">
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Nueva Materia</h1>
          <p className="text-slate-500 text-sm">Registrar asignatura en el sistema</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl font-medium">
          ⚠️ {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 lg:p-8 space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg"><BookOpen size={24} className="text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Información de la Materia</h2>
              <p className="text-sm text-slate-500">Datos básicos de la asignatura</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className={labelClass}>Código *</label>
              <input type="text" value={formData.codigo}
                onChange={e => setFormData({...formData, codigo: e.target.value.toUpperCase()})}
                maxLength={10} className={`${inputClass} uppercase font-mono`} placeholder="MAT" />
              <p className="text-xs text-slate-400">Ej: MAT, LEN, CIE, HIS</p>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>Nombre de la Materia *</label>
              <input type="text" value={formData.nombre}
                onChange={e => setFormData({...formData, nombre: e.target.value})}
                className={inputClass} placeholder="Matemáticas" />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className={labelClass}>Descripción</label>
              <textarea value={formData.descripcion} rows={3}
                onChange={e => setFormData({...formData, descripcion: e.target.value})}
                className={`${inputClass} resize-none`} placeholder="Contenido y objetivos..." />
            </div>

            {/* ✅ NUEVO: Selector de grados específicos */}
            <div className="md:col-span-2 space-y-3">
              <label className={labelClass}>Aplica para los siguientes grados *</label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Primaria</p>
                  <div className="grid grid-cols-3 gap-2">
                    {GRADOS_PRIMARIA.map(g => (
                      <button key={g} type="button" onClick={() => toggleGrado(g)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all ${
                          formData.grados.includes(g)
                            ? 'border-blue-600 bg-blue-600 text-white shadow-md'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                        }`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Bachillerato</p>
                  <div className="grid grid-cols-3 gap-2">
                    {GRADOS_BACHILLERATO.map(g => (
                      <button key={g} type="button" onClick={() => toggleGrado(g)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all ${
                          formData.grados.includes(g)
                            ? 'border-violet-600 bg-violet-600 text-white shadow-md'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
                        }`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {formData.grados.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mt-2">
                  <p className="text-xs font-bold text-emerald-700 mb-1">
                    ✅ {formData.grados.length} grado(s) seleccionado(s):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {formData.grados.map(g => (
                      <span key={g} className="px-2 py-0.5 bg-white border border-emerald-200 text-emerald-700 rounded text-xs font-semibold">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-6 border-t border-slate-100">
            <button onClick={() => router.push('/materias')}
              className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="px-6 py-3 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-950 shadow-lg flex items-center gap-2 disabled:opacity-50">
              {loading ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <Save size={18} />}
              {loading ? 'Guardando...' : 'Crear Materia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}