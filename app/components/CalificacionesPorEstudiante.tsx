'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  Search,
} from 'lucide-react';

import type { TipoEvaluacion } from '@/lib/evaluacionMaterias';

import {
  valorCalificacionExistente,
  valorCalificacionValido,
  camposCalificacion,
  normalizarValorCalificacion,
} from '@/lib/formularioCalificaciones';

interface Estudiante {
  id: string;
  apellidos: string;
  nombres: string;
  cedula: string;
  periodo_id: number;
}

interface Asignacion {
  id: string;
  materia_nombre: string;
  materia_codigo: string;
  docente?: string;
  docente_nombre?: string;
  ano_escolar?: string;
  tipo_evaluacion: TipoEvaluacion;
}

interface EstudianteAsignacion {
  id: string;
  nota_existente?: number | string | null;
  observaciones_existentes?: string | null;
  resultado_cualitativo_existente?: 'AP' | 'IN' | null;
  inscripcion_id: string;
  intento_id: string;
  numero_intento: number;
  tipo_inscripcion: 'regular' | 'tutoria';
  periodo_origen_tutoria: number | null;
  puede_calificar: boolean;
  motivo_bloqueo?: string | null;
}

interface FilaMateria {
  asignacion_id: string;
  materia: string;
  codigo: string;
  docente: string;
  ano_escolar: string;
  nota: string;
  observaciones: string;
  nota_original: string;
  observaciones_originales: string;
  tipo_evaluacion: TipoEvaluacion;
  inscripcion_id: string;
  intento_id: string;
  numero_intento: number;
  tipo_inscripcion: 'regular' | 'tutoria';
  periodo_origen_tutoria: number | null;
  puede_calificar: boolean;
  motivo_bloqueo?: string | null;
}

async function leerRespuesta(res: Response) {
  const texto = await res.text();
  let data;

  try {
    data = texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error(`Respuesta no válida del servidor (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}.`);
  }

  return data;
}


function filaModificada(fila: FilaMateria) {
  return (
    normalizarValorCalificacion(
      fila.tipo_evaluacion,
      fila.nota
    ) !==
      normalizarValorCalificacion(
        fila.tipo_evaluacion,
        fila.nota_original
      ) ||
    fila.observaciones !== fila.observaciones_originales
  );
}

