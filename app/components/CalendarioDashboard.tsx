'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

type Evento = {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: 'evento' | 'recordatorio';
  fecha: string;
  hora: string | null;
};

type Formulario = {
  titulo: string;
  descripcion: string;
  tipo: 'evento' | 'recordatorio';
  fecha: string;
  hora: string;
};

function fechaLocal(fecha: Date) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function inicioFormulario(fecha: string): Formulario {
  return {
    titulo: '',
    descripcion: '',
    tipo: 'evento',
    fecha,
    hora: '',
  };
}

export default function CalendarioDashboard({
  esDirector,
}: {
  esDirector: boolean;
}) {
  const hoy = fechaLocal(new Date());
  const [mesVisible, setMesVisible] = useState(() => {
    const actual = new Date();
    return new Date(actual.getFullYear(), actual.getMonth(), 1);
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [formulario, setFormulario] = useState<Formulario>(
    inicioFormulario(hoy)
  );
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();

  const cargarEventos = useCallback(async () => {
    const desde = fechaLocal(new Date(anio, mes, 1));
    const hasta = fechaLocal(new Date(anio, mes + 1, 0));

    try {
      setCargando(true);
      setError('');

      const respuesta = await fetch(
        `/api/calendario?desde=${desde}&hasta=${hasta}`,
        { cache: 'no-store' }
      );

      const texto = await respuesta.text();

      const datos = texto
      ? JSON.parse(texto)
      : { error: 'El servidor devolvió una respuesta vacía.' };


      if (!respuesta.ok) {
        throw new Error(datos.error || 'No se pudo cargar el calendario.');
      }

      setEventos(datos.eventos ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al cargar eventos.'
      );
    } finally {
      setCargando(false);
    }
  }, [anio, mes]);

  useEffect(() => {
    void cargarEventos();

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void cargarEventos();
      }
    }, 60_000);

    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        void cargarEventos();
      }
    };

    document.addEventListener('visibilitychange', alVolver);

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargarEventos]);

  const diasDelMes = useMemo(() => {
    const primerDia = new Date(anio, mes, 1);
    const espaciosIniciales = (primerDia.getDay() + 6) % 7;
    const totalDias = new Date(anio, mes + 1, 0).getDate();

    return [
      ...Array.from({ length: espaciosIniciales }, () => null),
      ...Array.from({ length: totalDias }, (_, i) => i + 1),
    ];
  }, [anio, mes]);

  const eventosDelDia = eventos.filter(
    (evento) => evento.fecha === diaSeleccionado
  );

  const tituloMes = new Intl.DateTimeFormat('es-VE', {
    month: 'long',
    year: 'numeric',
  }).format(mesVisible);

  function cambiarMes(desplazamiento: number) {
    const siguiente = new Date(anio, mes + desplazamiento, 1);

    setMesVisible(siguiente);
    setDiaSeleccionado(fechaLocal(siguiente));
    setMostrarFormulario(false);
    setEditandoId(null);
  }

  function iniciarCreacion() {
    setFormulario(inicioFormulario(diaSeleccionado));
    setEditandoId(null);
    setMostrarFormulario(true);
    setError('');
  }

  function iniciarEdicion(evento: Evento) {
    setFormulario({
      titulo: evento.titulo,
      descripcion: evento.descripcion ?? '',
      tipo: evento.tipo,
      fecha: evento.fecha,
      hora: evento.hora ?? '',
    });
    setEditandoId(evento.id);
    setMostrarFormulario(true);
    setError('');
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!esDirector) return;

    try {
      setGuardando(true);
      setError('');

      const respuesta = await fetch(
        editandoId
          ? `/api/calendario/${editandoId}`
          : '/api/calendario',
        {
          method: editandoId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formulario),
        }
      );

      const texto = await respuesta.text();

      const datos = texto
      ? JSON.parse(texto)
      : { error: 'El servidor devolvió una respuesta vacía.' };

      if (!respuesta.ok) {
        throw new Error(datos.error || 'No se pudo guardar el evento.');
      }

      setMostrarFormulario(false);
      setEditandoId(null);

      const [nuevoAnio, nuevoMes] = formulario.fecha
        .split('-')
        .map(Number);

      setDiaSeleccionado(formulario.fecha);

      if (nuevoAnio !== anio || nuevoMes - 1 !== mes) {
        setMesVisible(new Date(nuevoAnio, nuevoMes - 1, 1));
      } else {
        await cargarEventos();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar.'
      );
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(evento: Evento) {
    if (!esDirector) return;
    if (!window.confirm(`¿Eliminar “${evento.titulo}”?`)) return;

    try {
      setError('');

      const respuesta = await fetch(`/api/calendario/${evento.id}`, {
        method: 'DELETE',
      });

      const texto = await respuesta.text();

      const datos = texto
      ? JSON.parse(texto)
      : { error: 'El servidor devolvió una respuesta vacía.' };

      if (!respuesta.ok) {
        throw new Error(datos.error || 'No se pudo eliminar.');
      }

      await cargarEventos();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar.'
      );
    }
  }

  return (
    <section className="w-full max-w-[340px] rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CalendarDays size={22} />
            Calendario de actividades
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Eventos y recordatorios de la institución.
          </p>
        </div>

        {esDirector && (
          <button
            type="button"
            onClick={iniciarCreacion}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700"
          >
            <Plus size={16} />
            Nuevo evento
          </button>
        )}
      </div>

      <div className="w-full">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold capitalize">{tituloMes}</h3>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cambiarMes(-1)}
              aria-label="Mes anterior"
              className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => cambiarMes(1)}
              aria-label="Mes siguiente"
              className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((nombre) => (
            <span key={nombre} className="py-2">
              {nombre}
            </span>
          ))}
        </div>
      

      <div className="grid grid-cols-7 gap-1">
        {diasDelMes.map((dia, indice) => {
          if (dia === null) {
            return <div key={`vacio-${indice}`} />;
          }

          const fecha = fechaLocal(new Date(anio, mes, dia));
          const cantidad = eventos.filter(
            (evento) => evento.fecha === fecha
          ).length;

          return (
            <button
              key={fecha}
              type="button"
              onClick={() => setDiaSeleccionado(fecha)}
              aria-label={`${fecha}: ${cantidad} evento(s)`}
              className={`h-10 rounded-lg border p-1 text-sm transition ${
                diaSeleccionado === fecha
                  ? 'border-blue-400 bg-blue-600'
                  : fecha === hoy
                    ? 'border-blue-400/60 bg-white/10'
                    : 'border-transparent hover:bg-white/10'
              }`}
            >
              <span>{dia}</span>
              {cantidad > 0 && (
                <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <h3 className="mb-3 text-sm font-semibold">
          Actividades del {diaSeleccionado}
        </h3>

        {cargando && (
          <p className="text-sm text-slate-300">Cargando eventos...</p>
        )}

        {!cargando && eventosDelDia.length === 0 && (
          <p className="text-sm text-slate-400">
            No hay actividades para este día.
          </p>
        )}

        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
          {eventosDelDia.map((evento) => (
            <div
              key={evento.id}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{evento.titulo}</p>
                  <p className="mt-1 text-xs text-slate-300">
                    {evento.tipo === 'recordatorio'
                      ? 'Recordatorio'
                      : 'Evento'}
                    {evento.hora ? ` · ${evento.hora}` : ' · Todo el día'}
                  </p>
                  {evento.descripcion && (
                    <p className="mt-2 text-xs text-slate-300">
                      {evento.descripcion}
                    </p>
                  )}
                </div>

                {esDirector && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => iniciarEdicion(evento)}
                      aria-label={`Editar ${evento.titulo}`}
                      className="rounded-lg p-2 hover:bg-white/10"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void eliminar(evento)}
                      aria-label={`Eliminar ${evento.titulo}`}
                      className="rounded-lg p-2 text-red-300 hover:bg-white/10"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {esDirector && mostrarFormulario && (
        <form
          onSubmit={guardar}
          className="mt-6 space-y-3 rounded-xl border border-white/10 bg-white/10 p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {editandoId ? 'Editar actividad' : 'Nueva actividad'}
            </h3>
            <button
              type="button"
              onClick={() => setMostrarFormulario(false)}
              aria-label="Cerrar formulario"
            >
              <X size={18} />
            </button>
          </div>

          <input
            required
            maxLength={150}
            value={formulario.titulo}
            onChange={(e) =>
              setFormulario({ ...formulario, titulo: e.target.value })
            }
            placeholder="Título"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />

          <textarea
            maxLength={2000}
            value={formulario.descripcion}
            onChange={(e) =>
              setFormulario({
                ...formulario,
                descripcion: e.target.value,
              })
            }
            placeholder="Descripción (opcional)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={formulario.tipo}
              onChange={(e) =>
                setFormulario({
                  ...formulario,
                  tipo: e.target.value as Formulario['tipo'],
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="evento">Evento</option>
              <option value="recordatorio">Recordatorio</option>
            </select>

            <input
              required
              type="date"
              value={formulario.fecha}
              onChange={(e) =>
                setFormulario({ ...formulario, fecha: e.target.value })
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />

            <input
              type="time"
              value={formulario.hora}
              onChange={(e) =>
                setFormulario({ ...formulario, hora: e.target.value })
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar actividad'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}