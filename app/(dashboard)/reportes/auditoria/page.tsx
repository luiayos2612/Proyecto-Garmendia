'use client';

import { useState, useEffect } from 'react';
import { Activity, Filter, Search, ChevronRight, Calendar, User, FileText, Database, CreditCard, GraduationCap, BookOpen, Users, CheckCircle2, XCircle, Clock, Award } from 'lucide-react';

interface RegistroAuditoria {
  id: string;
  tabla_afectada: string;
  accion: string;
  usuario_id: string;
  usuario_email: string;
  datos_nuevos: any;
  fecha_hora: string;
}

interface StatItem {
  tabla_afectada: string;
  accion: string;
  total: string | number;
}

// ✅ RESUMEN RÁPIDO (tabla)
function generarDescripcionNatural(r: RegistroAuditoria): { titulo: string; subtitulo: string } {
  const d = r.datos_nuevos || {};
  
  // Si ya viene un resumen enriquecido, usarlo
  if (d.resumen) return { titulo: d.resumen, subtitulo: `${r.tabla_afectada} • ${r.accion}` };

  const tabla = r.tabla_afectada;
  const accion = r.accion;

  if (tabla === 'estudiantes') {
    if (accion === 'INSERT') return {
      titulo: `Nueva inscripción: ${d.apellidos} ${d.nombres}`,
      subtitulo: `Cédula: ${d.cedula || d.cedula_escolar || 'N/A'} • ${d.periodo_id ? `Período ${d.periodo_id}` : `${d.grado} - Sección ${d.seccion}`}`
    };
    if (accion === 'UPDATE') return {
      titulo: `Datos actualizados de ${d.apellidos || 'estudiante'}`,
      subtitulo: `Se modificó información académica o personal`
    };
    if (accion === 'DELETE') return { titulo: `Registro de estudiante eliminado`, subtitulo: `El estudiante fue retirado del sistema` };
  }

  if (tabla === 'usuarios') {
    if (accion === 'INSERT') return {
      titulo: `Usuario creado: ${d.nombre_completo}`,
      subtitulo: `Email: ${d.email} • Rol: ${d.rol}`
    };
  }

  if (tabla === 'calificaciones') {
    const nombre = d.estudiante_nombre || 'Estudiante';
    const materia = d.materia_nombre || 'Materia';
    return {
      titulo: `Calificación: ${d.nota}/20 — ${nombre}`,
      subtitulo: `${materia} • Lapso ${d.lapso}`
    };
  }

  if (tabla === 'materias') {
    return {
      titulo: `Materia añadida: ${d.nombre}`,
      subtitulo: `Código: ${d.codigo} • ${d.grados_asignados?.length || 0} grado(s)`
    };
  }

  if (tabla === 'docentes') {
    return {
      titulo: `Docente registrado: ${d.apellidos} ${d.nombres}`,
      subtitulo: `Especialidad: ${d.especialidad}`
    };
  }

  if (tabla === 'asignaciones_docentes') {
    return {
      titulo: `Asignación: ${d.docente_nombre || 'Docente'} → ${d.materia_nombre || 'Materia'}`,
      subtitulo: `${d.grado} sección ${d.seccion}`
    };
  }

  if (tabla === 'pagos') {
    return {
      titulo: `Pago registrado: ${d.monto}$ (${d.metodo_pago})`,
      subtitulo: `Concepto: ${d.concepto} • Ref: ${d.referencia || 'N/A'}`
    };
  }

  return { titulo: `${accion} en ${tabla}`, subtitulo: `Operación realizada por el sistema` };
}

