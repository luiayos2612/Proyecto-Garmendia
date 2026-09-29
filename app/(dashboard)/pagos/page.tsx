'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, CreditCard, AlertCircle, CheckCircle2, Clock, ArrowRight, Download, Bell, X } from 'lucide-react';

interface EstudiantePago {
  id: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  periodo_id?: number;
  grado?: string;
  seccion?: string;
  estado: 'activo' | 'verificacion' | 'deuda';
  total_pagado: string;
  mensualidades_pagadas: string;
  pagos_por_verificar: string;
  ultimo_pago: any;
}

export default function PagosPage() {
  const router = useRouter();
  const [estudiantes, setEstudiantes] = useState<EstudiantePago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  /* ─── Carga inicial ─── */
  useEffect(() => { cargarDatos(); }, []); // carga al montar sin filtros

  /* ─── Debounce: buscar automáticamente al dejar de escribir ─── */
  useEffect(() => {
    const timer = setTimeout(() => {
      cargarDatos();
    }, 400);
    return () => clearTimeout(timer);
  }, [busqueda, filtroEstado]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set('estado', filtroEstado);
      if (busqueda.trim()) params.set('q', busqueda.trim());
      
      const res = await fetch(`/api/pagos?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar estudiantes con pagos');
      setEstudiantes(data.estudiantes || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudieron cargar los datos de pagos');
      setEstudiantes([]);
    } finally {
      setLoading(false);
    }
  }, [busqueda, filtroEstado]);

  const getEstadoConfig = (estado: string) => {
    switch (estado) {
      case 'activo':
        return { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={14} />, label: 'Activo' };
      case 'verificacion':
        return { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Clock size={14} />, label: 'Nuevo (Sin pagos)' };
      case 'deuda':
        return { color: 'bg-rose-50 text-rose-700 border-rose-200', icon: <AlertCircle size={14} />, label: 'En Deuda' };
      default:
        return { color: 'bg-slate-100 text-slate-600', icon: <Clock size={14} />, label: estado };
    }
  };

  const exportarCSV = () => {
    const headers = ['Cedula', 'Apellidos', 'Nombres', 'Periodo', 'Estado', 'Total Pagado', 'Pagos por Verificar'];
    const rows = estudiantes.map(e => [
      e.cedula, e.apellidos, e.nombres, e.periodo_id ? `Periodo ${e.periodo_id}` : `${e.grado || ''} ${e.seccion || ''}`.trim(), 
      e.estado, e.total_pagado, e.pagos_por_verificar
    ].join(','));
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pagos_estudiantes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const limpiarBusqueda = () => {
    setBusqueda('');
    setFiltroEstado('');
  };

  // Métricas
  const totalActivos = estudiantes.filter(e => e.estado === 'activo').length;
  const totalVerificacion = estudiantes.filter(e => e.estado === 'verificacion').length;
  const totalDeuda = estudiantes.filter(e => e.estado === 'deuda').length;
  const totalPagosPorVerificar = estudiantes.reduce((sum, e) => sum + parseInt(e.pagos_por_verificar || '0'), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Seguimiento de Pagos</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión de mensualidades y estados financieros</p>
        </div>
        <button onClick={exportarCSV}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all flex items-center gap-2">
          <Download size={18} /> Exportar CSV
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Activos', value: totalActivos, color: 'text-emerald-600', bg: 'bg-emerald-50', desc: 'Al día' },
          { label: 'Nuevos', value: totalVerificacion, color: 'text-amber-600', bg: 'bg-amber-50', desc: 'Sin pagos aún' },
          { label: 'En Deuda', value: totalDeuda, color: 'text-rose-600', bg: 'bg-rose-50', desc: 'Debe mensualidades' },
          { label: 'Pagos por Verificar', value: totalPagosPorVerificar, color: 'text-violet-600', bg: 'bg-violet-50', desc: 'Transacciones pendientes' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
              {i === 3 ? <Bell size={20} /> : <CreditCard size={20} />}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{stat.label}</p>
              <p className="text-xl font-extrabold text-slate-900">{stat.value}</p>
              <p className="text-[10px] text-slate-400">{stat.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o cédula..." 
            value={busqueda} 
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargarDatos()}
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" 
          />
          {busqueda && (
            <button 
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select 
            value={filtroEstado} 
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="verificacion">Nuevos (Sin pagos)</option>
            <option value="deuda">En Deuda</option>
          </select>
          <button 
            onClick={cargarDatos}
            className="px-4 py-2.5 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-950 transition-colors"
          >
            Buscar
          </button>
          {(busqueda || filtroEstado) && (
            <button 
              onClick={limpiarBusqueda}
              className="px-3 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50"
              title="Limpiar filtros"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-red-50 rounded-3xl border border-red-200 text-red-700">
            <p className="font-bold mb-2">Error al cargar la lista de pagos</p>
            <p>{error}</p>
          </div>
        ) : estudiantes.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <CreditCard size={48} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {busqueda || filtroEstado ? 'No se encontraron resultados para tu búsqueda' : 'No se encontraron estudiantes'}
            </p>
            {(busqueda || filtroEstado) && (
              <button onClick={limpiarBusqueda} className="mt-3 text-blue-600 text-sm font-semibold hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          estudiantes.map((est) => {
            const estadoConfig = getEstadoConfig(est.estado);
            const tienePagosPendientes = parseInt(est.pagos_por_verificar || '0') > 0;
            
            return (
              <div key={est.id} 
                onClick={() => router.push(`/pagos/${est.id}`)}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group relative overflow-hidden">
                
                {tienePagosPendientes && (
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-violet-500" />
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold text-sm">
                      {est.apellidos?.[0]}{est.nombres?.[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900">{est.apellidos} {est.nombres}</h3>
                        {tienePagosPendientes && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-[10px] font-bold border border-violet-200">
                            <Bell size={10} /> {est.pagos_por_verificar} por verificar
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Cédula: {est.cedula} • {est.periodo_id ? `Período ${est.periodo_id}` : `${est.grado || ''} ${est.seccion || ''}`.trim()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-slate-400">Total Confirmado</p>
                      <p className="font-bold text-slate-900">{parseFloat(est.total_pagado).toFixed(2)}$</p>
                    </div>
                    
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${estadoConfig.color}`}>
                      {estadoConfig.icon} {estadoConfig.label}
                    </span>
                    
                    <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                </div>
                
                {est.ultimo_pago && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                    <Clock size={12} />
                    Último movimiento: {est.ultimo_pago.concepto} — 
                    <span className={est.ultimo_pago.estado === 'confirmado' ? 'text-emerald-600 font-semibold' : 
                                     est.ultimo_pago.estado === 'rechazado' ? 'text-rose-600 font-semibold' : 
                                     'text-amber-600 font-semibold'}>
                      {est.ultimo_pago.estado}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}