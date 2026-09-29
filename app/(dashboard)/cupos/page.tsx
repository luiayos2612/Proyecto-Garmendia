'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  GraduationCap, CheckCircle2, XCircle, AlertCircle, Bell
} from 'lucide-react';

interface Cupo {
  id: string;
  estudiante_id: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  periodo_origen: number;
  periodo_destino: number;
  periodo_destino_nombre: string;
  periodo_origen_nombre: string;
  promedio_general: string;
  estado: string;
  created_at: string;
}

interface GrupoCupos {
  periodo_id: number;
  periodo_nombre: string;
  estudiantes: Cupo[];
}

export default function CuposPage() {
  const router = useRouter();
  const [grupos, setGrupos] = useState<GrupoCupos[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);

  useEffect(() => { cargarCupos(); }, []);

  const cargarCupos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cupos');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGrupos(data.cupos || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccion = async (cupoId: string, accion: 'aprobar' | 'rechazar') => {
    if (!confirm(`¿Está seguro de ${accion === 'aprobar' ? 'aprobar' : 'rechazar'} este cupo?`)) return;
    setProcesando(cupoId);
    try {
      const res = await fetch('/api/cupos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cupo_id: cupoId, accion })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      cargarCupos();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Gestión de Cupos</h1>
          <p className="text-slate-500 text-sm mt-1">Aprobación de inscripciones para nuevos periodos</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl font-medium flex items-center gap-2">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {grupos.map((g) => (
          <div key={g.periodo_id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">{g.periodo_nombre}</p>
              <p className="text-2xl font-extrabold text-slate-900">{g.estudiantes.length}</p>
              <p className="text-[10px] text-slate-400">cupos pendientes</p>
            </div>
          </div>
        ))}
        {grupos.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500">
            <Bell size={48} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No hay cupos pendientes</p>
            <p className="text-sm text-slate-400">Los estudiantes aprobados aparecerán aquí</p>
          </div>
        )}
      </div>

      <div className="space-y-8">
        {grupos.map((grupo) => (
          <div key={grupo.periodo_id} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">{grupo.periodo_nombre}</h2>
              <span className="px-2.5 py-0.5 bg-violet-100 text-violet-700 rounded-full text-xs font-bold border border-violet-200">
                {grupo.estudiantes.length} estudiantes
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {grupo.estudiantes.map((cupo) => (
                <div key={cupo.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold text-sm">
                        {cupo.apellidos?.[0]}{cupo.nombres?.[0]}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{cupo.apellidos} {cupo.nombres}</h3>
                        <p className="text-xs text-slate-500">Cédula: {cupo.cedula} • Periodo anterior: {cupo.periodo_origen_nombre || cupo.periodo_origen}</p>
                        {cupo.promedio_general && (
                          <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                            Promedio general: {parseFloat(cupo.promedio_general).toFixed(1)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccion(cupo.id, 'rechazar')}
                        disabled={procesando === cupo.id}
                        className="px-4 py-2 bg-white text-rose-600 border border-rose-200 rounded-xl font-semibold text-sm hover:bg-rose-50 transition-all flex items-center gap-2 disabled:opacity-50">
                        {procesando === cupo.id ? <div className="animate-spin h-4 w-4 border-2 border-rose-600 border-t-transparent rounded-full" /> : <XCircle size={16} />}
                        Rechazar
                      </button>
                      <button
                        onClick={() => handleAccion(cupo.id, 'aprobar')}
                        disabled={procesando === cupo.id}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50">
                        {procesando === cupo.id ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <CheckCircle2 size={16} />}
                        Aprobar Inscripción
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}