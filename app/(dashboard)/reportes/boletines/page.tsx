'use client';

import {
  useEffect,
  useState,
} from 'react';
import Link from 'next/link';
import {
  Search,
  FileDown,
  GraduationCap,
  BookOpen,
  History,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface Intento {
  id: string;
  periodo_id: number;
  numero_intento: number;
  ano_escolar: string;
  estado: string;
}

interface Estudiante {
  id: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  intentos: Intento[];
}

type TipoDocumento = 'boletin' | 'certificadas';

export default function BoletinesPage() {
  const [periodo, setPeriodo] = useState('1');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] =
    useState('');

  const [estudiantes, setEstudiantes] = useState<
    Estudiante[]
  >([]);

  const [selecciones, setSelecciones] = useState<
    Record<string, string>
  >({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [exportando, setExportando] = useState<
    string | null
  >(null);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setBusquedaAplicada(busqueda.trim());
    }, 300);

    return () => clearTimeout(temporizador);
  }, [busqueda]);

  useEffect(() => {
    const controlador = new AbortController();

    async function cargar() {
      setLoading(true);
      setError('');

      try {
        const parametros = new URLSearchParams({
          periodo_id: periodo,
          search: busquedaAplicada,
        });

        const respuesta = await fetch(
          `/api/boletines/documentos?${parametros}`,
          {
            cache: 'no-store',
            signal: controlador.signal,
          }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
          throw new Error(
            datos.error ||
              'No se pudieron cargar los estudiantes.'
          );
        }

        const listado: Estudiante[] =
          datos.estudiantes || [];

        const iniciales: Record<string, string> = {};

        for (const estudiante of listado) {
          iniciales[estudiante.id] =
            estudiante.intentos?.[0]?.id || '';
        }

        setEstudiantes(listado);
        setSelecciones(iniciales);
      } catch (errorCarga) {
        if (controlador.signal.aborted) return;

        setEstudiantes([]);

        setError(
          errorCarga instanceof Error
            ? errorCarga.message
            : 'Error al cargar estudiantes.'
        );
      } finally {
        if (!controlador.signal.aborted) {
          setLoading(false);
        }
      }
    }

    cargar();

    return () => controlador.abort();
  }, [periodo, busquedaAplicada]);

  async function exportar(
    estudiante: Estudiante,
    tipo: TipoDocumento
  ) {
    if (exportando) return;

    const intentoId = selecciones[estudiante.id];

    if (tipo === 'boletin' && !intentoId) {
      setError(
        'Seleccione el intento académico que desea imprimir.'
      );
      return;
    }

    const clave = `${estudiante.id}:${tipo}`;

    setExportando(clave);
    setError('');

    try {
      const respuesta = await fetch(
        '/api/boletines/documentos',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            estudiante_id: estudiante.id,
            tipo,
            ...(tipo === 'boletin'
              ? { intento_id: intentoId }
              : {}),
          }),
        }
      );

      if (!respuesta.ok) {
        let mensaje =
          `No se pudo generar el archivo (${respuesta.status}).`;

        try {
          const datos = await respuesta.json();
          mensaje = datos.error || mensaje;
        } catch {
          // Conserva el mensaje HTTP si la respuesta no es JSON.
        }

        throw new Error(mensaje);
      }

      const contenido = await respuesta.blob();
      const url = URL.createObjectURL(contenido);

      const nombreSeguro = [
        tipo === 'boletin'
          ? 'Boletin'
          : 'Notas_Certificadas',
        estudiante.apellidos,
        estudiante.nombres,
      ]
        .join('_')
        .replace(/[\\/:*?"<>|]/g, '_');

      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `${nombreSeguro}.xlsx`;

      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (errorExportacion) {
      setError(
        errorExportacion instanceof Error
          ? errorExportacion.message
          : 'No se pudo generar el documento.'
      );
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-blue-600" />
            Boletines de Calificaciones
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Boletín del intento seleccionado y notas
            certificadas de los períodos registrados.
          </p>
        </div>

        <Link
          href="/reportes/boletines/historico"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <History size={16} />
          Cargar Notas Antiguas
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
        >
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />

          <input
            type="text"
            placeholder="Buscar por nombre, apellido o cédula..."
            value={busqueda}
            onChange={(evento) =>
              setBusqueda(evento.target.value)
            }
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>

        <select
          value={periodo}
          disabled={exportando !== null}
          onChange={(evento) =>
            setPeriodo(evento.target.value)
          }
          aria-label="Período académico"
          className="sm:w-56 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
        >
          {[1, 2, 3, 4, 5, 6].map((numero) => (
            <option key={numero} value={numero}>
              Período {numero}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-blue-50 border border-blue-100 text-blue-800 rounded-xl p-4 text-sm space-y-1">
        <p>
          El período filtra estudiantes que tienen
          intentos registrados en ese nivel, aunque
          actualmente estén cursando otro.
        </p>
        <p>
          «Generar boletín» utiliza el intento escogido.
          «Notas certificadas» consulta todos los
          períodos del estudiante, sin limitarse a ese
          intento o año escolar.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : estudiantes.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            No se encontraron estudiantes con intentos
            en este período.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            Mostrando {estudiantes.length} estudiante(s).
            {estudiantes.length === 100
              ? ' Se alcanzó el límite de 100 resultados; use el buscador para localizar al estudiante.'
              : ''}
          </p>

          <div className="space-y-4">
            {estudiantes.map((estudiante) => {
              const intento = estudiante.intentos.find(
                (item) =>
                  item.id === selecciones[estudiante.id]
              );

              const generandoBoletin =
                exportando ===
                `${estudiante.id}:boletin`;

              const generandoCertificadas =
                exportando ===
                `${estudiante.id}:certificadas`;

              return (
                <div
                  key={estudiante.id}
                  className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm"
                >
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <GraduationCap className="w-5 h-5 text-blue-600" />
                      </div>

                      <div>
                        <h2 className="font-bold text-slate-900">
                          {estudiante.apellidos}{' '}
                          {estudiante.nombres}
                        </h2>

                        <p className="text-xs text-slate-500 mt-1">
                          CI: {estudiante.cedula}
                        </p>

                        {intento && (
                          <p className="text-xs text-blue-700 mt-1">
                            Período {intento.periodo_id}
                            {' · '}
                            {intento.ano_escolar}
                            {' · '}
                            {intento.estado}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        disabled={
                          exportando !== null ||
                          !intento
                        }
                        onClick={() =>
                          exportar(
                            estudiante,
                            'boletin'
                          )
                        }
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
                      >
                        {generandoBoletin ? (
                          <Loader2
                            size={16}
                            className="animate-spin"
                          />
                        ) : (
                          <FileDown size={16} />
                        )}

                        {generandoBoletin
                          ? 'Generando...'
                          : 'Generar boletín'}
                      </button>

                      <button
                        type="button"
                        disabled={exportando !== null}
                        onClick={() =>
                          exportar(
                            estudiante,
                            'certificadas'
                          )
                        }
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
                      >
                        {generandoCertificadas ? (
                          <Loader2
                            size={16}
                            className="animate-spin"
                          />
                        ) : (
                          <FileDown size={16} />
                        )}

                        {generandoCertificadas
                          ? 'Generando...'
                          : 'Notas certificadas'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <label
                      htmlFor={`intento-${estudiante.id}`}
                      className="block text-xs font-semibold text-slate-500 mb-2"
                    >
                      Intento que se imprimirá en el
                      boletín
                    </label>

                    <select
                      id={`intento-${estudiante.id}`}
                      value={
                        selecciones[estudiante.id] || ''
                      }
                      disabled={exportando !== null}
                      onChange={(evento) => {
                        const valor = evento.target.value;

                        setSelecciones((anteriores) => ({
                          ...anteriores,
                          [estudiante.id]: valor,
                        }));
                      }}
                      className="w-full sm:max-w-lg px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    >
                      {estudiante.intentos.map(
                        (item) => (
                          <option
                            key={item.id}
                            value={item.id}
                          >
                            Período {item.periodo_id}
                            {' — '}
                            Intento {item.numero_intento}
                            {' — '}
                            {item.ano_escolar}
                            {' — '}
                            {item.estado}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}