// ✅ DETALLE COMPLETO (modal)
function DetalleNatural({ registro }: { registro: RegistroAuditoria }) {
  const d = registro.datos_nuevos || {};
  const tabla = registro.tabla_afectada;
  const accion = registro.accion;

  const Fila = ({ icon: Icon, label, value, color = 'text-slate-900' }: any) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="p-1.5 bg-slate-100 rounded-lg shrink-0 mt-0.5"><Icon size={14} className="text-slate-500" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-semibold truncate ${color}`}>{value || '—'}</p>
      </div>
    </div>
  );

  // ─── ESTUDIANTES ───
  if (tabla === 'estudiantes') {
    return (
      <div className="space-y-1">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><GraduationCap size={18} className="text-blue-600" />
            <p className="text-xs font-bold text-blue-700 uppercase">Registro Académico</p>
          </div>
          <p className="text-lg font-bold text-slate-900">{d.apellidos} {d.nombres}</p>
          <p className="text-sm text-slate-600">{d.periodo_id ? `Período ${d.periodo_id}` : `${d.grado} — Sección ${d.seccion}`}</p>
        </div>
        <Fila icon={Users} label="Cédula de Identidad" value={d.cedula} />
        <Fila icon={Users} label="Cédula Escolar (Histórico)" value={d.cedula_escolar} />
        <Fila icon={Users} label="Género" value={d.genero} />
        <Fila icon={Calendar} label="Fecha de Nacimiento" value={d.fecha_nacimiento} />
        <Fila icon={CheckCircle2} label="Estado" value={d.estado || (d.activo ? 'Activo' : 'Inactivo')} 
          color={d.estado === 'activo' || d.activo ? 'text-emerald-700' : 'text-amber-700'} />
        <Fila icon={Clock} label="Acción" value={accion === 'INSERT' ? 'Inscripción nueva' : 'Actualización'} />
      </div>
    );
  }

  // ─── DOCENTES ───
  if (tabla === 'docentes') {
    return (
      <div className="space-y-1">
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><Users size={18} className="text-sky-600" />
            <p className="text-xs font-bold text-sky-700 uppercase">Personal Docente</p>
          </div>
          <p className="text-lg font-bold text-slate-900">{d.apellidos} {d.nombres}</p>
          <p className="text-sm text-slate-600">{d.especialidad}</p>
        </div>
        <Fila icon={Users} label="Cédula" value={d.cedula} />
        <Fila icon={BookOpen} label="Especialidad" value={d.especialidad} />
        <Fila icon={FileText} label="Teléfono" value={d.telefono} />
        <Fila icon={FileText} label="Email" value={d.email} />
        <Fila icon={CheckCircle2} label="Estado" value={d.activo ? 'Activo' : 'Inactivo'} color={d.activo ? 'text-emerald-700' : 'text-rose-700'} />
      </div>
    );
  }

  // ─── MATERIAS ───
  if (tabla === 'materias') {
    return (
      <div className="space-y-1">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><BookOpen size={18} className="text-indigo-600" />
            <p className="text-xs font-bold text-indigo-700 uppercase">Catálogo de Materias</p>
          </div>
          <p className="text-lg font-bold text-slate-900">{d.nombre}</p>
          <p className="text-sm text-slate-600">Código: {d.codigo}</p>
        </div>
        <Fila icon={FileText} label="Descripción" value={d.descripcion} />
        <Fila icon={GraduationCap} label="Grados Asignados" value={d.grados_asignados?.join(', ')} />
        <Fila icon={CheckCircle2} label="Activa" value={d.activa !== false ? 'Sí' : 'No'} color={d.activa !== false ? 'text-emerald-700' : 'text-rose-700'} />
      </div>
    );
  }

  // ─── CALIFICACIONES (con nombres enriquecidos) ───
  if (tabla === 'calificaciones') {
    const notaColor = parseFloat(d.nota) >= 10 ? 'text-emerald-700' : 'text-rose-700';
    const resultado = parseFloat(d.nota) >= 10 ? 'Aprobado ✅' : 'Reprobado ❌';
    
    return (
      <div className="space-y-1">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><Award size={18} className="text-emerald-600" />
            <p className="text-xs font-bold text-emerald-700 uppercase">Registro de Calificación</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{d.nota}<span className="text-lg text-slate-500">/20</span></p>
          <p className="text-sm text-slate-600">Lapso {d.lapso}</p>
        </div>
        
        {/* ✅ Nombres legibles en vez de IDs */}
        <Fila icon={Users} label="Estudiante" value={d.estudiante_nombre || d.estudiante_id} color="text-blue-700" />
        <Fila icon={BookOpen} label="Materia" value={d.materia_nombre || d.materia_id} color="text-violet-700" />
        <Fila icon={Users} label="Docente" value={d.docente_nombre || d.docente_id} color="text-sky-700" />
        
        <Fila icon={FileText} label="Observaciones" value={d.observaciones} />
        <Fila icon={CheckCircle2} label="Resultado" value={resultado} color={notaColor} />
      </div>
    );
  }

  // ─── ASIGNACIONES ───
  if (tabla === 'asignaciones_docentes') {
    return (
      <div className="space-y-1">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><Users size={18} className="text-orange-600" />
            <p className="text-xs font-bold text-orange-700 uppercase">Asignación Docente</p>
          </div>
          <p className="text-lg font-bold text-slate-900">{d.docente_nombre || 'Docente'}</p>
          <p className="text-sm text-slate-600">{d.materia_nombre || 'Materia'} • {d.periodo_id ? `Periodo ${d.periodo_id}` : `${d.grado} ${d.seccion}`}</p>
        </div>
        <Fila icon={Users} label="Docente" value={d.docente_nombre || d.docente_id} />
        <Fila icon={BookOpen} label="Materia" value={d.materia_nombre || d.materia_id} />
        <Fila icon={GraduationCap} label="Período" value={d.periodo_id ? `Periodo ${d.periodo_id}` : `${d.grado} — ${d.seccion}`} />
        <Fila icon={CheckCircle2} label="Año Escolar" value={d.ano_escolar} />
      </div>
    );
  }

  // ─── PAGOS ───
  if (tabla === 'pagos') {
    const estadoColor = d.estado === 'confirmado' ? 'text-emerald-700' : d.estado === 'rechazado' ? 'text-rose-700' : 'text-amber-700';
    const estadoTexto = d.estado === 'confirmado' ? 'Confirmado ✅' : d.estado === 'rechazado' ? 'Rechazado ❌' : 'Pendiente de verificación ⏳';
    
    return (
      <div className="space-y-1">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><CreditCard size={18} className="text-violet-600" />
            <p className="text-xs font-bold text-violet-700 uppercase">Transacción Financiera</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{d.monto}$ <span className="text-sm font-normal text-slate-500">({d.metodo_pago})</span></p>
          <p className="text-sm text-slate-600">{d.concepto}</p>
        </div>
        <Fila icon={CreditCard} label="Método de Pago" value={d.metodo_pago} />
        <Fila icon={FileText} label="Referencia" value={d.referencia} />
        <Fila icon={Calendar} label="Fecha del Pago" value={d.fecha_pago?.split('T')[0]} />
        <Fila icon={CheckCircle2} label="Estado" value={estadoTexto} color={estadoColor} />
      </div>
    );
  }

  // ─── USUARIOS ───
  if (tabla === 'usuarios') {
    return (
      <div className="space-y-1">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><Users size={18} className="text-amber-600" />
            <p className="text-xs font-bold text-amber-700 uppercase">Gestión de Usuarios</p>
          </div>
          <p className="text-lg font-bold text-slate-900">{d.nombre_completo}</p>
          <p className="text-sm text-slate-600">{d.email}</p>
        </div>
        <Fila icon={Users} label="Email" value={d.email} />
        <Fila icon={CheckCircle2} label="Rol" value={d.rol?.toUpperCase()} />
        <Fila icon={CheckCircle2} label="Activo" value={d.activo ? 'Sí' : 'No'} color={d.activo ? 'text-emerald-700' : 'text-rose-700'} />
      </div>
    );
  }

  // ─── GENÉRICO ───
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-bold text-slate-500 uppercase mb-2">Datos del Registro</p>
      <div className="space-y-2">
        {Object.entries(d).map(([key, value]) => (
          <div key={key} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
            <span className="text-xs text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
            <span className="text-sm font-medium text-slate-900 truncate max-w-[60%] text-right">{String(value) || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatearFecha(fecha: string, conHora: boolean = true): string {
  const date = new Date(fecha);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const año = date.getFullYear();
  if (!conHora) return `${dia}/${mes}/${año}`;
  const horas = String(date.getHours()).padStart(2, '0');
  const minutos = String(date.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${año} ${horas}:${minutos}`;
}

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [stats, setStats] = useState<StatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedregistro, setSelectedregistro] = useState<RegistroAuditoria | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({ tabla: '', accion: '' });

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.tabla) params.set('tabla', filtros.tabla);
      if (filtros.accion) params.set('accion', filtros.accion);

      const res = await fetch(`/api/auditoria?${params}`);
      const data = await res.json();

      setRegistros(data.registros || []);
      setStats(data.stats || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarDatos(); }, [filtros]);

  const filtrados = registros.filter(r => {
    const desc = generarDescripcionNatural(r);
    return (
      desc.titulo.toLowerCase().includes(busqueda.toLowerCase()) ||
      desc.subtitulo.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.usuario_email?.toLowerCase().includes(busqueda.toLowerCase())
    );
  });

  const getAccionColor = (accion: string) => {
    if (accion === 'INSERT') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (accion === 'UPDATE') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (accion === 'DELETE') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-700';
  };

  const getAccionIcon = (accion: string) => {
    if (accion === 'INSERT') return '➕';
    if (accion === 'UPDATE') return '🔄';
    if (accion === 'DELETE') return '🗑️';
    return '•';
  };

  const tablas = [...new Set(stats.map(s => s.tabla_afectada))];
  const acciones = [...new Set(stats.map(s => s.accion))];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-purple-50 rounded-xl"><Activity size={28} className="text-purple-600" /></div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Auditoría del Sistema</h1>
          <p className="text-slate-500 text-sm">Seguimiento de todos los movimientos importantes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Total Registros</p>
          <p className="text-3xl font-extrabold text-slate-900">{registros.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tablas Monitoreadas</p>
          <p className="text-3xl font-extrabold text-slate-900">{tablas.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Últimas 24h</p>
          <p className="text-3xl font-extrabold text-slate-900">{registros.filter(r => {
            const fecha = new Date(r.fecha_hora);
            const hoy = new Date();
            return Math.abs(hoy.getTime() - fecha.getTime()) < 86400000;
          }).length}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <Filter size={16} /> Filtros
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={filtros.tabla}
            onChange={e => setFiltros(f => ({ ...f, tabla: e.target.value }))}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-500">
            <option value="">Todas las tablas</option>
            {tablas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select value={filtros.accion}
            onChange={e => setFiltros(f => ({ ...f, accion: e.target.value }))}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-500">
            <option value="">Todas las acciones</option>
            {acciones.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Buscar por descripción..." value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/2">Descripción del Movimiento</th>
                  <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Acción</th>
                  <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Usuario</th>
                  <th className="text-left py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                  <th className="py-4 px-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <Activity size={40} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No hay registros</p>
                    </td>
                  </tr>
                ) : (
                  filtrados.map(r => {
                    const desc = generarDescripcionNatural(r);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedregistro(r)}>
                        <td className="py-4 px-6">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg mt-0.5">
                              <FileText size={16} className="text-slate-500" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{desc.titulo}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{desc.subtitulo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getAccionColor(r.accion)}`}>
                            {getAccionIcon(r.accion)} {r.accion}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-slate-400" />
                            <span className="text-sm text-slate-700">{r.usuario_email || 'Sistema'}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-slate-400" />
                            {formatearFecha(r.fecha_hora)}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <ChevronRight size={16} className="text-slate-400" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedregistro && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-slate-50 border-b border-slate-200 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Detalles del Movimiento</h2>
                <p className="text-xs text-slate-500 mt-1">{formatearFecha(selectedregistro.fecha_hora)} • {selectedregistro.usuario_email || 'Sistema'}</p>
              </div>
              <button onClick={() => setSelectedregistro(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={16} className="text-purple-600" />
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Información para el Usuario</p>
                </div>
                <DetalleNatural registro={selectedregistro} />
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <Database size={16} className="text-slate-500" />
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Metadatos Técnicos</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400 text-xs">Tabla:</span>
                    <p className="font-semibold text-slate-900">{selectedregistro.tabla_afectada}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs">Acción:</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold border ${getAccionColor(selectedregistro.accion)}`}>
                      {getAccionIcon(selectedregistro.accion)} {selectedregistro.accion}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs">ID del Registro:</span>
                    <p className="font-mono text-xs text-slate-700">{selectedregistro.id}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs">Usuario:</span>
                    <p className="font-mono text-xs text-slate-700">{selectedregistro.usuario_id || 'Sistema'}</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-slate-500" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Datos Técnicos (JSON)</p>
                  </div>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded">Para desarrolladores</span>
                </div>
                <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
                  <pre className="text-emerald-400">{JSON.stringify(selectedregistro.datos_nuevos, null, 2)}</pre>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}