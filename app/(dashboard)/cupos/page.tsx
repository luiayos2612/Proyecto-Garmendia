'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Bell,
  RefreshCw,
  Loader2,
  BookOpen,
} from 'lucide-react';

interface TutoriaPlan {
  tutoria_id: string | null;
  materia_id: string;
  inscripcion_origen_id: string;
  nombre: string;
  periodo_origen: number;
  nota: number | null;
  es_nueva: boolean;
}

interface Complementaria {
  materia_id: string;
  nombre: string;
  aprobada: boolean;
  disponible: boolean;
  obligatoria: boolean;
  ultimo_resultado: string | null;
  descripcion: string;
}

interface DetalleCupo {
  tipo_transicion: string;
  periodo_destino: number;
  tutorias: TutoriaPlan[];
  complementarias: Complementaria[];
  bloqueos: string[];
  puede_procesar: boolean;
  version_evaluacion: string;
}

interface Cupo {
  id: string;
  estudiante_id: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  periodo_origen: number;
  periodo_destino: number;
  promedio_general: number | string | null;
  tipo_transicion: string;
  detalle: DetalleCupo | null;
  error_detalle: string | null;
}

interface RespuestaCupos {
  cupos: Cupo[];
  puede_procesar: boolean;
}

const nombresTransicion: Record<string, string> = {
  avance: 'Avance de período',
  avance_con_tutorias: 'Avance con tutorías',
  repeticion: 'Repetición del período',
  recuperacion_final: 'Recuperación final',
  culminacion: 'Culminación de estudios',
};

function esObjeto(
  valor: unknown
): valor is Record<string, unknown> {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor)
  );
}

async function leerRespuesta(
  res: Response
): Promise<unknown> {
  const texto = await res.text();

  let respuesta: unknown;

  try {
    respuesta = texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error(
      `El servidor devolvió una respuesta no válida. HTTP ${res.status}.`
    );
  }

  if (!res.ok) {
    throw new Error(
      esObjeto(respuesta) &&
      typeof respuesta.error === 'string'
        ? respuesta.error
        : `No se pudo completar la solicitud. HTTP ${res.status}.`
    );
  }

  return respuesta;
}

function validarRespuestaCupos(
  respuesta: unknown
): RespuestaCupos {
  if (
    !esObjeto(respuesta) ||
    !Array.isArray(respuesta.cupos) ||
    typeof respuesta.puede_procesar !== 'boolean'
  ) {
    throw new Error(
      'La respuesta de /api/cupos no corresponde al formato nuevo. ' +
        'Revise que app/api/cupos/route.ts esté actualizado.'
    );
  }

  for (const registro of respuesta.cupos) {
    if (
      !esObjeto(registro) ||
      typeof registro.id !== 'string' ||
      typeof registro.estudiante_id !== 'string' ||
      typeof registro.nombres !== 'string' ||
      typeof registro.apellidos !== 'string' ||
      typeof registro.cedula !== 'string' ||
      !Number.isInteger(registro.periodo_origen) ||
      !Number.isInteger(registro.periodo_destino) ||
      typeof registro.tipo_transicion !== 'string'
    ) {
      throw new Error(
        'La API devolvió un cupo incompleto o el formato agrupado antiguo. ' +
          'No se habilitarán las acciones hasta corregir la respuesta.'
      );
    }

    if (registro.detalle === null) {
      continue;
    }

    const detalle = registro.detalle;

    if (
      !esObjeto(detalle) ||
      !Array.isArray(detalle.tutorias) ||
      !Array.isArray(detalle.complementarias) ||
      !Array.isArray(detalle.bloqueos) ||
      typeof detalle.puede_procesar !== 'boolean' ||
      typeof detalle.version_evaluacion !== 'string'
    ) {
      throw new Error(
        'El detalle de un cupo está incompleto. ' +
          'Revise obtenerDetalleCupo en lib/cuposAcademicos.ts.'
      );
    }

    if (
      !detalle.bloqueos.every(
        (bloqueo: unknown) =>
          typeof bloqueo === 'string'
      )
    ) {
      throw new Error(
        'Los requisitos pendientes del cupo no tienen un formato válido.'
      );
    }

    for (const tutoria of detalle.tutorias) {
      if (
        !esObjeto(tutoria) ||
        typeof tutoria.inscripcion_origen_id !== 'string' ||
        typeof tutoria.nombre !== 'string' ||
        typeof tutoria.es_nueva !== 'boolean'
      ) {
        throw new Error(
          'La API devolvió una tutoría incompleta.'
        );
      }
    }

    for (const materia of detalle.complementarias) {
      if (
        !esObjeto(materia) ||
        typeof materia.materia_id !== 'string' ||
        typeof materia.nombre !== 'string' ||
        typeof materia.aprobada !== 'boolean' ||
        typeof materia.disponible !== 'boolean' ||
        typeof materia.obligatoria !== 'boolean' ||
        typeof materia.descripcion !== 'string'
      ) {
        throw new Error(
          'La API devolvió una complementaria incompleta.'
        );
      }
    }
  }

  return respuesta as unknown as RespuestaCupos;
}

