'use client';

import { useEffect, useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  Link2,
  Save,
  Search,
  UserCircle,
} from 'lucide-react';

interface Periodo {
  numero: number;
  nombre: string;
}

interface Materia {
  periodo_id: number;
  materia_id: string;
  nombre: string;
  codigo: string;
  es_obligatoria: boolean | null;
}

interface Docente {
  id: string;
  apellidos: string;
  nombres: string;
  especialidad: string | null;
}

interface Asignacion {
  id: string;
  periodo_id: number;
  materia_id: string;
  docente_id: string | null;
  docente: string | null;
  docente_activo: boolean | null;
}

interface AsignacionLectura {
  id: string;
  periodo_id: number;
  materia: string;
  docente: string;
  codigo: string;
  ano_escolar: string | null;
}

interface DatosGestion {
  periodos: Periodo[];
  materias: Materia[];
  docentes: Docente[];
  asignaciones: Asignacion[];
  anos: string[];
  fuera_catalogo: Asignacion[];
}

interface UsuarioActual {
  rol: string;
}

interface RespuestaAnos {
  anos: string[];
  configurado: string | null;
}

interface RespuestaGuardado {
  success: boolean;
  modificadas: number;
  message: string;
}

const claseCampo =
  'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60';

const ROLES_GESTION = ['director', 'secretaria'];

function crearClave(periodo: number, materia: string) {
  return `${periodo}:${materia}`;
}

function obtenerMensajeError(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación.';
}

async function solicitar<T>(
  url: string,
  opciones?: RequestInit
): Promise<T> {
  const respuesta = await fetch(url, {
    ...opciones,
    cache: 'no-store',
  });

  let datos: unknown;

  try {
    datos = await respuesta.json();
  } catch {
    throw new Error(
      'El servidor no devolvió una respuesta JSON válida. Revise que exista la ruta de la API y consulte la terminal.'
    );
  }

  if (!respuesta.ok) {
    const contenido = datos as {
      error?: string;
      message?: string;
    };

    throw new Error(
      contenido?.error ||
        contenido?.message ||
        `La solicitud falló con el estado ${respuesta.status}.`
    );
  }

  return datos as T;
}

function crearSelecciones(
  datos: DatosGestion
): Record<string, string> {
  const selecciones: Record<string, string> = {};

  for (const materia of datos.materias) {
    selecciones[
      crearClave(materia.periodo_id, materia.materia_id)
    ] = '';
  }

  for (const asignacion of datos.asignaciones) {
    selecciones[
      crearClave(
        asignacion.periodo_id,
        asignacion.materia_id
      )
    ] = asignacion.docente_id || '';
  }

  return selecciones;
}

function normalizarDatos(datos: DatosGestion): DatosGestion {
  return {
    periodos: datos.periodos || [],
    materias: datos.materias || [],
    docentes: datos.docentes || [],
    asignaciones: datos.asignaciones || [],
    anos: datos.anos || [],
    fuera_catalogo: datos.fuera_catalogo || [],
  };
}

