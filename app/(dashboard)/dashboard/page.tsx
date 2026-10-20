'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import CalendarioDashboard from '../../components/CalendarioDashboard';
import { useUser } from '../../components/UserContext';

import {
  Users,
  GraduationCap,
  CheckCircle2,
  Calendar,
  AlertCircle,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';

interface DashboardData {
  totalEstudiantes: number;
  totalDocentes: number;
  promedioGeneral: number | null;
  totalNotas: number;
  totalAsignaciones: number;
  alcance: 'docente' | 'administracion';
  actualizadoEn: string;
}

type EstadoDashboard =
  | 'comprobando'
  | 'activo'
  | 'error';

class ErrorConsulta extends Error {
  constructor(
    message: string,
    public reintentable: boolean
  ) {
    super(message);
  }
}

function validarDatos(
  contenido: unknown
): DashboardData {
  if (
    typeof contenido !== 'object' ||
    contenido === null
  ) {
    throw new ErrorConsulta(
      'El servidor devolvió una respuesta inesperada.',
      false
    );
  }

  const datos = contenido as Record<string, unknown>;

  const contadores = [
    datos.totalEstudiantes,
    datos.totalDocentes,
    datos.totalAsignaciones,
    datos.totalNotas,
  ];

  const contadoresValidos = contadores.every(
    (valor) =>
      typeof valor === 'number' &&
      Number.isFinite(valor) &&
      valor >= 0
  );

  if (!contadoresValidos) {
    throw new ErrorConsulta(
      'El formato de los indicadores no es válido.',
      false
    );
  }

  const promedioValido =
    datos.promedioGeneral === null ||
    (
      typeof datos.promedioGeneral === 'number' &&
      Number.isFinite(datos.promedioGeneral) &&
      datos.promedioGeneral >= 1 &&
      datos.promedioGeneral <= 5
    );

  if (!promedioValido) {
    throw new ErrorConsulta(
      'El promedio recibido no corresponde a la escala de 1 a 5.',
      false
    );
  }

  if (
    datos.alcance !== 'docente' &&
    datos.alcance !== 'administracion'
  ) {
    throw new ErrorConsulta(
      'No se pudo identificar el alcance de los indicadores.',
      false
    );
  }

  if (typeof datos.actualizadoEn !== 'string') {
    throw new ErrorConsulta(
      'La respuesta no incluye la fecha de actualización.',
      false
    );
  }

  return datos as unknown as DashboardData;
}

export default function DashboardPage() {
  const { nombre, rol } = useUser();

  const [data, setData] =
    useState<DashboardData | null>(null);

  const [estado, setEstado] =
    useState<EstadoDashboard>('comprobando');

  const [error, setError] = useState('');

  const [ultimaComprobacion, setUltimaComprobacion] =
    useState<Date | null>(null);

  useEffect(() => {
    let cancelado = false;
    let consultando = false;

    let controladorActual: AbortController | null = null;

    let temporizadorPeticion:
      ReturnType<typeof setTimeout> | undefined;

    let temporizadorReintento:
      ReturnType<typeof setTimeout> | undefined;

    let resolverEspera: (() => void) | null = null;

    function esperarReintento() {
      return new Promise<void>((resolve) => {
        resolverEspera = resolve;

        temporizadorReintento = setTimeout(() => {
          temporizadorReintento = undefined;
          resolverEspera = null;
          resolve();
        }, 1500);
      });
    }

    async function realizarConsulta() {
      const controlador = new AbortController();

      controladorActual = controlador;

      temporizadorPeticion = setTimeout(() => {
        controlador.abort();
      }, 20000);

      try {
        const respuesta = await fetch(
          '/api/dashboard',
          {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controlador.signal,
          }
        );

        let contenido: unknown;

        try {
          contenido = await respuesta.json();
        } catch {
          throw new ErrorConsulta(
            'El servidor no devolvió una respuesta válida.',
            respuesta.status >= 500
          );
        }

        if (!respuesta.ok) {
          const detalle = contenido as {
            error?: string;
          };

          throw new ErrorConsulta(
            detalle?.error ||
              'No se pudieron consultar los indicadores.',
            respuesta.status >= 500
          );
        }

        return validarDatos(contenido);
      } catch (errorConsulta) {
        if (cancelado) {
          throw errorConsulta;
        }

        if (errorConsulta instanceof ErrorConsulta) {
          throw errorConsulta;
        }

        if (controlador.signal.aborted) {
          throw new ErrorConsulta(
            'La consulta de indicadores superó el tiempo de espera.',
            true
          );
        }

        throw new ErrorConsulta(
          'No fue posible comunicarse con el servidor.',
          true
        );
      } finally {
        if (temporizadorPeticion !== undefined) {
          clearTimeout(temporizadorPeticion);
          temporizadorPeticion = undefined;
        }

        if (controladorActual === controlador) {
          controladorActual = null;
        }
      }
    }

    async function cargarIndicadores() {
      if (cancelado || consultando) return;

      consultando = true;

      try {
        for (let intento = 0; intento < 2; intento++) {
          try {
            const nuevosDatos = await realizarConsulta();

            if (cancelado) return;

            setData(nuevosDatos);
            setEstado('activo');
            setError('');
            setUltimaComprobacion(new Date());

            return;
          } catch (errorConsulta) {
            if (cancelado) return;

            const puedeReintentar =
              intento === 0 &&
              errorConsulta instanceof ErrorConsulta &&
              errorConsulta.reintentable;

            if (puedeReintentar) {
              await esperarReintento();

              if (cancelado) return;

              continue;
            }

            setEstado('error');

            setError(
              errorConsulta instanceof Error
                ? errorConsulta.message
                : 'No se pudieron cargar los indicadores.'
            );

            return;
          }
        }
      } finally {
        consultando = false;
      }
    }

    void cargarIndicadores();

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void cargarIndicadores();
      }
    }, 60000);

    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        void cargarIndicadores();
      }
    };

    const alRecuperarInternet = () => {
      void cargarIndicadores();
    };

    document.addEventListener(
      'visibilitychange',
      alVolver
    );

    window.addEventListener(
      'online',
      alRecuperarInternet
    );

    return () => {
      cancelado = true;

      window.clearInterval(intervalo);

      document.removeEventListener(
        'visibilitychange',
        alVolver
      );

      window.removeEventListener(
        'online',
        alRecuperarInternet
      );

      controladorActual?.abort();

      if (temporizadorPeticion !== undefined) {
        clearTimeout(temporizadorPeticion);
      }

      if (temporizadorReintento !== undefined) {
        clearTimeout(temporizadorReintento);
      }

      resolverEspera?.();
      resolverEspera = null;
    };
  }, []);

  const esDocente =
    data?.alcance === 'docente' ||
    rol === 'docente';

  const tituloRol =
    rol === 'director'
      ? 'Director'
      : rol === 'secretaria'
        ? ''
        : 'Profesor';

  const promedio =
    data?.promedioGeneral === null ||
    data?.promedioGeneral === undefined
      ? '—'
      : `${data.promedioGeneral.toFixed(2)} / 5`;

  const sinDatos =
    estado === 'comprobando' ? '…' : '—';

  const tarjetas = [
    {
      titulo: esDocente
        ? 'Mis estudiantes'
        : 'Estudiantes activos',
      valor:
        data?.totalEstudiantes ?? sinDatos,
      Icono: Users,
      fondo: 'bg-blue-50',
      texto: 'text-blue-600',
      enlace: '/estudiantes',
    },
    {
      titulo: esDocente
        ? 'Asignaciones vigentes'
        : 'Docentes activos',
      valor: esDocente
        ? data?.totalAsignaciones ?? sinDatos
        : data?.totalDocentes ?? sinDatos,
      Icono: esDocente
        ? ClipboardList
        : GraduationCap,
      fondo: 'bg-violet-50',
      texto: 'text-violet-600',
      enlace: esDocente
        ? '/asignaciones'
        : '/docentes',
    },
    {
      titulo: esDocente
        ? 'Promedio de mis notas'
        : 'Promedio en curso',
      valor: promedio,
      Icono: CheckCircle2,
      fondo: 'bg-amber-50',
      texto: 'text-amber-600',
      enlace: '/calificaciones',
    },
  ];

  const estiloEstado =
    estado === 'activo'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : estado === 'error'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';

  const textoEstado =
    estado === 'activo'
      ? 'Activo'
      : estado === 'error'
        ? 'Sin verificar'
        : 'Cargando';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            ¡Hola, {tituloRol ? `${tituloRol} ` : ''}
            {nombre}!
          </h1>

          <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
            <Calendar size={14} />

            {new Date().toLocaleDateString('es-VE', {
              timeZone: 'America/Caracas',
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        <span
          role="status"
          title="Estado de la última consulta de indicadores. Se actualiza automáticamente."
          className={`inline-flex self-start sm:self-auto items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${estiloEstado}`}
        >
          <span
            aria-hidden="true"
            className="relative flex h-2.5 w-2.5"
          >
            {estado === 'activo' && (
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
            )}

            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                estado === 'activo'
                  ? 'bg-emerald-800'
                  : estado === 'error'
                    ? 'bg-amber-600'
                    : 'bg-slate-400'
              }`}
            />
          </span>

          {textoEstado}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertCircle
            size={18}
            className="shrink-0 mt-0.5"
          />

          <div>
            <p>{error}</p>

            <p className="mt-1 text-xs">
              El sistema volverá a comprobarlo
              automáticamente.
              {data
                ? ' Se conservan los últimos indicadores recibidos.'
                : ''}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tarjetas.map((tarjeta) => {
          const Icono = tarjeta.Icono;

          return (
            <Link
              key={tarjeta.titulo}
              href={tarjeta.enlace}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`p-2.5 rounded-xl ${tarjeta.fondo}`}
                >
                  <Icono
                    size={20}
                    className={tarjeta.texto}
                  />
                </div>

                <ArrowRight
                  size={16}
                  className="text-slate-300 group-hover:text-slate-500 transition-colors"
                />
              </div>

              <p className="text-[10px] font-bold text-slate-400 uppercase">
                {tarjeta.titulo}
              </p>

              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                {tarjeta.valor}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Calendario y resumen: siempre en la misma fila. */}
      <div className="flex flex-row flex-nowrap items-start gap-2 overflow-x-auto pb-2">
        <div className="w-[340px] shrink-0">
          <CalendarioDashboard
            esDirector={rol === 'director'}
          />
        </div>

        <div className="w-[320px] shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">
            Resumen rápido
          </h2>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {esDocente
                  ? 'Mis estudiantes'
                  : 'Estudiantes'}
              </p>

              <p className="text-xs text-slate-400">
                {esDocente
                  ? 'De asignaciones vigentes'
                  : 'Activos en el sistema'}
              </p>
            </div>

            <p className="text-xl font-extrabold text-blue-600">
              {data?.totalEstudiantes ?? sinDatos}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                Asignaciones
              </p>

              <p className="text-xs text-slate-400">
                Vigentes en los años registrados
              </p>
            </div>

            <p className="text-xl font-extrabold text-violet-600">
              {data?.totalAsignaciones ?? sinDatos}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                Notas del promedio
              </p>

              <p className="text-xs text-slate-400">
                Numéricas regulares en curso
              </p>
            </div>

            <p className="text-xl font-extrabold text-amber-600">
              {data?.totalNotas ?? sinDatos}
            </p>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs text-slate-500">
              El promedio excluye AP/IN, tutorías e
              intentos cerrados.
            </p>

            <p className="text-xs text-slate-400">
              Actualizado:{' '}
              {ultimaComprobacion
                ? ultimaComprobacion.toLocaleTimeString(
                    'es-VE',
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  )
                : 'Cargando indicadores…'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}