'use client';

import { useEffect, useState } from 'react';
import { UserPlus, Trash2, Key, RefreshCcw, PlusCircle } from 'lucide-react';

interface Usuario {
  id: string;
  email: string;
  nombre_completo: string;
  rol: string;
  activo: boolean;
  created_at?: string;
}

const roles = ['director', 'docente', 'secretaria'];

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUser, setNewUser] = useState({ email: '', nombre_completo: '', rol: 'docente', password: '', docente_id: '',});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [docentesDisponibles, setDocentesDisponibles] = useState<any[]>([]);

  const fetchDocentesDisponibles = async () => {
    const res = await fetch('/api/docentes/disponibles?con_asignacion=true', {
      credentials: 'same-origin',
    });
    if (res.ok) {
      const data = await res.json();
      setDocentesDisponibles(data.docentes);
    }
  };

  

  const fetchUsuarios = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/usuarios', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('No se pudo cargar la lista');
      const data = await res.json();
      setUsuarios(data);
    } catch (err) {
      setError('Error al cargar usuarios.');
    } finally {
      setLoading(false);
    }

    
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage('');

    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.message || 'Error al crear usuario');
        return;
      }

      setNewUser({ email: '', nombre_completo: '', rol: 'docente', password: '', docente_id: '' });
      setStatusMessage('Usuario creado correctamente');
      fetchUsuarios();
    } catch (err) {
      setStatusMessage('Error al crear usuario');
    }
  };

  const handleUpdatePassword = async (id: string) => {
    const password = passwords[id];
    if (!password) {
      setStatusMessage('Ingrese la nueva contraseña');
      return;
    }

    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.message || 'Error al actualizar contraseña');
        return;
      }

      setPasswords((prev) => ({ ...prev, [id]: '' }));
      setEditingId(null);
      setStatusMessage('Contraseña actualizada con éxito');
      fetchUsuarios();
    } catch (err) {
      setStatusMessage('Error al actualizar contraseña');
    }
  };

  const handleDeleteUser = async (id: string) => {
    const confirmDelete = confirm('¿Eliminar usuario? Esta acción no se puede deshacer.');
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.message || 'Error al eliminar usuario');
        return;
      }
      setStatusMessage('Usuario eliminado correctamente');
      fetchUsuarios();
    } catch (err) {
      setStatusMessage('Error al eliminar usuario');
    }
  };

  const toggleActivo = async (id: string, activo: boolean) => {
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !activo }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.message || 'Error al actualizar estado');
        return;
      }

      setStatusMessage('Estado actualizado');
      fetchUsuarios();
    } catch (err) {
      setStatusMessage('Error al actualizar estado');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Encabezado: título + mensaje explicativo, siempre arriba */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Usuarios</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Desde aquí puedes crear usuarios, cambiar contraseñas y eliminar cuentas. Todo quedará registrado en auditoría.
          </p>
        </div>

        {statusMessage && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            {statusMessage}
          </div>
        )}

        {/* Cuerpo: formulario a la izquierda, lista compacta a la derecha */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* Formulario de nuevo usuario */}
          <div className="h-fit rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <div className="flex items-center gap-2 text-blue-700 font-semibold mb-4">
              <UserPlus size={18} />
              <span>Nuevo usuario</span>
            </div>
            <form className="space-y-3" onSubmit={handleCreateUser}>
              <div>
                <label className="block text-sm font-medium text-slate-700">Correo</label>
                <input
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="correo@dominio.local"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Nombre completo</label>
                <input
                  value={newUser.nombre_completo}
                  onChange={(e) => setNewUser({ ...newUser, nombre_completo: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Nombre del usuario"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Rol</label>
                <select
                  value={newUser.rol}
                  onChange={(e) => {
                  const rol = e.target.value;
                  setNewUser({ ...newUser, rol, docente_id: '' });
                  if (rol === 'docente') fetchDocentesDisponibles();
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {roles.map((rol) => (
                    <option key={rol} value={rol}>
                      {rol}
                    </option>
                  ))}
                </select>
                {newUser.rol === 'docente' && (
                  <div className="mt-3">
                    <label className="text-sm font-medium text-slate-700">
                      Seleccione un profesor para asociar al usuario
                    </label>
                    <select
                      value={newUser.docente_id}
                      onChange={(e) => setNewUser({ ...newUser, docente_id: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Seleccione un profesor...</option>
                      {docentesDisponibles.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.apellidos} {d.nombres} — {d.materias_resumen}
                        </option>
                      ))}
                    </select>
                    {docentesDisponibles.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        No hay profesores sin usuario con asignaciones activas. Primero
                        cree la asignación en /asignaciones.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Clave segura"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
              >
                <PlusCircle size={18} /> Crear usuario
              </button>
            </form>
          </div>

          {/* Lista compacta de usuarios registrados */}
          <div className="min-w-0 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Usuarios registrados</h2>
              <button
                type="button"
                onClick={fetchUsuarios}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                <RefreshCcw size={14} /> Actualizar
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-500">Cargando usuarios...</div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            ) : (
              <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                {usuarios.map((usuario) => (
                  <div key={usuario.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {usuario.rol}
                          </span>
                          <p className="truncate text-sm font-semibold text-slate-900">{usuario.nombre_completo}</p>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{usuario.email}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleActivo(usuario.id, usuario.activo)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${usuario.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                        >
                          {usuario.activo ? 'Activo' : 'Inactivo'}
                        </button>
                        <button
                          type="button"
                          title="Cambiar contraseña"
                          onClick={() => setEditingId(usuario.id === editingId ? null : usuario.id)}
                          className="inline-flex items-center rounded-lg bg-slate-900 p-1.5 text-white hover:bg-slate-800"
                        >
                          <Key size={14} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => handleDeleteUser(usuario.id)}
                          className="inline-flex items-center rounded-lg bg-rose-600 p-1.5 text-white hover:bg-rose-700"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {editingId === usuario.id && (
                      <div className="mt-2.5 rounded-lg border border-slate-200 bg-white p-3">
                        <label className="block text-xs font-medium text-slate-700">Nueva contraseña</label>
                        <div className="mt-1.5 flex gap-2 flex-col sm:flex-row">
                          <input
                            type="password"
                            value={passwords[usuario.id] || ''}
                            onChange={(e) => setPasswords({ ...passwords, [usuario.id]: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                            placeholder="Nueva contraseña segura"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdatePassword(usuario.id)}
                            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}