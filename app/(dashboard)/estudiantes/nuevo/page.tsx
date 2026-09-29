'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save, User, GraduationCap, CheckCircle2, CreditCard, DollarSign, RefreshCw } from 'lucide-react';

const PERIODOS = [1, 2, 3, 4, 5, 6];
const METODOS_USD = ['Efectivo USD', 'Zelle'];
const METODOS_BS = ['Pago Móvil', 'Transferencia Bs'];

interface Materia {
  id: string;
  codigo: string;
  nombre: string;
}

interface ConfigData {
  costo_inscripcion: string;
  tasa_cambio: string;
}

export default function NuevoEstudiantePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [periodo, setPeriodo] = useState(1);
  const [obligatorias, setObligatorias] = useState<Materia[]>([]);
  const [complementarias, setComplementarias] = useState<Materia[]>([]);
  const [materiaSeleccionada, setMateriaSeleccionada] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<ConfigData>({ costo_inscripcion: '25', tasa_cambio: '480' });

  const [formData, setFormData] = useState({
    cedula: '',
    cedula_escolar: '',
    apellidos: '',
    nombres: '',
    fecha_nacimiento: '',
    genero: '',
  });

  const [pagoData, setPagoData] = useState({
    monto: '',
    metodo_pago: '',
    referencia: '',
    fecha_pago: new Date().toISOString().split('T')[0],
    moneda: 'USD' as 'USD' | 'Bs',
    monto_bs: '',
    tasa_cambio_usada: '',
  });

  // Cargar configuración al iniciar
  useEffect(() => {
    fetch('/api/configuracion')
      .then(r => r.json())
      .then(data => {
        if (data.costo_inscripcion) {
          setConfig({
            costo_inscripcion: data.costo_inscripcion,
            tasa_cambio: data.tasa_cambio || '480'
          });
          setPagoData(prev => ({
            ...prev,
            monto: data.costo_inscripcion,
            tasa_cambio_usada: data.tasa_cambio || '480'
          }));
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch(`/api/periodos/${periodo}/materias`)
      .then(r => r.json())
      .then(d => {
        setObligatorias(d.obligatorias || []);
        setComplementarias(d.complementarias || []);
        setMateriaSeleccionada(null); // Resetear selección
      })
      .catch(console.error);
  }, [periodo]);

  // Calcular Bs esperados automáticamente
  useEffect(() => {
    if (pagoData.moneda === 'Bs' && pagoData.monto && pagoData.tasa_cambio_usada) {
      const esperado = parseFloat(pagoData.monto) * parseFloat(pagoData.tasa_cambio_usada);
      // Solo autocompletar si el usuario no ha escrito nada o quiere recalcular
      if (!pagoData.monto_bs) {
        setPagoData(prev => ({ ...prev, monto_bs: esperado.toFixed(2) }));
      }
    }
  }, [pagoData.moneda, pagoData.monto, pagoData.tasa_cambio_usada]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePagoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPagoData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'moneda') {
        updated.metodo_pago = value === 'USD' ? 'Efectivo USD' : 'Pago Móvil';
        updated.monto_bs = '';
      }
      if (name === 'monto' && updated.moneda === 'Bs') {
        const esperado = parseFloat(value || '0') * parseFloat(updated.tasa_cambio_usada || '0');
        updated.monto_bs = esperado > 0 ? esperado.toFixed(2) : '';
      }
      return updated;
    });
  };

  const validarPago = () => {
    if (!pagoData.monto || !pagoData.metodo_pago) return 'Monto y método de pago son obligatorios';
    if (pagoData.moneda === 'Bs') {
      const esperado = parseFloat(pagoData.monto) * parseFloat(pagoData.tasa_cambio_usada);
      const recibido = parseFloat(pagoData.monto_bs);
      if (Math.abs(esperado - recibido) > 0.01) {
        return `Monto en Bs no coincide. Esperado: ${esperado.toFixed(2)} Bs`;
      }
    }
    return '';
  };

  const handleSubmit = async () => {
    const validationError = validarPago();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError('');
    try {
      const payload: any = {
        ...formData,
        periodo_id: periodo,
        materias_complementarias: materiaSeleccionada ? [materiaSeleccionada] : [],
        pago: {
          monto: parseFloat(pagoData.monto),
          metodo_pago: pagoData.metodo_pago,
          referencia: pagoData.referencia,
          fecha_pago: pagoData.fecha_pago,
          monto_bs: pagoData.moneda === 'Bs' ? parseFloat(pagoData.monto_bs) : null,
          tasa_cambio_usada: pagoData.moneda === 'Bs' ? parseFloat(pagoData.tasa_cambio_usada) : null,
        }
      };

      const res = await fetch('/api/estudiantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar');
      router.push(`/pagos/${data.estudiante.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
  const labelClass = "text-xs font-bold text-slate-500 uppercase tracking-wider";

  const canGoNext = () => {
    return formData.cedula && formData.apellidos && formData.nombres && formData.genero;
  };

  const metodosActuales = pagoData.moneda === 'USD' ? METODOS_USD : METODOS_BS;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()}
          className="p-2 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-slate-200 shadow-sm">
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Nuevo Estudiante</h1>
          <p className="text-slate-500 text-sm">Inscripción con pago obligatorio</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {[{n:1,l:'Datos del alumno'},{n:2,l:'Pago de inscripción'},{n:3,l:'Confirmación'}].map(({n,l}) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              step === n ? 'bg-blue-900 text-white shadow-lg' : 
              step > n ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
              'bg-white text-slate-400 border border-slate-200'
            }`}>
              {step > n ? <CheckCircle2 size={16} /> : 
               <span className="w-5 h-5 flex items-center justify-center rounded-full border-2 border-current text-xs">{n}</span>}
              <span className="hidden sm:block">{l}</span>
            </div>
            {n < 3 && <div className="flex-1 h-px bg-slate-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl font-medium">
          ⚠️ {error}
        </div>
      )}

      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><User size={22} className="text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Datos Personales</h2>
              <p className="text-sm text-slate-500">Información básica del estudiante</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className={labelClass}>Cédula de Identidad *</label>
              <input name="cedula" value={formData.cedula} onChange={handleChange} placeholder="V-12345678" className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Cédula Escolar (Histórico)</label>
              <input name="cedula_escolar" value={formData.cedula_escolar} onChange={handleChange} placeholder="E-12345678 (opcional)" className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Apellidos *</label>
              <input name="apellidos" value={formData.apellidos} onChange={handleChange} placeholder="García López" className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Nombres *</label>
              <input name="nombres" value={formData.nombres} onChange={handleChange} placeholder="Carlos Andrés" className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Fecha de Nacimiento</label>
              <input type="date" name="fecha_nacimiento" value={formData.fecha_nacimiento} onChange={handleChange} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Género *</label>
              <select name="genero" value={formData.genero} onChange={handleChange} className={inputClass}>
                <option value="">Seleccionar...</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className={labelClass}>Período Académico *</label>
              <div className="grid grid-cols-6 gap-2">
                {PERIODOS.map(p => (
                  <button key={p} type="button" onClick={() => setPeriodo(p)}
                    className={`py-2 px-1 rounded-xl text-sm font-bold border-2 transition-all ${
                      periodo === p ? 'border-blue-600 bg-blue-600 text-white shadow-lg' :
                      'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                    }`}>{p}</button>
                ))}
              </div>
            </div>
            {obligatorias.length > 0 && (
              <div className="md:col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-blue-700 uppercase">✓ Materias Obligatorias ({obligatorias.length})</p>
                <div className="flex flex-wrap gap-2">
                  {obligatorias.map(m => (
                    <span key={m.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white border border-blue-200 text-blue-700">
                      ✓ {m.nombre}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {complementarias.length > 0 && (
              <div className="md:col-span-2 bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-violet-700 uppercase">Materia Complementaria (Opcional)</p>
                <div className="space-y-2">
                  {complementarias.map(m => (
                    <label key={m.id} className="flex items-center gap-3 p-2 hover:bg-white/50 rounded-lg cursor-pointer transition">
                      <input
                        type="radio"
                        name="complementaria"
                        checked={materiaSeleccionada === m.id}
                        onChange={() => setMateriaSeleccionada(m.id)}
                        className="w-4 h-4 text-violet-600 rounded-full cursor-pointer"
                      />
                      <span className="text-sm text-slate-700 font-medium">{m.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button onClick={() => { if (!canGoNext()) { setError('Completa todos los campos obligatorios (*)'); return; } setError(''); setStep(2); }}
              className="px-6 py-3 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-950 transition-all shadow-lg flex items-center gap-2">
              Siguiente: Registrar Pago →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg"><CreditCard size={22} className="text-amber-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Pago de Inscripción</h2>
              <p className="text-sm text-slate-500">Obligatorio para completar la inscripción</p>
            </div>
          </div>

          {/* Selector de moneda */}
          <div className="grid grid-cols-2 gap-4">
            <button type="button" onClick={() => handlePagoChange({target:{name:'moneda',value:'USD'}} as any)}
              className={`p-4 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                pagoData.moneda === 'USD' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300'
              }`}>
              <DollarSign size={18} /> Dólares (USD)
            </button>
            <button type="button" onClick={() => handlePagoChange({target:{name:'moneda',value:'Bs'}} as any)}
              className={`p-4 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                pagoData.moneda === 'Bs' ? 'border-amber-600 bg-amber-50 text-amber-700' : 'border-slate-200 hover:border-slate-300'
              }`}>
              <RefreshCw size={18} /> Bolívares (Bs)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className={labelClass}>Monto en USD *</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="monto" type="number" step="0.01" value={pagoData.monto}
                  readOnly
                  onChange={handlePagoChange} placeholder="0.00"
                  className={`${inputClass} pl-10`} />
              </div>
              <p className="text-[10px] text-slate-400">Costo de inscripción configurado: {config.costo_inscripcion}$</p>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>Método de Pago *</label>
              <select name="metodo_pago" value={pagoData.metodo_pago}
                onChange={handlePagoChange} className={inputClass}>
                {metodosActuales.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {pagoData.moneda === 'Bs' && (
              <>
                <div className="space-y-2">
                  <label className={labelClass}>Tasa de Cambio (Bs/USD) *</label>
                  <div className="relative">
                    <RefreshCw size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input name="tasa_cambio_usada" type="number" step="0.01"
                      readOnly 
                      value={pagoData.tasa_cambio_usada} onChange={handlePagoChange}
                      className={`${inputClass} pl-10`} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Monto en Bs recibido *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Bs</span>
                    <input name="monto_bs" type="number" step="0.01" 
                      readOnly
                      value={pagoData.monto_bs} onChange={handlePagoChange}
                      className={`${inputClass} pl-10`} />
                  </div>
                  {pagoData.monto && pagoData.tasa_cambio_usada && (
                    <p className="text-[10px] text-slate-500">
                      Monto calculado a la tasa actual: {config.costo_inscripcion} * {config.tasa_cambio} Bs
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className={labelClass}>Referencia / Número de Operación</label>
              <input name="referencia" value={pagoData.referencia}
                onChange={handlePagoChange} placeholder="Transferencia #12345" className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Fecha del Pago</label>
              <input type="date" name="fecha_pago" value={pagoData.fecha_pago}
                onChange={handlePagoChange} className={inputClass} />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <div className="text-amber-600 text-lg">ℹ️</div>
            <div>
              <p className="text-sm font-semibold text-amber-800">Importante</p>
              <p className="text-xs text-amber-700 mt-1">
                El estudiante quedará en estado <strong>"En verificación"</strong> hasta que un administrador confirme el pago.
                {pagoData.moneda === 'Bs' && (
                  <> El sistema validará que los Bs reportados coincidan exactamente con: <strong>{pagoData.monto}$ × {pagoData.tasa_cambio_usada} Bs/USD</strong>.</>
                )}
              </p>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-100">
            <button onClick={() => setStep(1)} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50">← Atrás</button>
            <button onClick={() => {
                const err = validarPago();
                if (err) { setError(err); return; }
                setError(''); setStep(3);
              }}
              className="px-6 py-3 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-950 shadow-lg flex items-center gap-2">
              Revisar y Confirmar →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle2 size={22} className="text-emerald-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Confirmar Inscripción</h2>
              <p className="text-sm text-slate-500">Revisa los datos antes de guardar</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estudiante</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-slate-500">Nombre:</span>
              <span className="font-semibold text-slate-900">{formData.apellidos} {formData.nombres}</span>
              <span className="text-slate-500">Cédula:</span>
              <span className="font-semibold text-slate-900">{formData.cedula}</span>
              <span className="text-slate-500">Período:</span>
              <span className="font-semibold text-blue-600">Período {periodo}</span>
              <span className="text-slate-500">Materias:</span>
              <span className="font-semibold text-slate-900">{obligatorias.length} obligatorias{materiaSeleccionada ? ' + 1 complementaria' : ''}</span>
            </div>
          </div>

          <div className={`${pagoData.moneda === 'Bs' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'} border rounded-xl p-4 space-y-3`}>
            <p className={`text-xs font-bold uppercase tracking-wider ${pagoData.moneda === 'Bs' ? 'text-amber-700' : 'text-blue-700'}`}>Pago Registrado</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className={pagoData.moneda === 'Bs' ? 'text-amber-800' : 'text-blue-800'}>Monto USD:</span>
              <span className={`font-semibold ${pagoData.moneda === 'Bs' ? 'text-amber-900' : 'text-blue-900'}`}>{pagoData.monto}$</span>
              <span className={pagoData.moneda === 'Bs' ? 'text-amber-800' : 'text-blue-800'}>Método:</span>
              <span className={`font-semibold ${pagoData.moneda === 'Bs' ? 'text-amber-900' : 'text-blue-900'}`}>{pagoData.metodo_pago}</span>
              {pagoData.moneda === 'Bs' && (
                <>
                  <span className="text-amber-800">Tasa usada:</span>
                  <span className="font-semibold text-amber-900">{pagoData.tasa_cambio_usada} Bs/USD</span>
                  <span className="text-amber-800">Monto Bs:</span>
                  <span className="font-semibold text-amber-900">{pagoData.monto_bs} Bs</span>
                </>
              )}
              <span className={pagoData.moneda === 'Bs' ? 'text-amber-800' : 'text-blue-800'}>Referencia:</span>
              <span className={`font-semibold ${pagoData.moneda === 'Bs' ? 'text-amber-900' : 'text-blue-900'}`}>{pagoData.referencia || 'N/A'}</span>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50">← Atrás</button>
            <button onClick={handleSubmit} disabled={loading}
              className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50">
              {loading ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <Save size={18} />}
              {loading ? 'Guardando...' : 'Confirmar e Inscribir'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}