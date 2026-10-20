'use client';

import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  GraduationCap,
  Plus,
  Search,
  Mail,
  Phone,
  Filter,
  Pencil,
  UserMinus,
  X,
  Save,
} from 'lucide-react';

interface Docente {
  id: string;
  cedula: string;
  apellidos: string;
  nombres: string;
  especialidad: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  usuario_id?: string | null;
}

interface Formulario {
  cedula: string;
  apellidos: string;
  nombres: string;
  especialidad: string;
  telefono: string;
  email: string;
}

interface RespuestaOperacion {
  success: boolean;
  message: string;
  asignaciones_inactivadas?: number;
  usuario_desactivado?: boolean;
}

const claseCampo =
  'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-60';

const claseEtiqueta =
  'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2';

const campos: Array<{
  nombre: keyof Formulario;
  etiqueta: string;
  tipo: string;
  maximo: number;
  obligatorio: boolean;
}> = [
  {
    nombre: 'cedula',
    etiqueta: 'Cédula',
    tipo: 'text',
    maximo: 20,
    obligatorio: true,
  },
  {
    nombre: 'nombres',
    etiqueta: 'Nombres',
    tipo: 'text',
    maximo: 100,
    obligatorio: true,
  },
  {
    nombre: 'apellidos',
    etiqueta: 'Apellidos',
    tipo: 'text',
    maximo: 100,
    obligatorio: true,
  },
  {
    nombre: 'especialidad',
    etiqueta: 'Especialidad',
    tipo: 'text',
    maximo: 100,
    obligatorio: false,
  },
  {
    nombre: 'telefono',
    etiqueta: 'Teléfono',
    tipo: 'tel',
    maximo: 30,
    obligatorio: false,
  },
  {
    nombre: 'email',
    etiqueta: 'Correo de contacto',
    tipo: 'email',
    maximo: 100,
    obligatorio: false,
  },
];

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
      'El servidor no devolvió una respuesta válida. Revise la terminal y la ruta de la API.'
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
        'No se pudo completar la solicitud.'
    );
  }

  return datos as T;
}

function mensajeError(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación.';
}

