'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useRouter, useParams } from 'next/navigation';

import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Download,
  Clock,
  DollarSign,
  RefreshCw,
  Tag,
  Loader2,
} from 'lucide-react';

type Importe = number | string;

interface CuotaPago {
  id: string;
  tipo_cuota: string;
  numero_mensualidad: number | null;
  monto: Importe;
  estado: string;
  pago_en_verificacion?: boolean;
}

interface Estudiante {
  id: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  estado: string;
  periodo_id: number;
  intento_id?: string;
  numero_intento?: number;
}

interface Intento {
  id: string;
  periodo_id: number;
  numero_intento: number;
  ano_escolar: string | null;
}

interface Pago {
  id: string;
  concepto: string;
  monto: Importe;
  monto_original_usd?: Importe | null;
  descuento_aplicado?: Importe | null;
  monto_bs?: Importe | null;
  tasa_cambio_usada?: Importe | null;
  metodo_pago: string;
  referencia?: string | null;
  fecha_pago: string;
  estado: string;
}

interface Resumen {
  total_pagado: Importe;
  deuda_total: Importe;
  deuda_exigible?: Importe;
  cuotas_pendientes: Importe;
  cuotas_exigibles_pendientes?: Importe;
  mensualidades_pagadas?: Importe;
}

interface DatosFinancieros {
  estudiante: Estudiante;
  intento?: Intento;
  pagos: Pago[];
  cuotas: CuotaPago[];
  resumen: Resumen;
}

interface FormularioPago {
  seleccion: string;
  descuento: string;
  moneda: 'USD' | 'Bs';
  metodo_pago: string;
  referencia: string;
  monto_bs: string;
}

const formularioInicial: FormularioPago = {
  seleccion: '',
  descuento: '0',
  moneda: 'USD',
  metodo_pago: 'Efectivo USD',
  referencia: '',
  monto_bs: '',
};

function numeroSeguro(
  valor: Importe | null | undefined
): number {
  const numero = Number(valor ?? 0);

  return Number.isFinite(numero) ? numero : 0;
}

function dinero(
  valor: Importe | null | undefined
): string {
  return numeroSeguro(valor).toFixed(2);
}

function importeValido(
  valor: string,
  permitirCero = false
): boolean {
  if (valor.trim() === '') return false;

  const numero = Number(valor);

  return (
    Number.isFinite(numero) &&
    (permitirCero ? numero >= 0 : numero > 0) &&
    Math.abs(
      numero * 100 - Math.round(numero * 100)
    ) <= 0.000001
  );
}

