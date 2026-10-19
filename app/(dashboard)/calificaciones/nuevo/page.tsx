'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Save, ArrowLeft, BookOpen, Users, GraduationCap, 
  CheckCircle2, AlertCircle, Loader2
} from 'lucide-react';
import CalificacionesPorEstudiante from '@/app/components/CalificacionesPorEstudiante';
import type { TipoEvaluacion } from '@/lib/evaluacionMaterias';

import {
  valorCalificacionExistente,
  valorCalificacionValido,
  camposCalificacion,
} from '@/lib/formularioCalificaciones';

interface Periodo {
  id: number;
  nombre: string;
}

interface Asignacion {
  id: string;
  docente_id: string;
  materia_id: string;
  docente_nombre: string;
  materia_nombre: string;
  materia_codigo: string;
  tipo_evaluacion: TipoEvaluacion;
}

interface EstudianteRow {
  id: string;
  apellidos: string;
  nombres: string;
  cedula: string;
  nota_existente?: number | null;
  observaciones_existentes?: string | null;
  calificacion_id?: string | null;
  // Campos editables en el formulario
  nota: string;
  observaciones: string;
  resultado_cualitativo_existente?: 'AP' | 'IN' | null;
  inscripcion_id: string;
  intento_id: string;
  numero_intento: number;
  tipo_inscripcion: 'regular' | 'tutoria';
  periodo_origen_tutoria: number | null;
  puede_calificar: boolean;
  motivo_bloqueo?: string | null;
}

export default function NuevaCalificacionPage() {
  const [modo, setModo] = useState<'materia' | 'estudiante'>('materia');

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);

    if (
      parametros.get('modo') === 'estudiante' ||
      parametros.has('estudiante_id')
    ) {
      setModo('estudiante');
    }
  }, []);

  const cambiarModo = (nuevoModo: 'materia' | 'estudiante') => {
    setModo(nuevoModo);
  };

  return (
    <div className="space-y-6">
      <div className="max-w-5xl mx-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cambiarModo('materia')}
          className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
            modo === 'materia'
              ? 'bg-blue-900 text-white border-blue-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Por materia
        </button>

        <button
          type="button"
          onClick={() => cambiarModo('estudiante')}
          className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
            modo === 'estudiante'
              ? 'bg-blue-900 text-white border-blue-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Por estudiante
        </button>
      </div>

      {modo === 'materia' ? (
        <CargaPorMateria />
      ) : (
        <CalificacionesPorEstudiante />
      )}
    </div>
  );
}