export default function AsignacionesPage() {
  const [iniciando, setIniciando] = useState(true);
  const [rol, setRol] = useState('');

  const [anosDisponibles, setAnosDisponibles] = useState<
    string[]
  >([]);
  const [anoSeleccionado, setAnoSeleccionado] = useState('');
  const [anoCargado, setAnoCargado] = useState('');

  const [datos, setDatos] = useState<DatosGestion | null>(
    null
  );

  const [selecciones, setSelecciones] = useState<
    Record<string, string>
  >({});

  const [asignacionesLectura, setAsignacionesLectura] =
    useState<AsignacionLectura[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);

  const [guardandoPeriodo, setGuardandoPeriodo] = useState<
    number | null
  >(null);

  const [requiereRecarga, setRequiereRecarga] =
    useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const puedeGestionar = ROLES_GESTION.includes(rol);

  const ocupado =
    iniciando ||
    cargando ||
    guardandoPeriodo !== null;

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      try {
        const usuario = await solicitar<UsuarioActual>(
          '/api/auth/me'
        );

        if (cancelado) return;

        setRol(usuario.rol);

        if (ROLES_GESTION.includes(usuario.rol)) {
          const respuestaAnos =
            await solicitar<RespuestaAnos>(
              '/api/asignaciones/anos'
            );

          if (cancelado) return;

          const anos = Array.from(
            new Set(
              (respuestaAnos.anos || [])
                .filter(
                  (ano): ano is string =>
                    typeof ano === 'string'
                )
                .map((ano) => ano.trim())
                .filter(Boolean)
            )
          );

          const configurado =
            respuestaAnos.configurado?.trim() || '';

          if (
            configurado &&
            !anos.includes(configurado)
          ) {
            anos.unshift(configurado);
          }

          setAnosDisponibles(anos);

          setAnoSeleccionado(
            configurado || anos[0] || ''
          );

          if (anos.length === 0) {
            setError(
              'No hay años escolares registrados. Revise el año escolar en Configuración antes de continuar.'
            );
          }
        } else {
          const resultado = await solicitar<{
            asignaciones: AsignacionLectura[];
          }>('/api/asignaciones');

          if (cancelado) return;

          setAsignacionesLectura(
            resultado.asignaciones || []
          );
        }
      } catch (errorInicio) {
        if (!cancelado) {
          setError(obtenerMensajeError(errorInicio));
        }
      } finally {
        if (!cancelado) {
          setIniciando(false);
        }
      }
    }

    iniciar();

    return () => {
      cancelado = true;
    };
  }, []);

  const asignacionesActuales = new Map<
    string,
    Asignacion
  >(
    (datos?.asignaciones || []).map((asignacion) => [
      crearClave(
        asignacion.periodo_id,
        asignacion.materia_id
      ),
      asignacion,
    ])
  );

  const cambiosPendientes = (
    datos?.materias || []
  ).filter((materia) => {
    const clave = crearClave(
      materia.periodo_id,
      materia.materia_id
    );

    const seleccionado = selecciones[clave] || '';

    const original =
      asignacionesActuales.get(clave)?.docente_id || '';

    return seleccionado !== original;
  });

  const hayCambios = cambiosPendientes.length > 0;

  const textoBusqueda = busqueda
    .trim()
    .toLowerCase();

  useEffect(() => {
    if (!hayCambios) return;

    const avisarSalida = (
      evento: BeforeUnloadEvent
    ) => {
      evento.preventDefault();
      evento.returnValue = '';
    };

    window.addEventListener(
      'beforeunload',
      avisarSalida
    );

    return () => {
      window.removeEventListener(
        'beforeunload',
        avisarSalida
      );
    };
  }, [hayCambios]);

  async function cargarAsignaciones() {
    setError('');
    setMensaje('');

    if (
      !anoSeleccionado ||
      !anosDisponibles.includes(anoSeleccionado)
    ) {
      setError(
        'Seleccione un año escolar de la lista.'
      );
      return;
    }

    if (hayCambios && !requiereRecarga) {
      setError(
        'Guarde o descarte los cambios pendientes antes de cargar las asignaciones.'
      );
      return;
    }

    setCargando(true);

    try {
      const respuesta =
        await solicitar<DatosGestion>(
          `/api/asignaciones/gestion?ano_escolar=${encodeURIComponent(
            anoSeleccionado
          )}`
        );

      const nuevosDatos = normalizarDatos(respuesta);

      setDatos(nuevosDatos);
      setSelecciones(
        crearSelecciones(nuevosDatos)
      );
      setAnoCargado(anoSeleccionado);
      setRequiereRecarga(false);
    } catch (errorCarga) {
      setError(obtenerMensajeError(errorCarga));
    } finally {
      setCargando(false);
    }
  }

  function descartarCambios() {
    if (!datos || requiereRecarga) return;

    setSelecciones(crearSelecciones(datos));
    setError('');
    setMensaje('Se descartaron los cambios pendientes.');
  }

  async function guardarPeriodo(periodo: number) {
    if (
      !datos ||
      !anoCargado ||
      ocupado ||
      requiereRecarga
    ) {
      return;
    }

    const cambios = cambiosPendientes
      .filter(
        (materia) =>
          materia.periodo_id === periodo
      )
      .map((materia) => {
        const clave = crearClave(
          materia.periodo_id,
          materia.materia_id
        );

        return {
          materia_id: materia.materia_id,
          docente_id: selecciones[clave] || null,
          asignacion_anterior_id:
            asignacionesActuales.get(clave)?.id ||
            null,
        };
      });

    if (cambios.length === 0) return;

    setGuardandoPeriodo(periodo);
    setError('');
    setMensaje('');

    let guardadoConfirmado = false;

    try {
      const resultado =
        await solicitar<RespuestaGuardado>(
          '/api/asignaciones/gestion',
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              periodo_id: periodo,
              ano_escolar: anoCargado,
              cambios,
            }),
          }
        );

      guardadoConfirmado = true;

      const respuesta =
        await solicitar<DatosGestion>(
          `/api/asignaciones/gestion?ano_escolar=${encodeURIComponent(
            anoCargado
          )}`
        );

      const nuevosDatos = normalizarDatos(respuesta);

      const originalesNuevos =
        crearSelecciones(nuevosDatos);

      /*
       * Los cambios pendientes de otros períodos se
       * conservan, pero solo en las materias que el
       * usuario había modificado realmente.
       */
      const cambiosDeOtrosPeriodos =
        cambiosPendientes.filter(
          (materia) =>
            materia.periodo_id !== periodo
        );

      for (const materia of cambiosDeOtrosPeriodos) {
        const clave = crearClave(
          materia.periodo_id,
          materia.materia_id
        );

        const sigueEnCatalogo =
          nuevosDatos.materias.some(
            (item) =>
              item.periodo_id ===
                materia.periodo_id &&
              item.materia_id ===
                materia.materia_id
          );

        if (sigueEnCatalogo) {
          originalesNuevos[clave] =
            selecciones[clave] || '';
        }
      }

      setDatos(nuevosDatos);
      setSelecciones(originalesNuevos);

      setMensaje(
        resultado.message ||
          'Asignaciones guardadas correctamente.'
      );
    } catch (errorGuardado) {
      setRequiereRecarga(true);

      const detalle =
        obtenerMensajeError(errorGuardado);

      setError(
        guardadoConfirmado
          ? `Los cambios sí se guardaron, pero no se pudo actualizar la pantalla. Pulse «Recargar datos» antes de continuar. ${detalle}`
          : `No se pudo confirmar el guardado. Pulse «Recargar datos» para consultar el estado real antes de volver a editar. ${detalle}`
      );
    } finally {
      setGuardandoPeriodo(null);
    }
  }

  const lecturaFiltrada =
    asignacionesLectura.filter(
      (asignacion) =>
        [
          asignacion.materia,
          asignacion.codigo,
          asignacion.docente,
          asignacion.ano_escolar,
          `Período ${asignacion.periodo_id}`,
        ]
          .join(' ')
          .toLowerCase()
          .includes(textoBusqueda)
    );

  function materiaCoincide(
    materia: Materia,
    periodo: Periodo
  ) {
    if (!datos) return false;

    const clave = crearClave(
      materia.periodo_id,
      materia.materia_id
    );

    const docenteSeleccionado =
      datos.docentes.find(
        (docente) =>
          docente.id === selecciones[clave]
      );

    const actual =
      asignacionesActuales.get(clave);

    return [
      materia.nombre,
      materia.codigo,
      periodo.nombre,
      `Período ${periodo.numero}`,
      docenteSeleccionado?.apellidos,
      docenteSeleccionado?.nombres,
      actual?.docente,
    ]
      .join(' ')
      .toLowerCase()
      .includes(textoBusqueda);
  }

  const totalResultados = datos
    ? datos.materias.filter((materia) => {
        const periodo = datos.periodos.find(
          (item) =>
            item.numero === materia.periodo_id
        );

        return (
          periodo &&
          materiaCoincide(materia, periodo)
        );
      }).length
    : 0;

  if (iniciando) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Asignaciones Docentes
        </h1>

        <p className="text-slate-500 text-sm mt-1">
          {puedeGestionar
            ? 'Seleccione los profesores responsables de cada materia y período.'
            : 'Consulte las asignaciones disponibles para su perfil.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
        >
          {error}
        </div>
      )}

      {mensaje && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm"
        >
          {mensaje}
        </div>
      )}

      {puedeGestionar && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <label
            htmlFor="ano-asignaciones"
            className="block text-xs font-bold text-slate-500 uppercase tracking-wider"
          >
            Año escolar
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              id="ano-asignaciones"
              value={anoSeleccionado}
              disabled={
                ocupado ||
                hayCambios ||
                requiereRecarga ||
                anosDisponibles.length === 0
              }
              onChange={(evento) =>
                setAnoSeleccionado(
                  evento.target.value
                )
              }
              className={`${claseCampo} sm:max-w-xs`}
            >
              <option value="">
                {anosDisponibles.length === 0
                  ? 'No hay años escolares registrados'
                  : 'Seleccione el año escolar'}
              </option>

              {anosDisponibles.map((ano) => (
                <option
                  key={ano}
                  value={ano}
                >
                  {ano}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={
                ocupado ||
                !anoSeleccionado ||
                (hayCambios && !requiereRecarga)
              }
              onClick={cargarAsignaciones}
              className="px-5 py-3 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all disabled:opacity-50"
            >
              {cargando
                ? 'Cargando...'
                : requiereRecarga
                  ? 'Recargar datos'
                  : 'Cargar asignaciones'}
            </button>

            {hayCambios && !requiereRecarga && (
              <button
                type="button"
                disabled={ocupado}
                onClick={descartarCambios}
                className="px-5 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Descartar cambios pendientes
              </button>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Los años provienen de los registros del
            sistema. Se selecciona inicialmente el año
            guardado en Configuración.
          </p>

          {hayCambios && !requiereRecarga && (
            <p className="text-sm text-amber-700">
              Hay {cambiosPendientes.length} cambio(s)
              sin guardar. Guarde cada período o
              descarte los cambios antes de cargar
              otro año.
            </p>
          )}

          {requiereRecarga && (
            <p className="text-sm text-amber-700">
              La edición está pausada hasta consultar
              nuevamente los datos. La recarga
              reemplazará las selecciones pendientes
              por lo que esté guardado en el servidor.
            </p>
          )}
        </div>
      )}

      {(!puedeGestionar || datos) && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="relative w-full sm:max-w-md">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
              placeholder="Buscar por materia, código o profesor..."
              className={`${claseCampo} pl-10`}
            />
          </div>
        </div>
      )}

      {!puedeGestionar ? (
        <div className="space-y-3">
          {lecturaFiltrada.map(
            (asignacion) => (
              <div
                key={asignacion.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {asignacion.codigo}
                  </div>

                  <div>
                    <p className="font-bold text-slate-900">
                      {asignacion.materia}
                    </p>

                    <p className="text-sm text-slate-500 mt-1">
                      Período{' '}
                      {asignacion.periodo_id}
                      {asignacion.ano_escolar
                        ? ` · ${asignacion.ano_escolar}`
                        : ''}
                    </p>

                    <p className="text-sm text-slate-500 mt-1">
                      {asignacion.docente}
                    </p>
                  </div>
                </div>
              </div>
            )
          )}

          {lecturaFiltrada.length === 0 && (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500">
              {asignacionesLectura.length === 0
                ? 'No hay asignaciones disponibles.'
                : 'No se encontraron coincidencias.'}
            </div>
          )}
        </div>
      ) : !datos ? (
        <div className="bg-white rounded-2xl p-10 border border-slate-200 text-center">
          <Link2
            size={40}
            className="text-slate-300 mx-auto mb-3"
          />

          <p className="text-slate-500">
            Seleccione el año escolar y pulse
            «Cargar asignaciones».
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                <BookOpen size={24} />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Materias por período
                </p>

                <p className="text-2xl font-extrabold text-slate-900">
                  {datos.materias.length}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                <Link2 size={24} />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Asignaciones vigentes
                </p>

                <p className="text-2xl font-extrabold text-slate-900">
                  {datos.asignaciones.length}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
                <UserCircle size={24} />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Profesores activos
                </p>

                <p className="text-2xl font-extrabold text-slate-900">
                  {datos.docentes.length}
                </p>
              </div>
            </div>
          </div>

          {datos.fuera_catalogo.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">
              Hay{' '}
              {datos.fuera_catalogo.length}{' '}
              asignación(es) activa(s) fuera del
              catálogo activo de períodos y materias.
              No se han eliminado ni modificado.
              Deben revisarse por separado.
            </div>
          )}

          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-700">
              Año escolar cargado: {anoCargado}
            </p>

            <p className="text-sm text-slate-500">
              Un profesor puede impartir varias
              materias. Seleccionar «Sin profesor
              asignado» retira la asignación vigente
              al guardar, sin borrar el historial.
            </p>
          </div>

          {textoBusqueda &&
            totalResultados === 0 && (
              <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500">
                No se encontraron materias con esa
                búsqueda.
              </div>
            )}

          {datos.periodos.length === 0 && (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500">
              No hay períodos activos disponibles.
            </div>
          )}

          {datos.periodos.map((periodo) => {
            const materiasPeriodo =
              datos.materias.filter(
                (materia) =>
                  materia.periodo_id ===
                  periodo.numero
              );

            const materiasVisibles =
              materiasPeriodo.filter(
                (materia) =>
                  materiaCoincide(
                    materia,
                    periodo
                  )
              );

            const pendientes =
              cambiosPendientes.filter(
                (materia) =>
                  materia.periodo_id ===
                  periodo.numero
              ).length;

            if (
              textoBusqueda &&
              materiasVisibles.length === 0 &&
              pendientes === 0
            ) {
              return null;
            }

            return (
              <section
                key={periodo.numero}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <GraduationCap
                        size={20}
                        className="text-blue-700"
                      />
                    </div>

                    <div>
                      <h2 className="font-bold text-slate-900">
                        {periodo.nombre}
                      </h2>

                      <p className="text-xs text-slate-500">
                        {materiasPeriodo.length}{' '}
                        materia(s)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {materiasVisibles.map(
                    (materia) => {
                      const clave = crearClave(
                        periodo.numero,
                        materia.materia_id
                      );

                      const actual =
                        asignacionesActuales.get(
                          clave
                        );

                      const seleccionado =
                        selecciones[clave] || '';

                      const profesorDisponible =
                        datos.docentes.some(
                          (docente) =>
                            docente.id ===
                            seleccionado
                        );

                      const modificado =
                        seleccionado !==
                        (actual?.docente_id || '');

                      const tipoMateria =
                        materia.es_obligatoria ===
                        true
                          ? 'Obligatoria'
                          : materia.es_obligatoria ===
                              false
                            ? 'No obligatoria'
                            : 'Sin clasificación';

                      return (
                        <div
                          key={materia.materia_id}
                          className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 flex items-center justify-center font-bold text-sm shrink-0">
                              {materia.codigo}
                            </div>

                            <div>
                              <label
                                htmlFor={`profesor-${clave}`}
                                className="font-bold text-slate-900"
                              >
                                {materia.nombre}
                              </label>

                              <p className="text-xs text-slate-500 mt-1">
                                {tipoMateria}
                              </p>

                              {modificado && (
                                <p className="text-xs text-amber-700 mt-1">
                                  Cambio pendiente
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="w-full md:max-w-sm">
                            <select
                              id={`profesor-${clave}`}
                              value={seleccionado}
                              disabled={
                                ocupado ||
                                requiereRecarga
                              }
                              onChange={(
                                evento
                              ) => {
                                const valor =
                                  evento.target
                                    .value;

                                setSelecciones(
                                  (
                                    anteriores
                                  ) => ({
                                    ...anteriores,
                                    [clave]:
                                      valor,
                                  })
                                );

                                setMensaje('');
                              }}
                              className={
                                claseCampo
                              }
                            >
                              <option value="">
                                Sin profesor
                                asignado
                              </option>

                              {seleccionado &&
                                !profesorDisponible && (
                                  <option
                                    value={
                                      seleccionado
                                    }
                                    disabled
                                  >
                                    {actual?.docente ||
                                      'Profesor no disponible'}{' '}
                                    — no
                                    disponible
                                  </option>
                                )}

                              {datos.docentes.map(
                                (docente) => (
                                  <option
                                    key={
                                      docente.id
                                    }
                                    value={
                                      docente.id
                                    }
                                  >
                                    {
                                      docente.apellidos
                                    }{' '}
                                    {
                                      docente.nombres
                                    }
                                    {docente.especialidad
                                      ? ` — ${docente.especialidad}`
                                      : ''}
                                  </option>
                                )
                              )}
                            </select>

                            {!seleccionado && (
                              <p className="text-xs text-slate-400 mt-2">
                                Seleccione un
                                profesor para
                                asignarlo a esta
                                materia.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}

                  {materiasPeriodo.length ===
                    0 && (
                    <p className="p-6 text-sm text-slate-500">
                      Este período no tiene
                      materias activas
                      configuradas.
                    </p>
                  )}

                  {materiasPeriodo.length >
                    0 &&
                    materiasVisibles.length ===
                      0 && (
                      <p className="p-6 text-sm text-slate-500">
                        La búsqueda oculta las
                        materias de este
                        período.
                      </p>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {pendientes} cambio(s)
                    pendiente(s) en todo el
                    período, incluidos los
                    ocultos por la búsqueda.
                  </p>

                  <button
                    type="button"
                    disabled={
                      ocupado ||
                      requiereRecarga ||
                      pendientes === 0
                    }
                    onClick={() =>
                      guardarPeriodo(
                        periodo.numero
                      )
                    }
                    className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save size={17} />

                    {guardandoPeriodo ===
                    periodo.numero
                      ? 'Guardando...'
                      : 'Guardar cambios del período'}
                  </button>
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}