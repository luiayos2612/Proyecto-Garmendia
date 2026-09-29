'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FileDown,
  Filter,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BarChart3
} from 'lucide-react';
import { useLoading } from '@/app/components/LoadingContext';

interface Periodo {
  id: number;
  nombre: string;
  descripcion: string;
  activo: boolean;
}

export default function EstadisticasPage() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const { startLoading, stopLoading } = useLoading();

  // Cargar periodos al montar
  useEffect(() => {
    fetch('/api/periodos')
      .then(r => r.json())
      .then(data => {
        if (data.periodos && data.periodos.length > 0) {
          setPeriodos(data.periodos);
          setPeriodoSeleccionado(String(data.periodos[0].id));
        }
      })
      .catch(err => {
        console.error('Error cargando períodos:', err);
        setError('Error al cargar los períodos');
      });
  }, []);

  const generarExcel = useCallback(async () => {
    if (!periodoSeleccionado) {
      setError('Por favor, selecciona un período');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);
    startLoading();

    try {
      const res = await fetch('/api/estadisticas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo_id: parseInt(periodoSeleccionado),
          ano_escolar: '2025-2026'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error generando reporte');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Obtener nombre del período para el archivo
      const periodo = periodos.find(p => p.id === parseInt(periodoSeleccionado));
      const periodoNombre = periodo?.nombre || `Periodo_${periodoSeleccionado}`;
      const hoy = new Date();
      const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

      a.download = `ResumenAcademico_${periodoNombre}_2025-2026_${fecha}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setSuccess('¡Reporte generado y descargado exitosamente!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error generando reporte:', error);
      setError(error.message || 'Error al generar el reporte');
    } finally {
      setLoading(false);
      stopLoading();
    }
  }, [periodoSeleccionado, periodos, startLoading, stopLoading]);

  const handleCancelar = () => {
    setPeriodoSeleccionado('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-emerald-600" />
          Estadísticas Académicas
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Genera reportes oficiales del rendimiento estudiantil por período
        </p>
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
        <div className="max-w-2xl">
          {/* Título del formulario */}
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Generar Resumen Académico</h2>

          {/* Selector de período */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Período Académico <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={periodoSeleccionado}
                onChange={(e) => {
                  setPeriodoSeleccionado(e.target.value);
                  setError('');
                }}
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {periodos.length === 0 ? (
                  <option value="">Cargando períodos...</option>
                ) : (
                  periodos.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.descripcion ? `- ${p.descripcion}` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Selecciona el período para el cual deseas generar el reporte académico
            </p>
          </div>

          {/* Errores */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-200">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">{error}</p>
              </div>
            </div>
          )}

          {/* Éxito */}
          {success && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-200">
              <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-emerald-900">{success}</p>
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={generarExcel}
              disabled={loading || !periodoSeleccionado}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Generando reporte...
                </>
              ) : (
                <>
                  <FileDown size={18} />
                  Generar Excel
                </>
              )}
            </button>

            <button
              onClick={handleCancelar}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-200 text-slate-800 rounded-xl font-medium transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {/* Información */}
      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-600" />
          Contenido del reporte
        </h3>
        <ul className="text-sm text-slate-600 space-y-2 ml-6">
          <li className="list-disc">Datos del plantel (código, nombre, dirección, teléfono, director)</li>
          <li className="list-disc">Lista de estudiantes inscritos en el período con sus calificaciones</li>
          <li className="list-disc">Componentes básicos: Lengua, Matemática, Memoria-Territorio, Ciencias Naturales</li>
          <li className="list-disc">Totales por componente (inscritos, asistentes, aprobados, no aprobados)</li>
          <li className="list-disc">Profesores asignados por componente</li>
          <li className="list-disc">Firmas de director y receptor</li>
        </ul>
      </div>
    </div>
  );
}
