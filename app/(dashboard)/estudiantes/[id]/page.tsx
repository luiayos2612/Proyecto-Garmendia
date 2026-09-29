'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ChevronLeft, Save, Edit3, Trash2, Lock, CheckCircle2, 
  AlertCircle, User, BookOpen, CreditCard, GraduationCap,
  Calendar, Hash, Mail, X, Loader2
} from 'lucide-react';

interface Estudiante {
  id: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  cedula_escolar: string;
  fecha_nacimiento: string;
  genero: string;
  email?: string;
  periodo_id: number;
  periodo_nombre: string;
  estado: string;
  activo: boolean;
}

interface Materia {
  id: string;
  nombre: string;
  codigo: string;
  nota: string;
  tiene_calificacion: boolean;
  activa: boolean;
}

interface Pago {
  id: string;
  concepto: string;
  monto: string;
  monto_bs?: string;
  estado: string;
  tipo: string;
  metodo_pago: string;
  fecha_pago: string;
}

interface Resumen {
  total_pagado: string;
  inscripciones_pagadas: string;
  mensualidades_pagadas: string;
  pagos_pendientes: string;
}

export default function EstudianteDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [estudiante, setEstudiante] = useState<Estudiante | null>(null);
  const [formData, setFormData] = useState<Partial<Estudiante>>({});
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cupoPendiente, setCupoPendiente] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAprobarModal, setShowAprobarModal] = useState(false);
  const [aprobarLoading, setAprobarLoading] = useState(false);
  // ✅ NUEVO: flag que devuelve la API (route_estudiante_id_MODIFICADO.ts)
  // según el rol del actor. Es la ÚNICA fuente de verdad para mostrar/ocultar
  // pagos y acciones administrativas — el frontend nunca decide el rol por su cuenta.
  const [puedeEditar, setPuedeEditar] = useState(false);

  useEffect(() => {
    if (!id) return;
    cargarDatos();
  }, [id]);

  const cargarDatos = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/estudiantes/${id}`);

      if (!res.ok) {
        const text = await res.text();
        let errMsg = `Error ${res.status}`;
        try {
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch {
          errMsg = text || errMsg;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();

      if (!data.estudiante) {
        throw new Error('No se recibieron datos del estudiante');
      }

      setEstudiante(data.estudiante);
      setFormData(data.estudiante);
      setMaterias(data.materias || []);
      setPagos(data.pagos || []);
      setResumen(data.resumen);
      setCupoPendiente(data.cupo_pendiente);
      // ✅ NUEVO: se toma directo de la respuesta del backend
      setPuedeEditar(Boolean(data.puede_editar));
    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    // ✅ NUEVO: guarda de UI, redundante con el backend (que ya rechaza con 403),
    // pero evita una llamada innecesaria si alguien fuerza el estado de React.
    if (!puedeEditar) return;

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/estudiantes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = 'Error al guardar';
        try { const json = JSON.parse(text); errMsg = json.error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      setEstudiante(data.estudiante);
      setEditMode(false);
      setSuccess('Datos actualizados correctamente');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async () => {
    if (!puedeEditar) return; // ✅ NUEVO
    if (!confirm('¿Está seguro de eliminar este estudiante? Se desactivará del sistema.')) return;
    try {
      const res = await fetch(`/api/estudiantes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/estudiantes');
        return;
      }
      const text = await res.text();
      let errMsg = 'Error al eliminar';
      try { const json = JSON.parse(text); errMsg = json.error || errMsg; } catch {}
      throw new Error(errMsg);
    } catch (err: any) { 
      setError(err.message); 
    }
  };

  const handleCongelar = async () => {
    if (!puedeEditar) return; // ✅ NUEVO
    if (!confirm('¿Desea congelar/desactivar este estudiante?')) return;
    try {
      const res = await fetch(`/api/estudiantes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: false, estado: 'verificacion' })
      });
      if (res.ok) { 
        setSuccess('Estudiante congelado correctamente'); 
        cargarDatos(); 
      } else {
        throw new Error('Error al congelar');
      }
    } catch (err: any) { 
      setError(err.message); 
    }
  };

  const handleAprobar = async () => {
    if (!puedeEditar) return; // ✅ NUEVO
    setAprobarLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/estudiantes/${id}/aprobar`, { method: 'POST' });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = 'Error al aprobar';
        try { const json = JSON.parse(text); errMsg = json.error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      setSuccess(data.message);
      setCupoPendiente({ periodo_destino: data.data?.periodo_destino });
      setShowAprobarModal(false);
      cargarDatos();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAprobarLoading(false);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'deuda': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'verificacion': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getEstadoPago = (estado: string) => {
    switch (estado) {
      case 'confirmado': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'verificacion': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'rechazado': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 size={40} className="animate-spin text-blue-900" />
        <p className="text-slate-500 font-medium">Cargando información del estudiante...</p>
      </div>
    );
  }

  if (error && !estudiante) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6">
        <button 
          onClick={() => router.push('/estudiantes')}
          className="mb-6 flex items-center gap-2 text-slate-600 hover:text-blue-900 transition-colors"
        >
          <ChevronLeft size={20} /> Volver a estudiantes
        </button>
        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
          <p className="font-bold text-red-800 text-lg mb-2">Error al cargar el estudiante</p>
          <p className="text-red-600">{error}</p>
          <button 
            onClick={cargarDatos}
            className="mt-4 px-4 py-2 bg-white border border-red-200 text-red-700 rounded-xl hover:bg-red-50 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!estudiante) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-slate-500">No se encontró el estudiante</p>
      </div>
    );
  }

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
  const labelClass = "text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block";
  const puedeAprobar = puedeEditar && estudiante.periodo_id < 6 && !cupoPendiente && estudiante.activo; // ✅ MODIFICADO

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/estudiantes')}
            className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 shadow-sm transition-all"
          >
            <ChevronLeft size={24} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {estudiante.apellidos} {estudiante.nombres}
            </h1>
            <p className="text-slate-500 text-sm flex items-center gap-2 mt-1 flex-wrap">
              <Hash size={14} /> {estudiante.cedula}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                Periodo {estudiante.periodo_id}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${getEstadoColor(estudiante.estado)}`}>
                {estudiante.estado === 'activo' ? 'Activo' : estudiante.estado === 'deuda' ? 'En Deuda' : 'En Verificación'}
              </span>
            </p>
          </div>
        </div>

        {/* ✅ MODIFICADO: el botón Editar/Guardar solo aparece si puede_editar === true.
            El docente ve la ficha sin ningún control de edición en el header. */}
        {puedeEditar && (
          <div className="flex gap-2">
            {!editMode ? (
              <button 
                onClick={() => setEditMode(true)}
                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <Edit3 size={16} /> Editar
              </button>
            ) : (
              <button 
                onClick={handleSave} 
                disabled={saving}
                className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar
              </button>
            )}
          </div>
        )}
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={18} /> {success}
        </div>
      )}

      {error && !showAprobarModal && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl font-medium flex items-center gap-2">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {cupoPendiente && (
        <div className="bg-violet-50 border border-violet-200 text-violet-700 px-4 py-3 rounded-xl font-medium flex items-center gap-2">
          <GraduationCap size={18} />
          Cupo pendiente de aprobación para Periodo {cupoPendiente.periodo_destino}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: Datos personales */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <User size={20} className="text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Datos Personales</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelClass}>Cédula</label>
                {editMode ? (
                  <input 
                    name="cedula" 
                    value={formData.cedula || ''} 
                    onChange={handleChange} 
                    className={inputClass} 
                  />
                ) : (
                  <p className="text-sm font-semibold text-slate-900 font-mono bg-slate-50 px-3 py-2 rounded-lg">
                    {estudiante.cedula}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Cédula Escolar</label>
                {editMode ? (
                  <input 
                    name="cedula_escolar" 
                    value={formData.cedula_escolar || ''} 
                    onChange={handleChange} 
                    className={inputClass} 
                  />
                ) : (
                  <p className="text-sm text-slate-600">{estudiante.cedula_escolar || 'N/A'}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Apellidos</label>
                {editMode ? (
                  <input 
                    name="apellidos" 
                    value={formData.apellidos || ''} 
                    onChange={handleChange} 
                    className={inputClass} 
                  />
                ) : (
                  <p className="text-sm font-semibold text-slate-900">{estudiante.apellidos}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Nombres</label>
                {editMode ? (
                  <input 
                    name="nombres" 
                    value={formData.nombres || ''} 
                    onChange={handleChange} 
                    className={inputClass} 
                  />
                ) : (
                  <p className="text-sm font-semibold text-slate-900">{estudiante.nombres}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Género</label>
                {editMode ? (
                  <select 
                    name="genero" 
                    value={formData.genero || ''} 
                    onChange={handleChange} 
                    className={inputClass}
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                  </select>
                ) : (
                  <p className="text-sm text-slate-600 capitalize">{estudiante.genero}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Fecha de Nacimiento</label>
                {editMode ? (
                  <input 
                    type="date" 
                    name="fecha_nacimiento" 
                    value={formData.fecha_nacimiento ? formData.fecha_nacimiento.split('T')[0] : ''} 
                    onChange={handleChange} 
                    className={inputClass} 
                  />
                ) : (
                  <p className="text-sm text-slate-600 flex items-center gap-1">
                    <Calendar size={14} />
                    {estudiante.fecha_nacimiento 
                      ? new Date(estudiante.fecha_nacimiento).toLocaleDateString() 
                      : 'N/A'
                    }
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Correo Electrónico</label>
                {editMode ? (
                  <input 
                    type="email" 
                    name="email" 
                    value={formData.email || ''} 
                    onChange={handleChange} 
                    className={inputClass} 
                    placeholder="correo@ejemplo.com" 
                  />
                ) : (
                  <p className="text-sm text-slate-600 flex items-center gap-1">
                    <Mail size={14} /> {estudiante.email || 'No registrado'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ✅ MODIFICADO: bloque completo de "Acciones Administrativas" oculto
              para el docente. No se renderiza en el DOM (no solo display:none),
              así que no queda ni el botón ni el handler expuesto en el HTML. */}
          {puedeEditar && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                Acciones Administrativas
              </h3>

              <button 
                onClick={handleCongelar}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-semibold text-sm hover:bg-amber-100 transition-all"
              >
                <Lock size={16} /> 
                {estudiante.activo ? 'Congelar Estudiante' : 'Activar Estudiante'}
              </button>

              {puedeAprobar && (
                <button 
                  onClick={() => setShowAprobarModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all shadow-lg"
                >
                  <CheckCircle2 size={16} /> Aprobar Siguiente Periodo
                </button>
              )}

              <button 
                onClick={handleEliminar}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-rose-600 border border-rose-200 rounded-xl font-semibold text-sm hover:bg-rose-50 transition-all"
              >
                <Trash2 size={16} /> Eliminar Estudiante
              </button>
            </div>
          )}
        </div>

        {/* Columna derecha: Materias y Pagos */}
        <div className="lg:col-span-2 space-y-6">
          {/* ✅ MODIFICADO: Resumen Financiero solo visible si puede_editar.
              La API ya no envía "resumen" a un docente (viene null), pero
              este check evita cualquier intento de renderizar datos vacíos. */}
          {puedeEditar && resumen && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { 
                  label: 'Total Pagado', 
                  value: `${parseFloat(resumen.total_pagado).toFixed(2)}$`, 
                  color: 'text-emerald-600', 
                  bg: 'bg-emerald-50' 
                },
                { 
                  label: 'Inscripción', 
                  value: parseInt(resumen.inscripciones_pagadas) > 0 ? 'Pagada' : 'Pendiente', 
                  color: parseInt(resumen.inscripciones_pagadas) > 0 ? 'text-blue-600' : 'text-amber-600', 
                  bg: parseInt(resumen.inscripciones_pagadas) > 0 ? 'bg-blue-50' : 'bg-amber-50' 
                },
                { 
                  label: 'Mensualidades', 
                  value: `${resumen.mensualidades_pagadas}/6`, 
                  color: 'text-violet-600', 
                  bg: 'bg-violet-50' 
                },
                { 
                  label: 'Pendientes', 
                  value: resumen.pagos_pendientes, 
                  color: 'text-rose-600', 
                  bg: 'bg-rose-50' 
                },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{stat.label}</p>
                  <p className={`text-lg font-extrabold ${stat.color} mt-1`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Materias y Calificaciones — visible para AMBOS roles (director y docente),
              es la sección central del flujo de un clic que pidió el usuario. */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <BookOpen size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Materias y Calificaciones</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">Materia</th>
                    <th className="text-center py-3 px-6 text-xs font-bold text-slate-500 uppercase">Calificación</th>
                    <th className="text-center py-3 px-4 text-xs font-bold text-slate-500 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {materias.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400 text-sm">
                        No hay materias inscritas
                      </td>
                    </tr>
                  ) : (
                    materias.map((mat) => {
                      const nota = parseFloat(mat.nota || '0');
                      const tieneNota = mat.tiene_calificacion;
                      const aprobada = tieneNota && nota >= 10;

                      return (
                        <tr key={mat.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-6">
                            <p className="text-sm font-bold text-slate-900">{mat.nombre}</p>
                            <p className="text-xs text-slate-500">{mat.codigo}</p>
                          </td>

                          <td className="py-3 px-6 text-center">
                            {tieneNota ? (
                              <span className={`text-sm font-bold font-mono ${aprobada ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {nota.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-sm text-slate-400 font-mono">-</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            {tieneNota ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${aprobada ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                {aprobada ? 'Aprobada' : 'Reprobada'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200">
                                Sin calificar
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ✅ MODIFICADO: Historial de Pagos completo oculto para el docente.
              La API ya envía pagos: [] a un docente, pero además no se renderiza
              la sección visualmente para no insinuar que existe control de pagos. */}
          {puedeEditar && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <CreditCard size={20} className="text-amber-600" />
                <h2 className="text-lg font-bold text-slate-900">Historial de Pagos</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">Fecha</th>
                      <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">Concepto</th>
                      <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">Monto</th>
                      <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">Método</th>
                      <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">
                          No hay pagos registrados
                        </td>
                      </tr>
                    ) : (
                      pagos.map((pago) => (
                        <tr key={pago.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-6 text-sm text-slate-600">
                            {new Date(pago.fecha_pago).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-6 text-sm font-medium text-slate-900">{pago.concepto}</td>
                          <td className="py-3 px-4 text-sm font-bold text-slate-900">
                            {parseFloat(pago.monto).toFixed(2)}$
                            {pago.monto_bs && (
                              <span className="block text-[10px] text-amber-600">
                                {parseFloat(pago.monto_bs).toFixed(2)} Bs
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-500">{pago.metodo_pago}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getEstadoPago(pago.estado)}`}>
                              {pago.estado}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Aprobar — solo puede abrirse si puedeAprobar (que ya exige puedeEditar) */}
      {showAprobarModal && puedeEditar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap size={20} className="text-emerald-600" /> 
                Aprobar Periodo
              </h3>
              <button 
                onClick={() => setShowAprobarModal(false)} 
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Esta acción validará que el estudiante cumpla con todos los requisitos para pasar al{' '}
              <strong>Periodo {estudiante.periodo_id + 1}</strong>.
            </p>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <p className="font-semibold text-slate-700 mb-2">Requisitos a validar:</p>
              <div className="flex items-center gap-2 text-slate-600">
                <CheckCircle2 size={16} className="text-emerald-500" /> 
                Pago de inscripción confirmado
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <CheckCircle2 size={16} className="text-emerald-500" /> 
                6 mensualidades pagadas
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <CheckCircle2 size={16} className="text-emerald-500" /> 
                Nota ≥ 10 en cada materia del periodo
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setShowAprobarModal(false)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleAprobar} 
                disabled={aprobarLoading}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {aprobarLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Confirmar Aprobación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
