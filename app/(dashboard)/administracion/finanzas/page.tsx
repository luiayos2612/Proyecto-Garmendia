'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, Save, DollarSign, TrendingUp, BookOpen, 
  RefreshCw, AlertCircle, CheckCircle2, Info, Calculator
} from 'lucide-react';

interface ConfigData {
  costo_inscripcion: string;
  costo_semestre: string;
  tasa_cambio: string;
  monto_mensualidad: string;
}

export default function finanzasPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigData>({
    costo_inscripcion: '25',
    costo_semestre: '150',
    tasa_cambio: '480',
    monto_mensualidad: '25'
  });
  const [originalConfig, setOriginalConfig] = useState<ConfigData>(config);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  useEffect(() => { cargarConfig(); }, []);

  const cargarConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/configuracion');
      const data = await res.json();
      if (res.ok) {
        const newConfig = {
          costo_inscripcion: data.costo_inscripcion || '25',
          costo_semestre: data.costo_semestre || '150',
          tasa_cambio: data.tasa_cambio || '480',
          monto_mensualidad: data.monto_mensualidad || '25'
        };
        setConfig(newConfig);
        setOriginalConfig(newConfig);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error al cargar configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'costo_semestre' && value) {
        updated.monto_mensualidad = (parseFloat(value) / 6).toFixed(2);
      }
      return updated;
    });
  };

  const guardarConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/configuracion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok) {
        setOriginalConfig(config);
        setMessage({ type: 'success', text: 'Configuración guardada correctamente' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al guardar' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const hayCambios = JSON.stringify(config) !== JSON.stringify(originalConfig);

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <Settings size={28} className="text-blue-900" />
          Finanzas
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Configura los montos y tasas que regulan el flujo de pagos del sistema
        </p>
      </div>

      {/* Mensaje */}
      {message && (
        <div className={`px-4 py-3 rounded-xl font-medium flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Inscripción', value: `${parseFloat(config.costo_inscripcion).toFixed(2)}$`, icon: <BookOpen size={20} />, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Semestre', value: `${parseFloat(config.costo_semestre).toFixed(2)}$`, icon: <TrendingUp size={20} />, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Mensualidad', value: `${parseFloat(config.monto_mensualidad).toFixed(2)}$`, icon: <DollarSign size={20} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Tasa Bs/USD', value: `${parseFloat(config.tasa_cambio).toFixed(2)}`, icon: <RefreshCw size={20} />, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>{stat.icon}</div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{stat.label}</p>
              <p className="text-xl font-extrabold text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg"><Calculator size={22} className="text-blue-600" /></div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Parámetros Financieros</h2>
            <p className="text-sm text-slate-500">Estos valores afectan el cálculo automático de deudas y estados de estudiantes</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Costo de Inscripción (USD) *
            </label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="number" step="0.01" name="costo_inscripcion"
                value={config.costo_inscripcion}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Costo del Semestre (USD) *
            </label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="number" step="0.01" name="costo_semestre"
                value={config.costo_semestre}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400">La mensualidad se recalcula automáticamente: Semestre ÷ 6</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Monto de Mensualidad (USD)
            </label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="number" step="0.01" name="monto_mensualidad"
                value={config.monto_mensualidad}
                readOnly
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400">Auto-calculado, pero puedes ajustarlo manualmente</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tasa de Cambio (Bs / USD) *
            </label>
            <div className="relative">
              <RefreshCw size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="number" step="0.01" name="tasa_cambio"
                value={config.tasa_cambio}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400">Usada para validar pagos en Pago Móvil / Transferencia</p>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button 
            onClick={guardarConfig}
            disabled={saving || !hayCambios}
            className="px-6 py-3 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-950 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <Save size={18} />}
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>

      {/* Info del flujo */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Info size={18} className="text-slate-500" />
          <h3 className="font-bold text-slate-700">¿Cómo afecta esto al sistema?</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="font-bold text-slate-900 mb-1">1. Inscripción</p>
            <p>Al registrar un estudiante, el sistema exige el pago de inscripción (<strong>{parseFloat(config.costo_inscripcion).toFixed(2)}$</strong>). Estado inicial: <span className="font-semibold text-amber-600">Verificación</span>.</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="font-bold text-slate-900 mb-1">2. Deuda Automática</p>
            <p>El sistema calcula: <strong>meses activos × {parseFloat(config.monto_mensualidad).toFixed(2)}$</strong>. Si el estudiante debe, su estado cambia a <span className="font-semibold text-rose-600">Deuda</span>.</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="font-bold text-slate-900 mb-1">3. Pagos en Bs</p>
            <p>Cuando paguen en bolívares, el sistema valida que: <strong>monto USD × {parseFloat(config.tasa_cambio).toFixed(2)}</strong> coincida exactamente con los Bs reportados.</p>
          </div>
        </div>
      </div>
    </div>
  );
}