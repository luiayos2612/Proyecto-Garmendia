'use client';

import { useEffect, useState } from 'react';
import {
  FileDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BarChart3,
} from 'lucide-react';

interface Periodo {
  id: number;
  nombre: string;
  activo: boolean;
}

export default function EstadisticasPage() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [anos, setAnos] = useState<string[]>([]);

  const [periodo, setPeriodo] = useState('');
  const [ano, setAno] = useState('');

  const [iniciando, setIniciando] = useState(true);
  const [generando, setGenerando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      try {
        const [resPeriodos, resAnos] =
          await Promise.all([
            fetch('/api/periodos', {
              cache: 'no-store',
            }),
            fetch('/api/asignaciones/anos', {
              cache: 'no-store',
            }),
          ]);

        const [datosPeriodos, datosAnos] =
          await Promise.all([
            resPeriodos.json(),
            resAnos.json(),
          ]);

        if (!resPeriodos.ok) {
          throw new Error(
            datosPeriodos.error ||
              'No se pudieron cargar los períodos.'
          );
        }

        if (!resAnos.ok) {
          throw new Error(
            datosAnos.error ||
              'No se pudieron cargar los años escolares.'
          );
        }

        if (cancelado) return;

        const listaPeriodos: Periodo[] =
          datosPeriodos.periodos || [];

        const listaAnos: string[] =
          datosAnos.anos || [];

        setPeriodos(listaPeriodos);
        setAnos(listaAnos);

        setPeriodo(
          listaPeriodos[0]
            ? String(listaPeriodos[0].id)
            : ''
        );

        setAno(
          datosAnos.configurado ||
            listaAnos[0] ||
            ''
        );
      } catch (errorCarga) {
        if (!cancelado) {
          setError(
            errorCarga instanceof Error
              ? errorCarga.message
              : 'No se pudo iniciar la pantalla.'
          );
        }
      } finally {
        if (!cancelado) {
          setIniciando(false);
        }
      }
    }

    cargar();

    return () => {
      cancelado = true;
    };
  }, []);

  async function generarExcel() {
    if (!periodo || !ano || generando) return;

    setGenerando(true);
    setError('');
    setMensaje('');

    try {
      const respuesta = await fetch(
        '/api/estadisticas',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            periodo_id: Number(periodo),
            ano_escolar: ano,
          }),
        }
      );

      if (!respuesta.ok) {
        let detalle =
          `No se pudo generar el reporte (${respuesta.status}).`;

        try {
          const datos = await respuesta.json();
          detalle = datos.error || detalle;
        } catch {
          // Conserva el estado HTTP si no hay JSON.
        }

        throw new Error(detalle);
      }

      const archivo = await respuesta.blob();
      const url = URL.createObjectURL(archivo);

      const disposicion =
        respuesta.headers.get('Content-Disposition');

      const nombreServidor =
        disposicion?.match(/filename="([^"]+)"/)?.[1];

      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download =
        nombreServidor ||
        `ResumenAcademico_Periodo_${periodo}_${ano}.xlsx`;

      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setMensaje(
        'Resumen académico generado y descargado.'
      );
    } catch (errorExportacion) {
      setError(
        errorExportacion instanceof Error
          ? errorExportacion.message
          : 'No se pudo generar el reporte.'
      );
    } finally {
      setGenerando(false);
    }
  }

  const ocupado = iniciando || generando;

  const claseCampo =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none disabled:opacity-50';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-emerald-600" />
          Estadísticas Académicas
        </h1>

        <p className="text-slate-500 text-sm mt-1">
          Resumen del rendimiento estudiantil por
          período y año escolar.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
        <div className="max-w-2xl space-y-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Generar Resumen Académico
          </h2>

          <div>
            <label
              htmlFor="periodo-resumen"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Período académico
            </label>

            <select
              id="periodo-resumen"
              value={periodo}
              disabled={ocupado}
              onChange={(evento) => {
                setPeriodo(evento.target.value);
                setMensaje('');
              }}
              className={claseCampo}
            >
              <option value="">
                {iniciando
                  ? 'Cargando períodos...'
                  : 'Seleccione un período'}
              </option>

              {periodos.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ano-resumen"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Año escolar
            </label>

            <select
              id="ano-resumen"
              value={ano}
              disabled={ocupado}
              onChange={(evento) => {
                setAno(evento.target.value);
                setMensaje('');
              }}
              className={claseCampo}
            >
              <option value="">
                {iniciando
                  ? 'Cargando años...'
                  : 'Seleccione un año escolar'}
              </option>

              {anos.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div
              role="alert"
              className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm"
            >
              <AlertCircle
                size={20}
                className="shrink-0"
              />
              <p>{error}</p>
            </div>
          )}

          {mensaje && (
            <div
              role="status"
              className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 text-sm"
            >
              <CheckCircle2
                size={20}
                className="shrink-0"
              />
              <p>{mensaje}</p>
            </div>
          )}

          <button
            type="button"
            onClick={generarExcel}
            disabled={
              ocupado ||
              !periodo ||
              !ano
            }
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors"
          >
            {generando ? (
              <Loader2
                size={18}
                className="animate-spin"
              />
            ) : (
              <FileDown size={18} />
            )}

            {generando
              ? 'Generando reporte...'
              : 'Generar Excel'}
          </button>
        </div>
      </div>

      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
        <h3 className="font-semibold text-slate-900 mb-3">
          Criterios del reporte
        </h3>

        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
          <li>
            Utiliza el intento más reciente de cada
            estudiante en el período y año seleccionado.
          </li>
          <li>
            Las materias numéricas se aprueban desde 3.
          </li>
          <li>
            Participación se imprime como AP o IN.
          </li>
          <li>
            Idiomas y Oficio utilizan el resultado
            cualitativo registrado.
          </li>
          <li>
            Las notas pendientes se dejan vacías y
            se informan en Observaciones.
          </li>
          <li>
            Las tutorías se detallan en una hoja
            adicional cuando existen.
          </li>
          <li>
            El formato principal admite 30 estudiantes.
            Si se supera, la exportación se detiene
            para no omitir personas.
          </li>
        </ul>
      </div>
    </div>
  );
}