function fechaVisible(valor: string): string {
  const fecha = valor.split('T')[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [ano, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  return valor || '—';
}

async function leerRespuesta(res: Response) {
  const texto = await res.text();

  let respuesta;

  try {
    respuesta = texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error(
      `El servidor devolvió una respuesta no válida. HTTP ${res.status}.`
    );
  }

  if (!res.ok) {
    throw new Error(
      respuesta.error ||
        `No se pudo completar la solicitud. HTTP ${res.status}.`
    );
  }

  return respuesta;
}

function estadoBadge(estado: string): string {
  const estilos: Record<string, string> = {
    activo:
      'bg-emerald-50 text-emerald-700 border-emerald-200',
    deuda:
      'bg-rose-50 text-rose-700 border-rose-200',
    confirmado:
      'bg-emerald-50 text-emerald-700 border-emerald-200',
    verificacion:
      'bg-amber-50 text-amber-700 border-amber-200',
    rechazado:
      'bg-rose-50 text-rose-700 border-rose-200',
    pendiente:
      'bg-slate-50 text-slate-600 border-slate-200',
  };

  return estilos[estado] || estilos.pendiente;
}

function celdaCsv(valor: unknown): string {
  let texto = valor == null ? '' : String(valor);

  // Evitar interpretar textos exportados como fórmulas.
  if (
    typeof valor === 'string' &&
    /^[=+\-@\t\r]/.test(texto)
  ) {
    texto = `'${texto}`;
  }

  return `"${texto.replace(/"/g, '""')}"`;
}

export default function DetallePagoPage() {
  const router = useRouter();
  const params = useParams();

  const id = params.id as string;

  const [data, setData] =
    useState<DatosFinancieros | null>(null);

  const [loading, setLoading] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tasaCambio, setTasaCambio] = useState('');
  const [errorConfig, setErrorConfig] = useState('');

  const [guardando, setGuardando] = useState(false);

  const [verificandoId, setVerificandoId] =
    useState<string | null>(null);

  const [nuevoPago, setNuevoPago] =
    useState<FormularioPago>(formularioInicial);

  const operacionEnCurso = useRef(false);

  const cargarDatos = useCallback(
    async (
      signal?: AbortSignal,
      cargaInicial = false
    ): Promise<boolean> => {
      if (!id) return false;

      if (cargaInicial) {
        setLoading(true);
      } else {
        setRecargando(true);
      }

      try {
        const res = await fetch(
          `/api/pagos/estudiante/${id}`,
          {
            cache: 'no-store',
            signal,
          }
        );

        const respuesta = await leerRespuesta(res);

        if (signal?.aborted) return false;

        if (
          !respuesta.estudiante ||
          !respuesta.resumen ||
          !Array.isArray(respuesta.pagos)
        ) {
          throw new Error(
            'La API no devolvió una ficha financiera válida.'
          );
        }

        if (!Array.isArray(respuesta.cuotas)) {
          throw new Error(
            'La API no devolvió las cuotas. ' +
              'Revise la actualización de ' +
              'app/api/pagos/estudiante/[id]/route.ts.'
          );
        }

        setData(respuesta as DatosFinancieros);

        return true;
      } catch (err: unknown) {
        if (signal?.aborted) return false;

        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los datos de pagos.'
        );

        return false;
      } finally {
        if (!signal?.aborted) {
          if (cargaInicial) {
            setLoading(false);
          } else {
            setRecargando(false);
          }
        }
      }
    },
    [id]
  );

  useEffect(() => {
    const controller = new AbortController();

    setData(null);
    setError('');
    setSuccess('');
    setShowForm(false);
    setNuevoPago({ ...formularioInicial });

    void cargarDatos(controller.signal, true);

    const cargarConfiguracion = async () => {
      setErrorConfig('');
      setTasaCambio('');

      try {
        const res = await fetch('/api/configuracion', {
          cache: 'no-store',
          signal: controller.signal,
        });

        const respuesta = await leerRespuesta(res);

        if (controller.signal.aborted) return;

        const tasa = Number(respuesta.tasa_cambio);

        if (!Number.isFinite(tasa) || tasa <= 0) {
          throw new Error(
            'La tasa de cambio no está configurada correctamente. ' +
              'Puede registrar en USD; para bolívares revise la configuración.'
          );
        }

        setTasaCambio(String(respuesta.tasa_cambio));
      } catch (err: unknown) {
        if (controller.signal.aborted) return;

        setErrorConfig(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la tasa de cambio.'
        );
      }
    };

    void cargarConfiguracion();

    return () => controller.abort();
  }, [cargarDatos]);

  const mensualidadesPendientes = (
    data?.cuotas || []
  ).filter(
    (cuota) =>
      cuota.tipo_cuota === 'mensualidad' &&
      ['pendiente', 'vencida'].includes(cuota.estado)
  );

  const cuotasDisponibles =
    mensualidadesPendientes.filter(
      (cuota) => !cuota.pago_en_verificacion
    );

  const hayComprobantesPendientes =
    mensualidadesPendientes.some(
      (cuota) => cuota.pago_en_verificacion
    );

  const esSemestre =
    nuevoPago.seleccion === 'semestre';

  const cuotaSeleccionada =
    cuotasDisponibles.find(
      (cuota) => cuota.id === nuevoPago.seleccion
    );

  const cuotasSeleccionadas: CuotaPago[] =
    esSemestre
      ? mensualidadesPendientes
      : cuotaSeleccionada
        ? [cuotaSeleccionada]
        : [];

  const montoOriginalCentavos =
    cuotasSeleccionadas.reduce(
      (total, cuota) =>
        total +
        Math.round(numeroSeguro(cuota.monto) * 100),
      0
    );

  const montoOriginal =
    montoOriginalCentavos / 100;

  const descuentoNumero = Number(
    nuevoPago.descuento === ''
      ? 0
      : nuevoPago.descuento
  );

  const descuentoCentavos =
    Number.isFinite(descuentoNumero)
      ? Math.round(descuentoNumero * 100)
      : 0;

  const montoNetoCentavos = Math.max(
    0,
    montoOriginalCentavos - descuentoCentavos
  );

  const montoNeto = montoNetoCentavos / 100;

  const tasaNumero = Number(tasaCambio);

  const tasaValida =
    Number.isFinite(tasaNumero) && tasaNumero > 0;

  const montoBsEsperado =
    tasaValida ? montoNeto * tasaNumero : 0;

  const totalSemestrePendiente =
    mensualidadesPendientes.reduce(
      (total, cuota) =>
        total +
        Math.round(numeroSeguro(cuota.monto) * 100),
      0
    ) / 100;

  const ocupado =
    guardando ||
    verificandoId !== null ||
    recargando;

  useEffect(() => {
    if (nuevoPago.moneda !== 'Bs') return;

    setNuevoPago((actual) => ({
      ...actual,
      monto_bs:
        tasaValida && montoNeto > 0
          ? (montoNeto * tasaNumero).toFixed(2)
          : '',
    }));
  }, [
    nuevoPago.moneda,
    montoNeto,
    tasaNumero,
    tasaValida,
  ]);

  const seleccionarPago = (valor: string) => {
    setError('');
    setSuccess('');

    setNuevoPago((actual) => ({
      ...actual,
      seleccion: valor,
      descuento: '0',
      monto_bs: '',
    }));
  };

  const cambiarMoneda = (
    moneda: 'USD' | 'Bs'
  ) => {
    setNuevoPago((actual) => ({
      ...actual,
      moneda,
      metodo_pago:
        moneda === 'USD'
          ? 'Efectivo USD'
          : 'Pago Móvil',
      monto_bs: '',
    }));
  };

  const validarFormulario = (): string => {
    if (!nuevoPago.seleccion) {
      return 'Seleccione una cuota o el semestre pendiente.';
    }

    if (
      !data?.intento?.id &&
      !data?.estudiante.intento_id
    ) {
      return 'No se recibió el intento actual. Recargue la ficha.';
    }

    if (
      esSemestre &&
      hayComprobantesPendientes
    ) {
      return (
        'Hay mensualidades con comprobantes en verificación. ' +
        'Confírmelos o rechácelos antes de registrar el semestre.'
      );
    }

    if (
      esSemestre &&
      mensualidadesPendientes.length === 0
    ) {
      return 'No quedan mensualidades pendientes.';
    }

    if (
      !esSemestre &&
      !cuotaSeleccionada
    ) {
      return (
        'La cuota seleccionada ya no está disponible. ' +
        'Recargue la ficha.'
      );
    }

    if (
      !importeValido(
        nuevoPago.descuento || '0',
        true
      )
    ) {
      return (
        'El descuento debe ser un importe no negativo ' +
        'con máximo dos decimales.'
      );
    }

    if (
      descuentoCentavos >= montoOriginalCentavos ||
      montoNetoCentavos <= 0
    ) {
      return (
        'El descuento debe ser menor que el importe original. ' +
        'El monto neto debe ser mayor que cero.'
      );
    }

    const metodosPermitidos =
      nuevoPago.moneda === 'USD'
        ? ['Efectivo USD', 'Zelle']
        : ['Pago Móvil', 'Transferencia Bs'];

    if (
      !metodosPermitidos.includes(
        nuevoPago.metodo_pago
      )
    ) {
      return 'Seleccione un método de pago válido.';
    }

    if (
      nuevoPago.referencia.trim().length > 100
    ) {
      return 'La referencia no puede superar 100 caracteres.';
    }

    if (nuevoPago.moneda === 'Bs') {
      if (!tasaValida) {
        return (
          'No hay una tasa de cambio válida. ' +
          'Revise la configuración o registre el pago en USD.'
        );
      }

      if (!importeValido(nuevoPago.monto_bs)) {
        return (
          'Ingrese un monto en bolívares válido ' +
          'con máximo dos decimales.'
        );
      }

      const recibido = Number(
        nuevoPago.monto_bs
      );

      if (
        Math.abs(
          montoBsEsperado - recibido
        ) > 0.011
      ) {
        return (
          'El monto en bolívares no coincide. ' +
          `Esperado: ${montoBsEsperado.toFixed(2)} Bs.`
        );
      }
    }

    return '';
  };

  const registrarPago = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (
      operacionEnCurso.current ||
      ocupado
    ) {
      return;
    }

    const mensajeValidacion =
      validarFormulario();

    if (mensajeValidacion) {
      setError(mensajeValidacion);
      return;
    }

    const intentoId =
      data?.intento?.id ||
      data?.estudiante.intento_id;

    if (!intentoId) {
      setError(
        'No se encontró el intento actual.'
      );
      return;
    }

    operacionEnCurso.current = true;
    setGuardando(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/pagos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          estudiante_id: id,
          intento_id: intentoId,
          modalidad:
            esSemestre ? 'semestre' : 'cuota',
          cuota_id:
            esSemestre
              ? null
              : nuevoPago.seleccion,
          monto: montoNeto,
          monto_original_usd:
            montoOriginal,
          descuento_aplicado:
            descuentoCentavos / 100,
          metodo_pago:
            nuevoPago.metodo_pago,
          referencia:
            nuevoPago.referencia.trim() || null,
          monto_bs:
            nuevoPago.moneda === 'Bs'
              ? Number(nuevoPago.monto_bs)
              : null,
          tasa_cambio_usada:
            nuevoPago.moneda === 'Bs'
              ? tasaNumero
              : null,
        }),
      });

      const respuesta =
        await leerRespuesta(res);

      if (respuesta.success !== true) {
        throw new Error(
          'El servidor no confirmó el registro del comprobante.'
        );
      }

      setShowForm(false);
      setNuevoPago({
        ...formularioInicial,
      });

      const actualizado =
        await cargarDatos();

      setSuccess(
        actualizado
          ? 'Comprobante registrado. Las cuotas se pagarán al confirmarlo.'
          : 'El comprobante fue registrado, pero no se pudo actualizar la ficha. Use Actualizar.'
      );
    } catch (err: unknown) {
      const mensaje =
        err instanceof Error
          ? err.message
          : 'No se pudo registrar el pago.';

      // Actualizar las reservas si el servidor llegó
      // a registrar el comprobante antes de perderse
      // la respuesta.
      await cargarDatos();

      setError(mensaje);
    } finally {
      setGuardando(false);
      operacionEnCurso.current = false;
    }
  };

  const verificarPago = async (
    pagoId: string,
    estado: 'confirmado' | 'rechazado'
  ) => {
    if (
      operacionEnCurso.current ||
      ocupado
    ) {
      return;
    }

    const mensaje =
      estado === 'confirmado'
        ? '¿Confirmar este comprobante y pagar todas las cuotas que tiene vinculadas?'
        : '¿Rechazar este comprobante y liberar sus cuotas para registrar otro pago?';

    if (!window.confirm(mensaje)) return;

    operacionEnCurso.current = true;
    setVerificandoId(pagoId);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(
        `/api/pagos/${pagoId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            estado,
          }),
        }
      );

      const respuesta =
        await leerRespuesta(res);

      if (respuesta.success !== true) {
        throw new Error(
          'El servidor no confirmó la actualización.'
        );
      }

      setShowForm(false);
      setNuevoPago({
        ...formularioInicial,
      });

      const actualizado =
        await cargarDatos();

      setSuccess(
        actualizado
          ? estado === 'confirmado'
            ? 'Comprobante confirmado y cuotas aplicadas.'
            : 'Comprobante rechazado y cuotas liberadas.'
          : 'La operación fue confirmada por el servidor, pero no se pudo actualizar la ficha. Use Actualizar.'
      );
    } catch (err: unknown) {
      const mensajeError =
        err instanceof Error
          ? err.message
          : 'No se pudo verificar el pago.';

      await cargarDatos();

      setError(mensajeError);
    } finally {
      setVerificandoId(null);
      operacionEnCurso.current = false;
    }
  };

  const actualizarFicha = async () => {
    if (
      operacionEnCurso.current ||
      ocupado
    ) {
      return;
    }

    setError('');
    setSuccess('');

    setShowForm(false);
    setNuevoPago({
      ...formularioInicial,
    });

    await cargarDatos();
  };

  const exportarHistorial = () => {
    if (!data) return;

    const cabecera = [
      'Fecha',
      'Concepto',
      'Monto USD',
      'Metodo',
      'Estado',
      'Referencia',
      'Monto Bs',
      'Tasa',
      'Descuento USD',
    ];

    const filas = data.pagos.map(
      (pago) => [
        pago.fecha_pago,
        pago.concepto,
        numeroSeguro(pago.monto),
        pago.metodo_pago,
        pago.estado,
        pago.referencia || '',
        pago.monto_bs == null
          ? ''
          : numeroSeguro(pago.monto_bs),
        pago.tasa_cambio_usada == null
          ? ''
          : numeroSeguro(
              pago.tasa_cambio_usada
            ),
        numeroSeguro(
          pago.descuento_aplicado
        ),
      ]
    );

    const contenido = [
      cabecera,
      ...filas,
    ]
      .map((fila) =>
        fila.map(celdaCsv).join(',')
      )
      .join('\r\n');

    const blob = new Blob(
      ['\uFEFF', contenido],
      {
        type: 'text/csv;charset=utf-8;',
      }
    );

    const url = URL.createObjectURL(blob);
    const link =
      document.createElement('a');

    link.href = url;
    link.download =
      `pagos_${data.estudiante.cedula}` +
      `_intento_${
        data.intento?.numero_intento ??
        data.estudiante.numero_intento ??
        1
      }.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2
          size={36}
          className="animate-spin text-blue-900"
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6 bg-red-50 border border-red-200 rounded-3xl text-red-700 text-center">
        <p className="font-bold mb-2">
          No se pudieron cargar los pagos
        </p>

        <p>
          {error ||
            'No se recibieron datos del estudiante.'}
        </p>

        <button
          type="button"
          disabled={recargando}
          onClick={() => {
            setError('');
            void cargarDatos();
          }}
          className="mt-4 px-4 py-2 bg-white border border-red-200 rounded-xl disabled:opacity-50"
        >
          {recargando
            ? 'Cargando...'
            : 'Reintentar'}
        </button>
      </div>
    );
  }

  const {
    estudiante,
    pagos,
    resumen,
    intento,
  } = data;

  const estadoEstudiante =
    estudiante.estado === 'activo'
      ? 'Activo'
      : estudiante.estado === 'deuda'
        ? 'En deuda'
        : 'En verificación';

  const inputClass =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 ' +
    'rounded-xl text-sm focus:outline-none focus:border-blue-500 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2"
        >
          <AlertCircle
            size={18}
            className="shrink-0 mt-0.5"
          />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-start gap-2"
        >
          <CheckCircle2
            size={18}
            className="shrink-0 mt-0.5"
          />
          <span>{success}</span>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            router.push('/pagos')
          }
          aria-label="Volver a pagos"
          className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 shadow-sm disabled:opacity-50"
        >
          <ChevronLeft
            size={24}
            className="text-slate-600"
          />
        </button>

        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {estudiante.apellidos}{' '}
            {estudiante.nombres}
          </h1>

          <p className="text-slate-500 text-sm">
            Cédula: {estudiante.cedula}
            {' · '}
            Período {estudiante.periodo_id}
          </p>

          {intento && (
            <p className="text-xs text-blue-700 mt-1">
              Intento {intento.numero_intento}
              {' · '}
              Año escolar{' '}
              {intento.ano_escolar ||
                'Sin informar'}
            </p>
          )}
        </div>
      </div>

      {/* Resumen financiero */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase">
            Estado
          </p>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border mt-2 ${
              estadoBadge(
                estudiante.estado
              )
            }`}
          >
            {estudiante.estado ===
            'activo' ? (
              <CheckCircle2 size={12} />
            ) : estudiante.estado ===
              'deuda' ? (
              <AlertCircle size={12} />
            ) : (
              <Clock size={12} />
            )}

            {estadoEstudiante}
          </span>

          <p className="text-[10px] text-slate-400 mt-2">
            Según obligaciones exigibles
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase">
            Total pagado
          </p>

          <p className="text-2xl font-extrabold text-emerald-600 mt-2">
            {dinero(
              resumen.total_pagado
            )}{' '}
            $
          </p>

          <p className="text-[10px] text-slate-400 mt-1">
            Comprobantes confirmados del intento
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase">
            Cuotas pendientes
          </p>

          <p className="text-2xl font-extrabold text-amber-600 mt-2">
            {numeroSeguro(
              resumen.cuotas_pendientes
            )}
          </p>

          <p className="text-[10px] text-slate-400 mt-1">
            Del intento actual
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase">
            Saldo pendiente
          </p>

          <p
            className={`text-2xl font-extrabold mt-2 ${
              numeroSeguro(
                resumen.deuda_total
              ) > 0
                ? 'text-rose-600'
                : 'text-emerald-600'
            }`}
          >
            {dinero(
              resumen.deuda_total
            )}{' '}
            $
          </p>

          <p className="text-xs text-slate-500 mt-1">
            Exigible hoy:{' '}
            {dinero(
              resumen.deuda_exigible
            )}{' '}
            $
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            setError('');
            setSuccess('');
            setShowForm(
              (actual) => !actual
            );
          }}
          className="px-4 py-2.5 bg-blue-900 text-white rounded-xl font-semibold text-sm hover:bg-blue-950 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={18} />
          {showForm
            ? 'Cerrar formulario'
            : 'Registrar Mensualidad'}
        </button>

        <button
          type="button"
          disabled={ocupado}
          onClick={exportarHistorial}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
        >
          <Download size={18} />
          Exportar historial
        </button>

        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            void actualizarFicha()
          }
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw
            size={18}
            className={
              recargando
                ? 'animate-spin'
                : ''
            }
          />
          Actualizar
        </button>
      </div>

      {/* Registro por cuota o semestre */}
      {showForm && (
        <form
          onSubmit={registrarPago}
          className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
        >
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Tag size={18} />
            Registrar cuota o semestre
          </h3>

          <p className="text-sm text-slate-500">
            Puede adelantar cuotas.
            Registrar un comprobante no
            liquida las obligaciones hasta
            que sea confirmado.
          </p>

          {errorConfig && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
              {errorConfig}
            </div>
          )}

          {hayComprobantesPendientes && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
              Hay mensualidades con
              comprobantes en verificación.
              No se ofrecen nuevamente.
              Para pagar el semestre,
              primero confirme o rechace
              esos comprobantes.
            </div>
          )}

          {mensualidadesPendientes.length ===
            0 && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-sm">
              No quedan mensualidades
              pendientes en este intento.
              La inscripción, si sigue
              pendiente, se gestiona con su
              comprobante correspondiente.
            </div>
          )}

          {/* Moneda */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                cambiarMoneda('USD')
              }
              className={`p-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                nuevoPago.moneda === 'USD'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <DollarSign size={16} />
              Dólares (USD)
            </button>

            <button
              type="button"
              disabled={
                ocupado || !tasaValida
              }
              onClick={() =>
                cambiarMoneda('Bs')
              }
              className={`p-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                nuevoPago.moneda === 'Bs'
                  ? 'border-amber-600 bg-amber-50 text-amber-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <RefreshCw size={16} />
              Bolívares (Bs)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label
                htmlFor="seleccion-pago"
                className="text-xs font-bold text-slate-500 uppercase"
              >
                Cuota o semestre
              </label>

              <select
                id="seleccion-pago"
                required
                value={
                  nuevoPago.seleccion
                }
                disabled={ocupado}
                onChange={(event) =>
                  seleccionarPago(
                    event.target.value
                  )
                }
                className={inputClass}
              >
                <option value="">
                  Seleccionar
                </option>

                {cuotasDisponibles.map(
                  (cuota) => (
                    <option
                      key={cuota.id}
                      value={cuota.id}
                    >
                      Cuota{' '}
                      {
                        cuota.numero_mensualidad
                      }{' '}
                      —{' '}
                      {dinero(
                        cuota.monto
                      )}{' '}
                      USD
                    </option>
                  )
                )}

                <option
                  value="semestre"
                  disabled={
                    mensualidadesPendientes.length ===
                      0 ||
                    hayComprobantesPendientes
                  }
                >
                  Semestre pendiente —{' '}
                  {totalSemestrePendiente.toFixed(
                    2
                  )}{' '}
                  USD
                  {hayComprobantesPendientes
                    ? ' (comprobantes pendientes)'
                    : ''}
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="monto-original"
                className="text-xs font-bold text-slate-500 uppercase"
              >
                Monto original USD
              </label>

              <input
                id="monto-original"
                type="number"
                readOnly
                value={
                  nuevoPago.seleccion
                    ? montoOriginal.toFixed(
                        2
                      )
                    : ''
                }
                placeholder="0.00"
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="descuento-pago"
                className="text-xs font-bold text-slate-500 uppercase"
              >
                Descuento USD
              </label>

              <input
                id="descuento-pago"
                type="number"
                min="0"
                step="0.01"
                value={
                  nuevoPago.descuento
                }
                disabled={
                  ocupado ||
                  !nuevoPago.seleccion
                }
                onChange={(event) => {
                  const valor =
                    event.target.value;

                  setNuevoPago(
                    (actual) => ({
                      ...actual,
                      descuento: valor,
                    })
                  );
                }}
                className={inputClass}
              />
            </div>
          </div>

          {esSemestre && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded-xl p-3">
              Este comprobante cubrirá{' '}
              {
                mensualidadesPendientes.length
              }{' '}
              mensualidad(es) pendientes.
              No incluye cuotas ya pagadas
              ni la inscripción.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label
                htmlFor="monto-neto"
                className="text-xs font-bold text-emerald-700 uppercase"
              >
                Monto neto USD
              </label>

              <input
                id="monto-neto"
                type="number"
                readOnly
                value={
                  nuevoPago.seleccion
                    ? montoNeto.toFixed(2)
                    : ''
                }
                placeholder="0.00"
                className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="metodo-pago"
                className="text-xs font-bold text-slate-500 uppercase"
              >
                Método de pago
              </label>

              <select
                id="metodo-pago"
                value={
                  nuevoPago.metodo_pago
                }
                disabled={ocupado}
                onChange={(event) => {
                  const valor =
                    event.target.value;

                  setNuevoPago(
                    (actual) => ({
                      ...actual,
                      metodo_pago: valor,
                    })
                  );
                }}
                className={inputClass}
              >
                {nuevoPago.moneda ===
                'USD' ? (
                  <>
                    <option value="Efectivo USD">
                      Efectivo USD
                    </option>
                    <option value="Zelle">
                      Zelle
                    </option>
                  </>
                ) : (
                  <>
                    <option value="Pago Móvil">
                      Pago Móvil
                    </option>
                    <option value="Transferencia Bs">
                      Transferencia Bs
                    </option>
                  </>
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="referencia-pago"
                className="text-xs font-bold text-slate-500 uppercase"
              >
                Referencia
              </label>

              <input
                id="referencia-pago"
                type="text"
                maxLength={100}
                value={
                  nuevoPago.referencia
                }
                disabled={ocupado}
                onChange={(event) => {
                  const valor =
                    event.target.value;

                  setNuevoPago(
                    (actual) => ({
                      ...actual,
                      referencia: valor,
                    })
                  );
                }}
                placeholder="Referencia"
                className={inputClass}
              />
            </div>
          </div>

          {nuevoPago.moneda === 'Bs' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="space-y-1">
                <label
                  htmlFor="tasa-pago"
                  className="text-xs font-bold text-amber-700 uppercase"
                >
                  Tasa de cambio
                  (Bs/USD)
                </label>

                <input
                  id="tasa-pago"
                  type="number"
                  readOnly
                  value={tasaCambio}
                  className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="monto-bs"
                  className="text-xs font-bold text-amber-700 uppercase"
                >
                  Monto en Bs recibido
                </label>

                <input
                  id="monto-bs"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={ocupado}
                  value={
                    nuevoPago.monto_bs
                  }
                  onChange={(event) => {
                    const valor =
                      event.target.value;

                    setNuevoPago(
                      (actual) => ({
                        ...actual,
                        monto_bs: valor,
                      })
                    );
                  }}
                  className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50"
                />

                <p className="text-[10px] text-amber-600">
                  Esperado:{' '}
                  {montoBsEsperado.toFixed(
                    2
                  )}{' '}
                  Bs
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                ocupado ||
                !nuevoPago.seleccion ||
                cuotasSeleccionadas.length ===
                  0 ||
                (esSemestre &&
                  hayComprobantesPendientes)
              }
              className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? (
                <Loader2
                  size={18}
                  className="animate-spin"
                />
              ) : (
                <CheckCircle2
                  size={18}
                />
              )}

              {guardando
                ? 'Guardando...'
                : 'Guardar comprobante'}
            </button>
          </div>
        </form>
      )}

      {/* Pagos del intento */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">
            Pagos del intento actual
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">
                  Fecha
                </th>
                <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">
                  Concepto
                </th>
                <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">
                  Monto
                </th>
                <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase hidden md:table-cell">
                  Divisa
                </th>
                <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase">
                  Estado
                </th>
                <th className="text-right py-3 px-6 text-xs font-bold text-slate-500 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {pagos.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-slate-400 text-sm"
                  >
                    No hay pagos registrados
                    en este intento.
                  </td>
                </tr>
              ) : (
                pagos.map((pago) => (
                  <tr
                    key={pago.id}
                    className="hover:bg-slate-50/50"
                  >
                    <td className="py-3 px-6 text-sm text-slate-600 whitespace-nowrap">
                      {fechaVisible(
                        pago.fecha_pago
                      )}
                    </td>

                    <td className="py-3 px-6 text-sm font-medium text-slate-900">
                      {pago.concepto}

                      {numeroSeguro(
                        pago.descuento_aplicado
                      ) > 0 && (
                        <span className="block text-[10px] text-emerald-600 font-semibold">
                          Descuento: -
                          {dinero(
                            pago.descuento_aplicado
                          )}
                          $
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-6 text-sm font-bold text-slate-900 whitespace-nowrap">
                      {dinero(
                        pago.monto
                      )}
                      $

                      {pago.monto_bs !=
                        null && (
                        <span className="block text-[10px] text-amber-600 font-medium">
                          {dinero(
                            pago.monto_bs
                          )}{' '}
                          Bs
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-6 text-sm text-slate-500 hidden md:table-cell">
                      {pago.monto_bs !=
                      null ? (
                        <span className="flex items-center gap-1 text-amber-600">
                          <RefreshCw
                            size={10}
                          />
                          Tasa:{' '}
                          {
                            pago.tasa_cambio_usada
                          }
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-blue-600">
                          <DollarSign
                            size={10}
                          />
                          USD
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-6">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold border ${
                          estadoBadge(
                            pago.estado
                          )
                        }`}
                      >
                        {pago.estado}
                      </span>
                    </td>

                    <td className="py-3 px-6 text-right">
                      {pago.estado ===
                        'verificacion' && (
                        <div className="flex gap-2 justify-end">
                          {verificandoId ===
                          pago.id ? (
                            <Loader2
                              size={18}
                              className="animate-spin text-blue-700"
                            />
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={
                                  ocupado
                                }
                                onClick={() =>
                                  void verificarPago(
                                    pago.id,
                                    'confirmado'
                                  )
                                }
                                title="Confirmar"
                                aria-label={`Confirmar ${pago.concepto}`}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <CheckCircle2
                                  size={18}
                                />
                              </button>

                              <button
                                type="button"
                                disabled={
                                  ocupado
                                }
                                onClick={() =>
                                  void verificarPago(
                                    pago.id,
                                    'rechazado'
                                  )
                                }
                                title="Rechazar"
                                aria-label={`Rechazar ${pago.concepto}`}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <XCircle
                                  size={18}
                                />
                              </button>
                            </>
                          )}
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
    </div>
  );
}