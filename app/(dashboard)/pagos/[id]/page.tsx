'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft, CheckCircle2, XCircle, AlertCircle, Plus, Download, Clock, DollarSign, RefreshCw, Tag } from 'lucide-react';

interface ConfigData {
  tasa_cambio: string;
  monto_mensualidad: string;
}

export default function DetallePagoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<ConfigData>({ tasa_cambio: '480', monto_mensualidad: '25' });
  
  const [nuevoPago, setNuevoPago] = useState({
    concepto: '',
    monto_original: '',
    descuento: '0',
    monto_neto: '',
    moneda: 'USD' as 'USD' | 'Bs',
    metodo_pago: 'Efectivo USD',
    referencia: '',
    monto_bs: '',
    tasa_cambio_usada: '',
  });

  useEffect(() => { cargarDatos(); cargarConfig(); }, [id]);

  const cargarConfig = async () => {
    try {
      const res = await fetch('/api/configuracion');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar configuración');

      setConfig({
        tasa_cambio: data.tasa_cambio || '480',
        monto_mensualidad: data.monto_mensualidad || '25'
      });
      setNuevoPago(prev => ({
        ...prev,
        tasa_cambio_usada: data.tasa_cambio || '480',
        monto_original: data.monto_mensualidad || '25',
        monto_neto: data.monto_mensualidad || '25'
      }));
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'No se pudo cargar la configuración');
    }
  };

  const cargarDatos = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/pagos/estudiante/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar datos de pagos');
      if (!json.estudiante) throw new Error('Estudiante no encontrado');
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudieron cargar los datos');
    } finally { setLoading(false); }
  };

  const verificarPago = async (pagoId: string, estado: 'confirmado' | 'rechazado') => {
    try {
      const res = await fetch(`/api/pagos/${pagoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
      });
      if (res.ok) cargarDatos();
    } catch (err) { console.error(err); }
  };

  const calcularNeto = (original: string, descuento: string) => {
    const o = parseFloat(original || '0');
    const d = parseFloat(descuento || '0');
    return Math.max(0, o - d).toFixed(2);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNuevoPago(prev => {
      const updated = { ...prev, [name]: value };
      
      if (name === 'monto_original' || name === 'descuento') {
        updated.monto_neto = calcularNeto(
          name === 'monto_original' ? value : prev.monto_original,
          name === 'descuento' ? value : prev.descuento
        );
      }
      
      if (name === 'moneda') {
        updated.metodo_pago = value === 'USD' ? 'Efectivo USD' : 'Pago Móvil';
        updated.monto_bs = '';
      }
      
      if ((name === 'monto_neto' || name === 'tasa_cambio_usada') && updated.moneda === 'Bs') {
        const neto = parseFloat(updated.monto_neto || '0');
        const tasa = parseFloat(updated.tasa_cambio_usada || '0');
        if (neto > 0 && tasa > 0) {
          updated.monto_bs = (neto * tasa).toFixed(2);
        }
      }
      
      return updated;
    });
  };

  const validarFormulario = () => {
    if (!nuevoPago.concepto || !nuevoPago.monto_neto) return 'Concepto y monto son obligatorios';
    if (parseFloat(nuevoPago.monto_neto) <= 0) return 'El monto neto debe ser mayor a 0';
    if (nuevoPago.moneda === 'Bs') {
      const esperado = parseFloat(nuevoPago.monto_neto) * parseFloat(nuevoPago.tasa_cambio_usada);
      const recibido = parseFloat(nuevoPago.monto_bs);
      if (Math.abs(esperado - recibido) > 0.01) {
        return `Monto en Bs incorrecto. Esperado: ${esperado.toFixed(2)} Bs`;
      }
    }
    return '';
  };

  const registrarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validarFormulario();
    if (error) { alert(error); return; }

    try {
      const payload: any = {
        estudiante_id: id,
        tipo: 'mensualidad',
        concepto: nuevoPago.concepto,
        monto: parseFloat(nuevoPago.monto_neto),
        monto_original_usd: parseFloat(nuevoPago.monto_original),
        descuento_aplicado: parseFloat(nuevoPago.descuento),
        metodo_pago: nuevoPago.metodo_pago,
        referencia: nuevoPago.referencia,
        monto_bs: nuevoPago.moneda === 'Bs' ? parseFloat(nuevoPago.monto_bs) : null,
        tasa_cambio_usada: nuevoPago.moneda === 'Bs' ? parseFloat(nuevoPago.tasa_cambio_usada) : null,
      };

      const res = await fetch('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al registrar pago');

      setShowForm(false);
      setNuevoPago({
        concepto: '', monto_original: config.monto_mensualidad, descuento: '0',
        monto_neto: config.monto_mensualidad, moneda: 'USD', metodo_pago: 'Efectivo USD',
        referencia: '', monto_bs: '', tasa_cambio_usada: config.tasa_cambio
      });
      cargarDatos();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al registrar pago');
    }
  };

  const getEstadoBadge = (estado: string) => {
    const styles = {
      confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      verificacion: 'bg-amber-50 text-amber-700 border-amber-200',
      rechazado: 'bg-rose-50 text-rose-700 border-rose-200',
      pendiente: 'bg-slate-50 text-slate-600 border-slate-200'
    };
    return styles[estado as keyof typeof styles] || styles.pendiente;
  };

  if (loading || !data) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
    </div>
  );

  if (error) return (
    <div className="max-w-3xl mx-auto py-12 px-6 bg-red-50 border border-red-200 rounded-3xl text-red-700 text-center">
      <p className="font-bold mb-2">Error al cargar pagos</p>
      <p>{error}</p>
    </div>
  );

  const { estudiante, pagos, resumen } = data;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/pagos')}
          className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 shadow-sm">
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{estudiante.apellidos} {estudiante.nombres}</h1>
          <p className="text-slate-500 text-sm">Cédula: {estudiante.cedula} • {estudiante.periodo_id ? `Período ${estudiante.periodo_id}` : `${estudiante.grado || ''} ${estudiante.seccion || ''}`.trim()}</p>
        </div>
      </div>

      {/* RESUMEN FINANCIERO: 4 TARJETAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ESTADO */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase">Estado</p>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border mt-2 ${getEstadoBadge(estudiante.estado)}`}>
            {estudiante.estado === 'activo' ? <CheckCircle2 size={12} /> : 
             estudiante.estado === 'deuda' ? <AlertCircle size={12} /> : <Clock size={12} />}
            {estudiante.estado === 'activo' ? 'Activo' : 
             estudiante.estado === 'deuda' ? 'En Deuda' : 'En Verificación'}
          </span>
        </div>

        {/* TOTAL PAGADO */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase">Total Pagado</p>
          <p className="text-2xl font-extrabold text-emerald-600">{parseFloat(resumen.total_pagado).toFixed(2)}$</p>
        </div>

        {/* DEUDA ACTUAL: mensualidad del mes en curso */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase">Deuda Actual</p>
          <p className={`text-2xl font-extrabold ${parseFloat(resumen.deuda_actual) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {parseFloat(resumen.deuda_actual).toFixed(2)}$
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            {parseFloat(resumen.deuda_actual) > 0 ? 'Mensualidad del mes (vence día 30)' : 'Mensualidad al día'}
          </p>
        </div>

        {/* DEUDA TOTAL: semestre completo menos pagos */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase">Deuda Total</p>
          <p className={`text-2xl font-extrabold ${parseFloat(resumen.deuda_total) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {parseFloat(resumen.deuda_total).toFixed(2)}$
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Semestre menos pagos confirmados</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 flex items-center gap-2">
          <Plus size={18} /> Registrar Mensualidad
        </button>
        <button onClick={() => {
            const csv = pagos.map((p: any) => 
              `${p.fecha_pago},${p.concepto},${p.monto},${p.metodo_pago},${p.estado},${p.referencia || ''},${p.monto_bs || ''},${p.tasa_cambio_usada || ''}`
            ).join('\n');
            const blob = new Blob([`Fecha,Concepto,Monto,Metodo,Estado,Referencia,Monto_Bs,Tasa\n${csv}`], { type: 'text/csv' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `historial_${estudiante.cedula}.csv`;
            link.click();
          }}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 flex items-center gap-2">
          <Download size={18} /> Exportar Historial
        </button>
      </div>

      {showForm && (
        <form onSubmit={registrarPago} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Tag size={18} /> Registrar Nueva Mensualidad
          </h3>
          
          {/* Selector de moneda */}
          <div className="grid grid-cols-2 gap-4">
            <button type="button" onClick={() => handleChange({target:{name:'moneda',value:'USD'}} as any)}
              className={`p-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                nuevoPago.moneda === 'USD' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300'
              }`}>
              <DollarSign size={16} /> Dólares (USD)
            </button>
            <button type="button" onClick={() => handleChange({target:{name:'moneda',value:'Bs'}} as any)}
              className={`p-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                nuevoPago.moneda === 'Bs' ? 'border-amber-600 bg-amber-50 text-amber-700' : 'border-slate-200 hover:border-slate-300'
              }`}>
              <RefreshCw size={16} /> Bolívares (Bs)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input required placeholder="Concepto (ej: Abril 2026)" value={nuevoPago.concepto}
              onChange={handleChange} name="concepto"
              className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            
            <input required type="number" step="0.01" placeholder="Monto Original USD" 
              name="monto_original" value={nuevoPago.monto_original} onChange={handleChange}
              className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            
            <input type="number" step="0.01" placeholder="Descuento USD" 
              name="descuento" value={nuevoPago.descuento} onChange={handleChange}
              className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <input type="number" step="0.01" readOnly placeholder="Monto Neto" 
                name="monto_neto" value={nuevoPago.monto_neto}
                className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700" />
            </div>
            
            <select name="metodo_pago" value={nuevoPago.metodo_pago} onChange={handleChange}
              className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500">
              {nuevoPago.moneda === 'USD' ? (
                <><option>Efectivo USD</option><option>Zelle</option></>
              ) : (
                <><option>Pago Móvil</option><option>Transferencia Bs</option></>
              )}
            </select>

            <input placeholder="Referencia" name="referencia" value={nuevoPago.referencia}
              onChange={handleChange}
              className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
          </div>

          {nuevoPago.moneda === 'Bs' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-amber-700 uppercase">Tasa de Cambio (Bs/USD)</label>
                <input type="number" step="0.01" name="tasa_cambio_usada" 
                  value={nuevoPago.tasa_cambio_usada} onChange={handleChange}
                  readOnly
                  className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-amber-700 uppercase">Monto en Bs recibido *</label>
                <input type="number" step="0.01" name="monto_bs" 
                  value={nuevoPago.monto_bs} onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl text-sm focus:outline-none focus:border-amber-500" />
                <p className="text-[10px] text-amber-600">
                  Esperado: {(parseFloat(nuevoPago.monto_neto||'0') * parseFloat(nuevoPago.tasa_cambio_usada||'0')).toFixed(2)} Bs
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 flex items-center gap-2">
              <CheckCircle2 size={18} /> Guardar Pago
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Historial de Pagos</h3>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">Fecha</th>
              <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">Concepto</th>
              <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">Monto</th>
              <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase hidden md:table-cell">Divisa</th>
              <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">Estado</th>
              <th className="text-right py-3 px-6 text-xs font-bold text-slate-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagos.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400 text-sm">No hay pagos registrados</td></tr>
            ) : (
              pagos.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-6 text-sm text-slate-600">{new Date(p.fecha_pago).toLocaleDateString()}</td>
                  <td className="py-3 px-6 text-sm font-medium text-slate-900">
                    {p.concepto}
                    {parseFloat(p.descuento_aplicado || 0) > 0 && (
                      <span className="block text-[10px] text-emerald-600 font-semibold">
                        Descuento: -{parseFloat(p.descuento_aplicado).toFixed(2)}$
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-sm font-bold text-slate-900">
                    {parseFloat(p.monto).toFixed(2)}$
                    {p.monto_bs && (
                      <span className="block text-[10px] text-amber-600 font-medium">
                        {parseFloat(p.monto_bs).toFixed(2)} Bs
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-sm text-slate-500 hidden md:table-cell">
                    {p.monto_bs ? (
                      <span className="flex items-center gap-1 text-amber-600">
                        <RefreshCw size={10} /> {p.tasa_cambio_usada}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-blue-600">
                        <DollarSign size={10} /> USD
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-6">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${getEstadoBadge(p.estado)}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-right">
                    {p.estado === 'verificacion' && (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => verificarPago(p.id, 'confirmado')}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Confirmar">
                          <CheckCircle2 size={18} />
                        </button>
                        <button onClick={() => verificarPago(p.id, 'rechazado')}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Rechazar">
                          <XCircle size={18} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}