export default function CalificacionesPorEstudiante() {
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [estudianteId, setEstudianteId] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [filas, setFilas] = useState<FilaMateria[]>([]);

  const [cargandoEstudiantes, setCargandoEstudiantes] = useState(true);
  const [cargandoMaterias, setCargandoMaterias] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const cargarEstudiantes = async () => {
      try {
        const res = await fetch('/api/estudiantes', {
          signal: controller.signal,
          cache: 'no-store',
        });

        const data = await leerRespuesta(res);
        if (controller.signal.aborted) return;

        const lista: Estudiante[] = data.estudiantes || [];
        setEstudiantes(lista);

        const parametros = new URLSearchParams(window.location.search);
        const idInicial = parametros.get('estudiante_id');
        const periodoInicial = parametros.get('periodo_id');
        const alumno = lista.find((e) => e.id === idInicial);

        if (alumno) {
          setEstudianteId(alumno.id);
          setBusqueda(`${alumno.apellidos} ${alumno.nombres}`);

          const numero = Number(periodoInicial);

          setPeriodo(
            periodoInicial &&
              Number.isInteger(numero) &&
              numero >= 1 &&
              numero <= 6
              ? String(numero)
              : String(alumno.periodo_id)
          );
        } else if (idInicial) {
          setError(
            'El estudiante solicitado no está disponible para esta cuenta.'
          );
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los estudiantes.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setCargandoEstudiantes(false);
        }
      }
    };

    void cargarEstudiantes();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setFilas([]);
    setSuccess('');

    if (!estudianteId || !periodo) {
      setCargandoMaterias(false);
      return () => controller.abort();
    }

    setCargandoMaterias(true);
    setError('');

    const cargarMaterias = async () => {
      try {
        const res = await fetch(
          `/api/asignaciones?periodo_id=${encodeURIComponent(periodo)}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          }
        );

        const data = await leerRespuesta(res);
        const asignaciones: Asignacion[] = data.asignaciones || [];

        const resultados = await Promise.all(
          asignaciones.map(async (asignacion) => {
            const alumnosRes = await fetch(
              `/api/asignaciones/${asignacion.id}/estudiantes`,
              {
                signal: controller.signal,
                cache: 'no-store',
              }
            );

            const alumnosData =
              await leerRespuesta(alumnosRes);

            const tipo =
              alumnosData.asignacion?.tipo_evaluacion;

            if (
              tipo !== 'numerica' &&
              tipo !== 'cualitativa'
            ) {
              throw new Error(
                `No se recibió el tipo de evaluación de ${asignacion.materia_nombre}.`
              );
            }

            const inscripcionesAlumno = (
              (alumnosData.estudiantes || []) as EstudianteAsignacion[]
            ).filter(
              (est) => est.id === estudianteId
            );

            return inscripcionesAlumno.map(
              (inscripcion): FilaMateria => {
                const nota =
                  valorCalificacionExistente(
                    tipo,
                    inscripcion.nota_existente,
                    inscripcion.resultado_cualitativo_existente
                  );

                const observaciones =
                  inscripcion.observaciones_existentes || '';

                return {
                  asignacion_id: asignacion.id,
                  inscripcion_id:
                    inscripcion.inscripcion_id,
                  intento_id:
                    inscripcion.intento_id,
                  numero_intento:
                    inscripcion.numero_intento,
                  tipo_inscripcion:
                    inscripcion.tipo_inscripcion,
                  periodo_origen_tutoria:
                    inscripcion.periodo_origen_tutoria,
                  puede_calificar:
                    inscripcion.puede_calificar,
                  motivo_bloqueo:
                    inscripcion.motivo_bloqueo,

                  materia:
                    asignacion.materia_nombre,
                  codigo:
                    asignacion.materia_codigo,
                  docente:
                    asignacion.docente ||
                    asignacion.docente_nombre ||
                    'Sin nombre',
                  ano_escolar:
                    asignacion.ano_escolar || '',

                  tipo_evaluacion: tipo,
                  nota,
                  observaciones,
                  nota_original: nota,
                  observaciones_originales:
                    observaciones,
                };
              }
            );
          })
        );

        if (controller.signal.aborted) return;

        const disponibles = resultados.flat();

        const identificadores = new Set<string>();

        for (const fila of disponibles) {
          if (
            identificadores.has(
              fila.inscripcion_id
            )
          ) {
            throw new Error(
              `La materia ${fila.materia} tiene varias asignaciones ` +
                'activas compatibles con la misma inscripción. ' +
                'Use la carga por materia y seleccione la asignación ' +
                'correspondiente; revise después las asignaciones duplicadas.'
            );
          }

          identificadores.add(
            fila.inscripcion_id
          );
        }

        disponibles.sort(
          (a, b) =>
            a.materia.localeCompare(b.materia) ||
            a.tipo_inscripcion.localeCompare(
              b.tipo_inscripcion
            )
        );

        setFilas(disponibles);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;

        setFilas([]);
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar las materias del estudiante.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setCargandoMaterias(false);
        }
      }
    };

    void cargarMaterias();

    return () => controller.abort();
  }, [estudianteId, periodo]);

    const seleccionarEstudiante = (id: string) => {
        const alumnoSeleccionado = estudiantes.find((e) => e.id === id);

        if (!alumnoSeleccionado) return;

        setFilas([]);
        setError('');
        setSuccess('');

        setEstudianteId(alumnoSeleccionado.id);
        setPeriodo(String(alumnoSeleccionado.periodo_id));

        setBusqueda(
            `${alumnoSeleccionado.apellidos} ${alumnoSeleccionado.nombres}`
        );

        setMostrarResultados(false);
    };

  const actualizarFila = (
    inscripcionId: string,
    campo: 'nota' | 'observaciones',
    valor: string
    ) => {
      setSuccess('');

      setFilas((actuales) =>
        actuales.map((fila) =>
          fila.inscripcion_id === inscripcionId &&
          fila.puede_calificar
            ? { ...fila, [campo]: valor }
            : fila
        )
      );
  };

  const guardar = async () => {
    if (guardando || cargandoMaterias) return;

    setError('');
    setSuccess('');

    const vaciadas = filas.filter(
      (fila) =>
        fila.puede_calificar &&
        fila.nota_original.trim() !== '' &&
        fila.nota.trim() === ''
    );

    if (vaciadas.length > 0) {
      setError(
        'Hay notas existentes que dejaste vacías. ' +
          'Este formulario no elimina calificaciones: ' +
          'restaura esas notas o escribe su nuevo valor.'
      );
      return;
    }

    const pendientes = filas.filter(
    (fila) =>
      fila.puede_calificar &&
      fila.nota.trim() !== '' &&
      filaModificada(fila)
    )

    if (pendientes.length === 0) {
      setError('No hay notas nuevas o modificadas para guardar.');
      return;
    }

    const invalidas = pendientes.filter(
      (fila) =>
        !valorCalificacionValido(
          fila.tipo_evaluacion,
          fila.nota
        )
    );

    if (invalidas.length > 0) {
      setError(
        'Revise las calificaciones: las materias numéricas admiten ' +
          '1.00–5.00 con máximo dos decimales; Idiomas y Oficio ' +
          'admiten únicamente AP o IN.'
      );
      return;
    }

    setGuardando(true);

    const guardadas: string[] = [];
    const errores: string[] = [];

    try {
      for (const fila of pendientes) {
        try {
          const res = await fetch('/api/calificaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              asignacion_id: fila.asignacion_id,
              calificaciones: [
                {
                  estudiante_id: estudianteId,
                  inscripcion_id: fila.inscripcion_id,
                  ...camposCalificacion(
                    fila.tipo_evaluacion,
                    fila.nota
                  ),
                  observaciones: fila.observaciones,
                },
              ],
            }),
          });

          const data = await leerRespuesta(res);

          if (
            Number(data.guardadas) !== 1 ||
            (Array.isArray(data.errores) && data.errores.length > 0)
          ) {
            throw new Error(
              data.errores?.[0]?.error ||
                'El servidor no confirmó el guardado.'
            );
          }

          guardadas.push(fila.inscripcion_id);
        } catch (err: unknown) {
          errores.push(
            `${fila.materia}: ${
              err instanceof Error ? err.message : 'Error al guardar.'
            }`
          );
        }
      }

      setFilas((actuales) =>
        actuales.map((fila) =>
          guardadas.includes(fila.inscripcion_id)
            ? {
                ...fila,
                nota_original: fila.nota,
                observaciones_originales: fila.observaciones,
              }
            : fila
        )
      );

      if (guardadas.length > 0) {
        setSuccess(
          `Se guardaron ${guardadas.length} calificación(es).`
        );
      }

      if (errores.length > 0) {
        setError(
          `Quedaron ${errores.length} materia(s) sin confirmar. ` +
            'Puedes reintentar las pendientes. ' +
            errores.join(' | ')
        );
      }
    } finally {
      setGuardando(false);
    }
  };

    const alumno = estudiantes.find((e) => e.id === estudianteId);
    const normalizarBusqueda = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const palabrasBusqueda = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
    const encontrados = estudiantes.filter((estudiante) => {

        const contenido = normalizarBusqueda(`${estudiante.apellidos} ${estudiante.nombres} ${estudiante.cedula}`);
        return palabrasBusqueda.every((palabra) => contenido.includes(palabra));
    });

  const cantidadPendientes = filas.filter(
  (fila) =>
    fila.puede_calificar &&
    fila.nota.trim() !== '' &&
    filaModificada(fila)
  ).length;

  const bloqueado = guardando || cargandoEstudiantes;

  const inputClass =
    'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 ' +
    'rounded-xl text-sm focus:outline-none focus:border-blue-500 ' +
    'disabled:opacity-50';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">
          Calificaciones por Estudiante
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Busca un alumno y registra las notas de sus materias en un período.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2"
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2"
        >
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Buscador de estudiantes */}
            <div
            className="relative"
            onBlur={(event) => {
                const siguienteElemento = event.relatedTarget as Node | null;

                if (
                !siguienteElemento ||
                !event.currentTarget.contains(siguienteElemento)
                ) {
                setMostrarResultados(false);
                }
            }}
            >
            <label
                htmlFor="buscar-estudiante-notas"
                className="block text-xs font-bold text-slate-500 uppercase mb-2"
            >
                Estudiante
            </label>

            <div className="relative">
                <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                id="buscar-estudiante-notas"
                type="text"
                autoComplete="off"
                value={busqueda}
                disabled={bloqueado}
                placeholder={
                    cargandoEstudiantes
                    ? 'Cargando estudiantes...'
                    : 'Buscar por nombre, apellido o cédula...'
                }
                onFocus={() => setMostrarResultados(true)}
                onChange={(event) => {
                    setBusqueda(event.target.value);
                    setMostrarResultados(true);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                    setMostrarResultados(false);
                    }
                }}
                aria-expanded={mostrarResultados && !bloqueado}
                aria-controls="resultados-estudiantes-notas"
                className={`${inputClass} pl-9`}
                />
            </div>

            {mostrarResultados && !bloqueado && (
                <div
                id="resultados-estudiantes-notas"
                className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                >
                {encontrados.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-slate-500">
                    No se encontraron estudiantes.
                    </p>
                ) : (
                    <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {encontrados.map((estudiante) => {
                        const seleccionado = estudiante.id === estudianteId;

                        return (
                        <li key={estudiante.id}>
                            <button
                            type="button"
                            onClick={() =>
                                seleccionarEstudiante(estudiante.id)
                            }
                            className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between gap-3 ${
                                seleccionado
                                ? 'bg-blue-50 text-blue-900'
                                : 'hover:bg-slate-50 text-slate-900'
                            }`}
                            >
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">
                                {estudiante.apellidos} {estudiante.nombres}
                                </p>

                                <p className="text-xs text-slate-500 mt-0.5">
                                CI: {estudiante.cedula}
                                {' · '}
                                Período {estudiante.periodo_id}
                                </p>
                            </div>

                            {seleccionado && (
                                <CheckCircle2
                                size={18}
                                className="text-blue-600 shrink-0"
                                />
                            )}
                            </button>
                        </li>
                        );
                    })}
                    </ul>
                )}
                </div>
            )}
            </div>

            {/* Filtro de período */}
            <div>
            <label
                htmlFor="notas-periodo"
                className="block text-xs font-bold text-slate-500 uppercase mb-2"
            >
                Período
            </label>

            <select
                id="notas-periodo"
                value={periodo}
                onChange={(event) => {
                setFilas([]);
                setPeriodo(event.target.value);
                }}
                disabled={bloqueado || !estudianteId}
                className={inputClass}
            >
                <option value="">Seleccionar período</option>

                {[1, 2, 3, 4, 5, 6].map((p) => (
                <option key={p} value={p}>
                    Período {p}
                </option>
                ))}
            </select>
            </div>
        </div>

        {alumno && (
            <p className="text-sm text-blue-800 bg-blue-50 rounded-xl p-3">
            {alumno.apellidos} {alumno.nombres}
            {' — '}
            CI: {alumno.cedula}
            </p>
        )}
        </div>

      {cargandoMaterias ? (
        <div className="flex justify-center items-center gap-2 py-10 text-slate-500">
          <Loader2 size={20} className="animate-spin" />
          Cargando materias y notas...
        </div>
      ) : (
        estudianteId &&
        periodo && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {filas.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                No hay materias calificables disponibles para este alumno,
                período y cuenta. Deben existir una inscripción activa
                y una asignación docente accesible.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3">
                          Materia / Docente
                        </th>

                        <th className="px-4 py-3 w-44">
                          Calificación
                        </th>

                        <th className="px-4 py-3">
                          Observaciones
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filas.map((fila) => (
                        <tr
                          key={fila.inscripcion_id}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          {/* Información de la materia */}
                          <td className="px-4 py-3 align-middle">
                            <p className="font-semibold text-slate-900">
                              {fila.materia}
                            </p>

                            <p className="text-xs text-slate-500">
                              {fila.codigo} — {fila.docente}
                            </p>

                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  fila.tipo_inscripcion === 'tutoria'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {fila.tipo_inscripcion === 'tutoria'
                                  ? `Tutoría · Origen período ${
                                      fila.periodo_origen_tutoria ?? '—'
                                    }`
                                  : 'Regular'}
                              </span>

                              <span className="text-[10px] text-slate-500">
                                Intento {fila.numero_intento}
                              </span>
                            </div>

                            {fila.ano_escolar && (
                              <p className="text-xs text-slate-400 mt-1">
                                Año escolar: {fila.ano_escolar}
                              </p>
                            )}

                            {fila.motivo_bloqueo && (
                              <p className="text-xs text-amber-700 mt-1">
                                {fila.motivo_bloqueo}
                              </p>
                            )}
                          </td>

                          {/* Calificación: siempre dentro de su propia celda */}
                          <td className="px-4 py-3 align-middle">
                            {fila.tipo_evaluacion === 'cualitativa' ? (
                              <select
                                aria-label={`Resultado de ${fila.materia}`}
                                value={fila.nota}
                                disabled={
                                  guardando ||
                                  !fila.puede_calificar
                                }
                                onChange={(event) =>
                                  actualizarFila(
                                    fila.inscripcion_id,
                                    'nota',
                                    event.target.value
                                  )
                                }
                                className={`${inputClass} h-[42px] min-w-[140px]`}
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
                                aria-label={`Nota de ${fila.materia}`}
                                type="number"
                                min="1"
                                max="5"
                                step="0.01"
                                value={fila.nota}
                                disabled={
                                  guardando ||
                                  !fila.puede_calificar
                                }
                                onChange={(event) =>
                                  actualizarFila(
                                    fila.inscripcion_id,
                                    'nota',
                                    event.target.value
                                  )
                                }
                                placeholder="1.00–5.00"
                                className={`${inputClass} h-[42px] min-w-[120px]`}
                              />
                            )}
                          </td>

                          {/* Observaciones: celda restaurada */}
                          <td className="px-4 py-3 align-middle">
                            <input
                              aria-label={`Observaciones de ${fila.materia}`}
                              type="text"
                              value={fila.observaciones}
                              disabled={
                                guardando ||
                                !fila.puede_calificar
                              }
                              onChange={(event) =>
                                actualizarFila(
                                  fila.inscripcion_id,
                                  'observaciones',
                                  event.target.value
                                )
                              }
                              placeholder="Observaciones..."
                              className={`${inputClass} h-[42px] min-w-[220px]`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={guardar}
                    disabled={
                      guardando ||
                      cargandoMaterias ||
                      cantidadPendientes === 0
                    }
                    className="w-full px-4 py-3 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-950 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {guardando ? (
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />
                    ) : (
                      <Save size={18} />
                    )}

                    {guardando
                      ? 'Guardando...'
                      : `Guardar calificaciones del alumno (${cantidadPendientes})`}
                  </button>
                </div>
              </>
            )}
          </div>
        )
      )}

      <p className="text-xs text-slate-500">
        Se guardan solamente las notas nuevas o modificadas. Las materias
        sin nota pueden quedar pendientes. Vaciar una nota existente no
        elimina su registro.
      </p>
    </div>
  );
}