export default function CuposPage() {
  const [cupos, setCupos] =
    useState<Cupo[]>([]);

  const [selecciones, setSelecciones] =
    useState<Record<string, string[]>>({});

  const [loading, setLoading] =
    useState(true);

  const [procesando, setProcesando] =
    useState<string | null>(null);

  const [puedeProcesar, setPuedeProcesar] =
    useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const operacionEnCurso = useRef(false);

  const cargarCupos = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch('/api/cupos', {
        cache: 'no-store',
      });

      const respuesta =
        await leerRespuesta(res);

      const datos =
        validarRespuestaCupos(respuesta);

      setCupos(datos.cupos);
      setPuedeProcesar(
        datos.puede_procesar
      );

      setSelecciones((anteriores) => {
        const nuevas: Record<string, string[]> = {};

        for (const cupo of datos.cupos) {
          const opciones =
            cupo.detalle?.complementarias || [];

          const obligatorias = opciones
            .filter(
              (materia) =>
                materia.obligatoria &&
                materia.disponible
            )
            .map(
              (materia) =>
                materia.materia_id
            );

          const previas = (
            anteriores[cupo.id] || []
          ).filter(
            (id) =>
              opciones.some(
                (materia) =>
                  materia.materia_id === id &&
                  materia.disponible
              )
          );

          nuevas[cupo.id] = Array.from(
            new Set([
              ...obligatorias,
              ...previas,
            ])
          );
        }

        return nuevas;
      });
    } catch (err: unknown) {
      // No dejar acciones disponibles sobre una
      // respuesta anterior si la recarga falla.
      setCupos([]);
      setPuedeProcesar(false);

      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar los cupos.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarCupos();
  }, [cargarCupos]);

  const cambiarComplementaria = (
    cupo: Cupo,
    materiaId: string
  ) => {
    if (
      procesando !== null ||
      !puedeProcesar
    ) {
      return;
    }

    const opcion =
      cupo.detalle?.complementarias.find(
        (materia) =>
          materia.materia_id === materiaId
      );

    if (
      !opcion ||
      !opcion.disponible ||
      opcion.obligatoria
    ) {
      return;
    }

    setSelecciones((actuales) => {
      const seleccion =
        actuales[cupo.id] || [];

      const siguiente =
        seleccion.includes(materiaId)
          ? seleccion.filter(
              (id) => id !== materiaId
            )
          : seleccion.length < 2
            ? [...seleccion, materiaId]
            : seleccion;

      return {
        ...actuales,
        [cupo.id]: siguiente,
      };
    });
  };

  const procesarCupo = async (
    cupo: Cupo,
    accion: 'aprobar' | 'rechazar'
  ) => {
    if (
      operacionEnCurso.current ||
      !puedeProcesar
    ) {
      return;
    }

    const detalle = cupo.detalle;
    const seleccion =
      selecciones[cupo.id] || [];

    if (accion === 'aprobar') {
      if (
        !detalle ||
        !detalle.puede_procesar ||
        detalle.bloqueos.length > 0
      ) {
        setError(
          'El cupo tiene requisitos pendientes o no pudo evaluarse.'
        );
        return;
      }

      if (
        detalle.complementarias.some(
          (materia) =>
            materia.obligatoria &&
            !seleccion.includes(
              materia.materia_id
            )
        )
      ) {
        setError(
          'Debe seleccionar todas las complementarias obligatorias.'
        );
        return;
      }
    }

    const descripcion =
      nombresTransicion[
        cupo.tipo_transicion
      ] || cupo.tipo_transicion;

    const nombresComplementarias =
      detalle?.complementarias
        .filter(
          (materia) =>
            seleccion.includes(
              materia.materia_id
            )
        )
        .map(
          (materia) => materia.nombre
        )
        .join(', ') || 'Ninguna';

    const nombresTutorias =
      detalle?.tutorias
        .map(
          (tutoria) =>
            `${tutoria.nombre} ` +
            `(origen: período ${tutoria.periodo_origen})`
        )
        .join(', ') || 'Ninguna';

    const mensaje =
      accion === 'rechazar'
        ? '¿Rechazar esta solicitud sin modificar el intento del alumno?'
        : `¿Confirmar ${descripcion} para ` +
          `${cupo.apellidos} ${cupo.nombres}?\n\n` +
          `Tutorías: ${nombresTutorias}.\n` +
          `Complementarias: ${nombresComplementarias}.\n\n` +
          (
            cupo.tipo_transicion ===
            'culminacion'
              ? 'Se cerrará el intento como culminado, sin generar otro intento ni mensualidades.'
              : 'Se cerrará el intento actual y se abrirá el destino con seis mensualidades, sin otra inscripción.'
          );

    if (!window.confirm(mensaje)) return;

    operacionEnCurso.current = true;
    setProcesando(cupo.id);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/cupos', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cupo_id: cupo.id,
          accion,
          version_evaluacion:
            detalle?.version_evaluacion || '',
          materias_complementarias:
            seleccion,
        }),
      });

      const respuesta =
        await leerRespuesta(res);

      if (
        !esObjeto(respuesta) ||
        respuesta.success !== true
      ) {
        throw new Error(
          'El servidor no confirmó la operación.'
        );
      }

      const mensajeExito =
        typeof respuesta.message === 'string'
          ? respuesta.message
          : 'Solicitud procesada correctamente.';

      await cargarCupos();
      setSuccess(mensajeExito);
    } catch (err: unknown) {
      const mensajeError =
        err instanceof Error
          ? err.message
          : 'No se pudo procesar la solicitud.';

      await cargarCupos();
      setError(mensajeError);
    } finally {
      setProcesando(null);
      operacionEnCurso.current = false;
    }
  };

  const actualizar = () => {
    if (procesando !== null) return;

    setError('');
    setSuccess('');
    void cargarCupos();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2
          size={36}
          className="animate-spin text-blue-900"
        />
      </div>
    );
  }

  // Los grupos se construyen aquí a partir de
  // la lista plana que devuelve la API nueva.
  const grupos = cupos.reduce(
    (resultado, cupo) => {
      const clave =
        String(cupo.periodo_destino);

      if (!resultado[clave]) {
        resultado[clave] = [];
      }

      resultado[clave].push(cupo);

      return resultado;
    },
    {} as Record<string, Cupo[]>
  );

  const entradasGrupos =
    Object.entries(grupos).sort(
      ([a], [b]) =>
        Number(a) - Number(b)
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Gestión de Cupos
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Revise la transición académica,
            las tutorías y las complementarias.
          </p>
        </div>

        <button
          type="button"
          disabled={procesando !== null}
          onClick={actualizar}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2"
        >
          <AlertCircle
            size={18}
            className="shrink-0 mt-0.5"
          />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-start gap-2"
        >
          <CheckCircle2
            size={18}
            className="shrink-0 mt-0.5"
          />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {entradasGrupos.map(
          ([periodo, estudiantes]) => (
            <div
              key={periodo}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4"
            >
              <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
                <GraduationCap size={24} />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">
                  Destino período {periodo}
                </p>

                <p className="text-2xl font-extrabold text-slate-900">
                  {estudiantes.length}
                </p>

                <p className="text-[10px] text-slate-400">
                  solicitudes pendientes
                </p>
              </div>
            </div>
          )
        )}
      </div>

      {!error && cupos.length === 0 && (
        <div className="bg-white rounded-2xl p-10 border border-slate-200 text-center text-slate-500">
          <Bell
            size={44}
            className="mx-auto mb-3 text-slate-300"
          />

          <p className="font-medium">
            No hay cupos pendientes.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {entradasGrupos.map(
          ([periodo, estudiantes]) => (
            <section
              key={periodo}
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900">
                  Destino período {periodo}
                </h2>

                <span className="px-2.5 py-0.5 bg-violet-100 text-violet-700 rounded-full text-xs font-bold border border-violet-200">
                  {estudiantes.length}{' '}
                  estudiante(s)
                </span>
              </div>

              {estudiantes.map((cupo) => {
                const detalle =
                  cupo.detalle;

                const seleccion =
                  selecciones[cupo.id] || [];

                const bloqueado =
                  procesando !== null ||
                  !puedeProcesar;

                return (
                  <article
                    key={cupo.id}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-5"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold shrink-0">
                        {cupo.apellidos?.[0]}
                        {cupo.nombres?.[0]}
                      </div>

                      <div>
                        <h3 className="font-bold text-slate-900">
                          {cupo.apellidos}{' '}
                          {cupo.nombres}
                        </h3>

                        <p className="text-xs text-slate-500">
                          CI: {cupo.cedula}
                          {' · '}
                          Período{' '}
                          {cupo.periodo_origen}
                          {' → '}
                          {cupo.periodo_destino}
                        </p>

                        <p className="text-sm font-semibold text-blue-800 mt-1">
                          {nombresTransicion[
                            cupo.tipo_transicion
                          ] ||
                            cupo.tipo_transicion}
                        </p>

                        {cupo.promedio_general !=
                          null && (
                          <p className="text-xs text-emerald-600 mt-1">
                            Promedio numérico:{' '}
                            {Number(
                              cupo.promedio_general
                            ).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>

                    {cupo.error_detalle && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                        {cupo.error_detalle}
                      </div>
                    )}

                    {!detalle &&
                      !cupo.error_detalle && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
                          No se recibió el detalle
                          académico. Actualice antes
                          de aprobar.
                        </div>
                      )}

                    {detalle && (
                      <>
                        {detalle.bloqueos.length >
                          0 && (
                          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                            <ul className="list-disc pl-5 space-y-1">
                              {detalle.bloqueos.map(
                                (
                                  bloqueo,
                                  indice
                                ) => (
                                  <li
                                    key={indice}
                                  >
                                    {bloqueo}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                            <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                              <BookOpen
                                size={16}
                              />
                              Tutorías del próximo
                              intento
                            </h4>

                            {detalle.tutorias
                              .length === 0 ? (
                              <p className="text-sm text-amber-800">
                                No se inscribirán
                                tutorías.
                              </p>
                            ) : (
                              <ul className="space-y-2">
                                {detalle.tutorias.map(
                                  (tutoria) => (
                                    <li
                                      key={
                                        tutoria.inscripcion_origen_id
                                      }
                                      className="bg-white/70 rounded-lg p-3 text-sm"
                                    >
                                      <p className="font-semibold text-slate-900">
                                        {
                                          tutoria.nombre
                                        }
                                      </p>

                                      <p className="text-xs text-slate-600 mt-1">
                                        Origen:
                                        período{' '}
                                        {
                                          tutoria.periodo_origen
                                        }
                                      </p>

                                      {tutoria.nota !=
                                        null && (
                                        <p className="text-xs text-rose-700">
                                          Nota:{' '}
                                          {Number(
                                            tutoria.nota
                                          ).toFixed(
                                            2
                                          )}
                                        </p>
                                      )}

                                      <p className="text-xs text-amber-800 mt-1">
                                        {tutoria.es_nueva
                                          ? 'Nueva tutoría'
                                          : 'Tutoría anterior pendiente'}
                                      </p>
                                    </li>
                                  )
                                )}
                              </ul>
                            )}

                            {cupo.tipo_transicion ===
                              'repeticion' && (
                              <p className="text-xs text-amber-900">
                                Se recursarán
                                todas las materias
                                numéricas regulares
                                del período.
                                Las tutorías
                                anteriores pendientes
                                se conservan.
                              </p>
                            )}
                          </div>

                          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                            <h4 className="text-sm font-bold text-violet-900">
                              Complementarias
                            </h4>

                            <p className="text-xs text-violet-700">
                              Las aprobadas no
                              vuelven a inscribirse.
                              Al entrar o continuar
                              en el período 6,
                              todas las pendientes
                              son obligatorias.
                            </p>

                            {detalle.complementarias.map(
                              (materia) => (
                                <label
                                  key={
                                    materia.materia_id
                                  }
                                  className="flex items-start gap-3 bg-white/70 rounded-lg p-3"
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      seleccion.includes(
                                        materia.materia_id
                                      )
                                    }
                                    disabled={
                                      bloqueado ||
                                      !materia.disponible ||
                                      materia.obligatoria
                                    }
                                    onChange={() =>
                                      cambiarComplementaria(
                                        cupo,
                                        materia.materia_id
                                      )
                                    }
                                    className="mt-1 w-4 h-4 rounded text-violet-600"
                                  />

                                  <span className="text-sm">
                                    <span className="block font-semibold text-slate-900">
                                      {
                                        materia.nombre
                                      }
                                    </span>

                                    <span className="block text-xs text-slate-600 mt-1">
                                      {
                                        materia.descripcion
                                      }
                                    </span>

                                    {materia.obligatoria && (
                                      <span className="block text-xs font-semibold text-violet-800 mt-1">
                                        Inscripción
                                        obligatoria
                                      </span>
                                    )}

                                    {!materia.aprobada &&
                                      !materia.disponible &&
                                      cupo.tipo_transicion !==
                                        'culminacion' && (
                                        <span className="block text-xs text-rose-700 mt-1">
                                          No está
                                          disponible
                                          en el
                                          destino.
                                        </span>
                                      )}
                                  </span>
                                </label>
                              )
                            )}

                            <p className="text-xs font-semibold text-violet-800">
                              {seleccion.length}{' '}
                              complementaria(s)
                              seleccionada(s)
                            </p>
                          </div>
                        </div>
                      </>
                    )}

                    {puedeProcesar && (
                      <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={bloqueado}
                          onClick={() =>
                            void procesarCupo(
                              cupo,
                              'rechazar'
                            )
                          }
                          className="px-4 py-2.5 bg-white text-rose-600 border border-rose-200 rounded-xl font-semibold text-sm hover:bg-rose-50 flex items-center gap-2 disabled:opacity-50"
                        >
                          <XCircle size={16} />
                          Rechazar
                        </button>

                        <button
                          type="button"
                          disabled={
                            bloqueado ||
                            !detalle ||
                            !detalle.puede_procesar ||
                            detalle.bloqueos.length >
                              0
                          }
                          onClick={() =>
                            void procesarCupo(
                              cupo,
                              'aprobar'
                            )
                          }
                          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50"
                        >
                          {procesando ===
                          cupo.id ? (
                            <Loader2
                              size={16}
                              className="animate-spin"
                            />
                          ) : (
                            <CheckCircle2
                              size={16}
                            />
                          )}
                          Confirmar transición
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          )
        )}
      </div>
    </div>
  );
}