export default function DocentesPage() {
  const router = useRouter();

  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [editando, setEditando] = useState<Docente | null>(
    null
  );

  const [retirando, setRetirando] = useState<Docente | null>(
    null
  );

  const [formulario, setFormulario] =
    useState<Formulario>({
      cedula: '',
      nombres: '',
      apellidos: '',
      especialidad: '',
      telefono: '',
      email: '',
    });

  const [ocupado, setOcupado] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      try {
        const resultado = await solicitar<{
          docentes: Docente[];
        }>('/api/docentes');

        if (!cancelado) {
          setDocentes(resultado.docentes || []);
        }
      } catch (errorCarga) {
        if (!cancelado) {
          setError(mensajeError(errorCarga));
        }
      } finally {
        if (!cancelado) {
          setLoading(false);
        }
      }
    }

    iniciar();

    return () => {
      cancelado = true;
    };
  }, []);

  const modalAbierto = Boolean(editando || retirando);

  useEffect(() => {
    if (!modalAbierto) return;

    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = anterior;
    };
  }, [modalAbierto]);

  async function actualizarListado() {
    const resultado = await solicitar<{
      docentes: Docente[];
    }>('/api/docentes');

    setDocentes(resultado.docentes || []);
  }

  function abrirEdicion(docente: Docente) {
    setErrorModal('');
    setMensaje('');

    setFormulario({
      cedula: docente.cedula || '',
      nombres: docente.nombres || '',
      apellidos: docente.apellidos || '',
      especialidad: docente.especialidad || '',
      telefono: docente.telefono || '',
      email: docente.email || '',
    });

    setEditando(docente);
  }

  function abrirRetiro(docente: Docente) {
    setErrorModal('');
    setMensaje('');
    setRetirando(docente);
  }

  function cerrarModal() {
    if (ocupado) return;

    setEditando(null);
    setRetirando(null);
    setErrorModal('');
  }

  async function guardarEdicion(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (!editando || ocupado) return;

    setOcupado(true);
    setErrorModal('');
    setError('');

    let guardado = false;

    try {
      const resultado =
        await solicitar<RespuestaOperacion>(
          `/api/docentes/${editando.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formulario),
          }
        );

      guardado = true;

      setEditando(null);
      setMensaje(resultado.message);

      await actualizarListado();
    } catch (errorGuardado) {
      const detalle = mensajeError(errorGuardado);

      if (guardado) {
        setError(
          `Los datos se guardaron, pero no se pudo actualizar el listado. Recargue la página. ${detalle}`
        );
      } else {
        setErrorModal(detalle);
      }
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarRetiro() {
    if (!retirando || ocupado) return;

    setOcupado(true);
    setErrorModal('');
    setError('');

    let guardado = false;

    try {
      const resultado =
        await solicitar<RespuestaOperacion>(
          `/api/docentes/${retirando.id}`,
          {
            method: 'DELETE',
          }
        );

      guardado = true;

      setRetirando(null);

      setMensaje(
        `${resultado.message} Asignaciones retiradas: ${
          resultado.asignaciones_inactivadas ?? 0
        }.${
          resultado.usuario_desactivado
            ? ' La cuenta vinculada fue desactivada para nuevos inicios de sesión.'
            : ''
        }`
      );

      await actualizarListado();
    } catch (errorRetiro) {
      const detalle = mensajeError(errorRetiro);

      if (guardado) {
        setError(
          `El retiro se guardó, pero no se pudo actualizar el listado. Recargue la página. ${detalle}`
        );
      } else {
        setErrorModal(detalle);
      }
    } finally {
      setOcupado(false);
    }
  }

  const texto = busqueda.trim().toLowerCase();

  const docentesFiltrados = docentes.filter(
    (docente) =>
      [
        docente.nombres,
        docente.apellidos,
        docente.cedula,
        docente.especialidad,
        docente.email,
      ]
        .join(' ')
        .toLowerCase()
        .includes(texto)
  );

  const especialidades = new Set(
    docentes
      .map((docente) => docente.especialidad?.trim())
      .filter(Boolean)
  ).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Gestión de Docentes
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Personal docente y administrativo
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/docentes/nuevo')}
          className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Nuevo Docente</span>
        </button>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <GraduationCap size={24} />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Docentes activos
            </p>
            <p className="text-2xl font-extrabold text-slate-900">
              {docentes.length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Mail size={24} />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Con Email
            </p>
            <p className="text-2xl font-extrabold text-slate-900">
              {docentes.filter((docente) => docente.email).length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-violet-50 rounded-xl text-violet-600">
            <Filter size={24} />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Especialidades
            </p>
            <p className="text-2xl font-extrabold text-slate-900">
              {especialidades}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />

          <input
            type="text"
            placeholder="Buscar por nombre, cédula o especialidad..."
            value={busqueda}
            onChange={(evento) =>
              setBusqueda(evento.target.value)
            }
            className={`${claseCampo} pl-10`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {docentesFiltrados.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
            <GraduationCap
              size={48}
              className="text-slate-300 mx-auto mb-4"
            />
            <p className="text-slate-500 font-medium">
              No se encontraron docentes
            </p>
          </div>
        ) : (
          docentesFiltrados.map((docente) => (
            <div
              key={docente.id}
              className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0">
                  {docente.nombres?.[0]}
                  {docente.apellidos?.[0]}
                </div>

                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                  Activo
                </span>
              </div>

              <div className="mb-4">
                <h2 className="font-bold text-slate-900 text-lg mb-1">
                  {docente.apellidos} {docente.nombres}
                </h2>

                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100">
                  {docente.especialidad || 'Sin especialidad'}
                </span>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone
                    size={14}
                    className="text-slate-400 shrink-0"
                  />
                  <span>
                    {docente.telefono || 'No disponible'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Mail
                    size={14}
                    className="text-slate-400 shrink-0"
                  />
                  <span className="truncate">
                    {docente.email || 'No disponible'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  {docente.cedula}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => abrirEdicion(docente)}
                  className="px-3 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-semibold text-sm hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                >
                  <Pencil size={16} />
                  Editar
                </button>

                <button
                  type="button"
                  onClick={() => abrirRetiro(docente)}
                  className="px-3 py-2.5 rounded-xl bg-red-50 text-red-700 font-semibold text-sm hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                >
                  <UserMinus size={16} />
                  Retirar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-editar-docente"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2
                  id="titulo-editar-docente"
                  className="text-lg font-bold text-slate-900"
                >
                  Editar docente
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Actualice los datos de contacto y del perfil.
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarModal}
                disabled={ocupado}
                aria-label="Cerrar edición"
                className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={guardarEdicion}
              className="p-6 space-y-5"
            >
              {errorModal && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm"
                >
                  {errorModal}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {campos.map((campo) => (
                  <div key={campo.nombre}>
                    <label
                      htmlFor={`docente-${campo.nombre}`}
                      className={claseEtiqueta}
                    >
                      {campo.etiqueta}
                      {campo.obligatorio ? ' *' : ''}
                    </label>

                    <input
                      id={`docente-${campo.nombre}`}
                      type={campo.tipo}
                      value={formulario[campo.nombre]}
                      maxLength={campo.maximo}
                      required={campo.obligatorio}
                      disabled={ocupado}
                      autoFocus={campo.nombre === 'cedula'}
                      onChange={(evento) => {
                        const valor = evento.target.value;

                        setFormulario((anterior) => ({
                          ...anterior,
                          [campo.nombre]: valor,
                        }));
                      }}
                      className={claseCampo}
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-500">
                El correo de contacto no cambia el correo
                de inicio de sesión ni la contraseña.
              </p>

              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={cerrarModal}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={ocupado}
                  className="px-5 py-3 rounded-xl bg-blue-900 text-white font-semibold text-sm hover:bg-blue-950 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save size={17} />
                  {ocupado ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {retirando && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-retirar-docente"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-4">
              <h2
                id="titulo-retirar-docente"
                className="text-lg font-bold text-slate-900"
              >
                Retirar del plantel
              </h2>

              <button
                type="button"
                onClick={cerrarModal}
                disabled={ocupado}
                aria-label="Cerrar confirmación"
                className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {errorModal && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm"
                >
                  {errorModal}
                </div>
              )}

              <p className="text-slate-700">
                ¿Desea retirar a{' '}
                <span className="font-semibold">
                  {retirando.apellidos} {retirando.nombres}
                </span>
                ?
              </p>

              <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                <li>
                  Dejará de aparecer entre los profesores activos.
                </li>
                <li>
                  Se retirarán sus asignaciones vigentes de todos
                  los años escolares.
                </li>
                <li>
                  Las materias quedarán disponibles para otro profesor.
                </li>
                <li>
                  Sus notas y evaluaciones no se borrarán.
                </li>
                <li>
                  Si tiene una cuenta docente vinculada, quedará
                  desactivada para nuevos inicios de sesión.
                </li>
              </ul>

              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs">
                Este bloque no incluye reactivación desde la
                pantalla. No retire profesores reales por error;
                pruebe primero con un docente de prueba.
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={cerrarModal}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={ocupado}
                  onClick={confirmarRetiro}
                  className="px-5 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <UserMinus size={17} />
                  {ocupado ? 'Retirando...' : 'Confirmar retiro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}