function CargaPorMateria() {
  const router = useRouter();

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteRow[]>([]);

  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [selectedAsignacion, setSelectedAsignacion] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [versionCarga, setVersionCarga] = useState(0);

  // ── 1. Cargar periodos al montar ──
  useEffect(() => {
    fetch('/api/periodos')
      .then(r => {
        if (r.status === 401) throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
        if (!r.ok) throw new Error('Error al cargar periodos');
        return r.json();
      })
      .then(data => {
        if (data.periodos) setPeriodos(data.periodos);
      })
      .catch(err => setError(err.message));
  }, []);

  // ── 2. Cargar asignaciones cuando cambia el periodo ──
  useEffect(() => {
    if (!selectedPeriodo) {
      setAsignaciones([]);
      setSelectedAsignacion('');
      setEstudiantes([]);
      return;
    }

    setLoadingData(true);
    fetch(`/api/asignaciones?periodo_id=${selectedPeriodo}`)
      .then(r => {
        if (r.status === 401) throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
        if (!r.ok) throw new Error('Error al cargar asignaciones');
        return r.json();
      })
      .then(data => {
        setAsignaciones(data.asignaciones || []);
        setSelectedAsignacion('');
        setEstudiantes([]);
        setError('');
      })
      .catch(err => {
        setError(err.message);
        setAsignaciones([]);
      })
      .finally(() => setLoadingData(false));
  }, [selectedPeriodo]);

  // ── 3. Cargar estudiantes cuando cambia la asignación ──
  useEffect(() => {
    const controller = new AbortController();

    setEstudiantes([]);

    if (!selectedAsignacion) {
      setLoadingData(false);
      return () => controller.abort();
    }

    setLoadingData(true);

    const cargarEstudiantes = async () => {
      try {
        const res = await fetch(
          `/api/asignaciones/${selectedAsignacion}/estudiantes`,
          {
            signal: controller.signal,
            cache: 'no-store',
          }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.error || 'No se pudieron cargar los estudiantes.'
          );
        }

        const tipo = data.asignacion?.tipo_evaluacion;

        if (tipo !== 'numerica' && tipo !== 'cualitativa') {
          throw new Error(
            'La API no informó el tipo de evaluación de la asignación.'
          );
        }

        const mapped: EstudianteRow[] = (
          data.estudiantes || []
        ).map((est: EstudianteRow) => ({
          ...est,
          nota: valorCalificacionExistente(
            tipo,
            est.nota_existente,
            est.resultado_cualitativo_existente
          ),
          observaciones: est.observaciones_existentes || '',
        }));

        if (controller.signal.aborted) return;

        setEstudiantes(mapped);
        setError('');
      } catch (err: unknown) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los estudiantes.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingData(false);
        }
      }
    };

    void cargarEstudiantes();

    return () => controller.abort();
  }, [selectedAsignacion, versionCarga]);

  const asignacionSeleccionada = asignaciones.find(a => a.id === selectedAsignacion);
  const tipoEvaluacion = asignacionSeleccionada?.tipo_evaluacion;

  const esCualitativa = tipoEvaluacion === 'cualitativa';

  const handleNotaChange = (
    inscripcionId: string,
    value: string
  ) => {
    setEstudiantes((actuales) =>
      actuales.map((est) =>
        est.inscripcion_id === inscripcionId &&
        est.puede_calificar
          ? { ...est, nota: value }
          : est
      )
    );
  };

  const handleObsChange = (
    inscripcionId: string,
    value: string
  ) => {
    setEstudiantes((actuales) =>
      actuales.map((est) =>
        est.inscripcion_id === inscripcionId &&
        est.puede_calificar
          ? { ...est, observaciones: value }
          : est
      )
    );
  };

  const notaEsInvalida = (valor: string) => {
    if (valor.trim() === '') return false;
    if (!tipoEvaluacion) return true;

    return !valorCalificacionValido(tipoEvaluacion, valor);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Filtrar solo las filas que tienen nota escrita
    if ( !selectedAsignacion || !tipoEvaluacion || loadingData ) {
      setError('Seleccione una asignación y espere a que termine de cargar.');
      setLoading(false);
      return;
    }

    const filasConResultado = estudiantes.filter(
        (est) =>
        est.puede_calificar &&
        est.nota.trim() !== ''
    );

    if (filasConResultado.length === 0) {
      setError('Debe ingresar al menos una calificación para guardar.');
      setLoading(false);
      return;
    }

    const invalidas = filasConResultado.filter(
      (est) =>
        !valorCalificacionValido(tipoEvaluacion, est.nota)
    );

    if (invalidas.length > 0) {
      setError(
        esCualitativa
          ? 'Seleccione AP o IN en las calificaciones ingresadas.'
          : 'Las notas deben estar entre 1.00 y 5.00, con máximo dos decimales.'
      );
      setLoading(false);
      return;
    }

    const calificaciones = filasConResultado.map(
      (est) => ({
        estudiante_id: est.id,
        inscripcion_id: est.inscripcion_id,
        ...camposCalificacion(
          tipoEvaluacion,
          est.nota
        ),
        observaciones: est.observaciones,
      })
    );

    try {
      const res = await fetch('/api/calificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asignacion_id: selectedAsignacion,
          calificaciones
        })
      });

      if (res.status === 401) {
        throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar calificaciones');
      }

      setSuccess(
        `Se guardaron ${data.guardadas} calificaciones correctamente.` +
        (data.errores && data.errores.length > 0
          ? ` Hubo ${data.errores.length} error(es).`
          : '')
      );

      // Refrescar estudiantes para mostrar las notas como "existentes"
      if (!data.errores || data.errores.length === 0) {
        setVersionCarga((actual) => actual + 1);
      } 

      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const notasIngresadas = estudiantes.filter(
  (est) =>
      est.puede_calificar &&
      est.nota.trim() !== ''
    ).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => router.push('/calificaciones')}
          className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 shadow-sm transition-all"
        >
          <ArrowLeft size={24} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Carga Masiva de Calificaciones
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Selecciona periodo y asignación para cargar notas de todos los estudiantes
          </p>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl font-medium flex items-center gap-2">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl font-medium flex items-center gap-2">
          <CheckCircle2 size={18} /> {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card de selección */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <BookOpen size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Datos de la Asignación</h2>
              <p className="text-sm text-slate-500">Selecciona periodo y docente/materia</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Periodo */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Período *
              </label>
              <select
                value={selectedPeriodo}
                onChange={(e) => setSelectedPeriodo(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                required
              >
                <option value="">Seleccionar periodo</option>
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            {/* Asignación */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Docente y Materia *
              </label>
              <select
                value={selectedAsignacion}
                onChange={(e) => setSelectedAsignacion(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                required
                disabled={!selectedPeriodo || asignaciones.length === 0}
              >
                <option value="">
                  {!selectedPeriodo 
                    ? 'Selecciona un periodo primero' 
                    : asignaciones.length === 0 
                      ? 'No hay asignaciones' 
                      : 'Seleccionar docente y materia'}
                </option>
                {asignaciones.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.docente_nombre} — {a.materia_nombre} ({a.materia_codigo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {asignacionSeleccionada && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
              <GraduationCap size={16} className="text-blue-600" />
              <span className="font-medium">{asignacionSeleccionada.materia_nombre}</span>
              <span className="text-slate-400">|</span>
              <span>Prof. {asignacionSeleccionada.docente_nombre}</span>
            </div>
          )}
        </div>

        {/* Tabla de estudiantes */}
        {selectedAsignacion && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-900">Listado de Estudiantes</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  {estudiantes.length}
                </span>
                {notasIngresadas > 0 && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    {notasIngresadas} nota(s) lista(s)
                  </span>
                )}
              </div>
              {loadingData && (
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Cargando...
                </div>
              )}
            </div>

            {estudiantes.length === 0 && !loadingData ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No hay estudiantes inscritos en esta materia para el periodo seleccionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 w-1/3">Estudiante</th>
                      <th className="px-4 py-3 w-32">
                        {esCualitativa ? 'Resultado' : 'Nota (1–5)'}
                      </th>
                      <th className="px-4 py-3">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {estudiantes.map((est) => (
                      <tr
                        key={est.inscripcion_id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-3 align-middle">
                          <div className="font-medium text-slate-900">
                            {est.apellidos} {est.nombres}
                          </div>

                          <div className="text-xs text-slate-500">
                            CI: {est.cedula}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                est.tipo_inscripcion === 'tutoria'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-50 text-blue-700'
                              }`}
                            >
                              {est.tipo_inscripcion === 'tutoria'
                                ? `Tutoría · Origen período ${
                                    est.periodo_origen_tutoria ?? '—'
                                  }`
                                : 'Regular'}
                            </span>

                            <span className="text-[10px] text-slate-500">
                              Intento {est.numero_intento}
                            </span>
                          </div>

                          {est.motivo_bloqueo && (
                            <p className="text-xs text-amber-700 mt-1">
                              {est.motivo_bloqueo}
                            </p>
                          )}

                          {(est.resultado_cualitativo_existente ||
                            est.nota_existente != null) && (
                            <div className="text-xs text-emerald-600 font-medium mt-1">
                              Calificación previa:{' '}
                              {esCualitativa
                                ? est.resultado_cualitativo_existente ||
                                  'Sin nomenclatura'
                                : est.nota_existente}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 align-middle">
                          {esCualitativa ? (
                            <select
                              aria-label={`Resultado de ${est.apellidos} ${est.nombres}`}
                              value={est.nota}
                              disabled={
                                loading ||
                                loadingData ||
                                !est.puede_calificar
                              }
                              onChange={(event) =>
                                handleNotaChange(
                                  est.inscripcion_id,
                                  event.target.value
                                )
                              }
                              className="w-full h-[42px] min-w-[140px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50"
                            >
                              <option value="">
                                Sin calificar
                              </option>

                              <option value="AP">
                                AP — Aprobado
                              </option>

                              <option value="IN">
                                IN — Inasistentes
                              </option>
                            </select>
                          ) : (
                            <input
                              aria-label={`Nota de ${est.apellidos} ${est.nombres}`}
                              type="number"
                              step="0.01"
                              min="1"
                              max="5"
                              value={est.nota}
                              disabled={
                                loading ||
                                loadingData ||
                                !est.puede_calificar
                              }
                              onChange={(event) =>
                                handleNotaChange(
                                  est.inscripcion_id,
                                  event.target.value
                                )
                              }
                              placeholder="1.00–5.00"
                              className={`w-full h-[42px] min-w-[120px] px-3 py-2 bg-slate-50 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all disabled:opacity-50 ${
                                notaEsInvalida(est.nota)
                                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20 text-red-700'
                                  : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/20'
                              }`}
                            />
                          )}
                        </td>

                        <td className="px-4 py-3 align-middle">
                          <input
                            aria-label={`Observaciones de ${est.apellidos} ${est.nombres}`}
                            type="text"
                            value={est.observaciones}
                            disabled={
                              loading ||
                              loadingData ||
                              !est.puede_calificar
                            }
                            onChange={(event) =>
                              handleObsChange(
                                est.inscripcion_id,
                                event.target.value
                              )
                            }
                            placeholder="Observaciones del docente..."
                            className="w-full h-[42px] min-w-[220px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Botón Guardar */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/30">
              <button
                type="submit"
               disabled={ loading || loadingData || estudiantes.length === 0 || notasIngresadas === 0}
                className="w-full px-4 py-3 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                Guardar Calificaciones Masivas {notasIngresadas > 0 && `(${notasIngresadas})`}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <GraduationCap size={20} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">¿Cómo funciona?</p>
          <p className="text-blue-700">
            Selecciona el periodo y la asignación. El sistema cargará automáticamente todos los estudiantes 
            inscritos en esa materia. Ingresa las notas y observaciones para cada uno y guarda todas de una vez. 
            Si un estudiante ya tiene calificación registrada, se <strong>actualizará</strong> automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}