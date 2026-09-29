'use client';

import { motion } from 'motion/react';
import * as React from 'react';
import { LOGO_BASE64 } from '../../components/logo';

interface LoginCardProps {
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  error: string;
  loading: boolean;
  handleSubmit: (e: React.FormEvent) => void;
}

export function LoginCard({
  email, setEmail, password, setPassword, error, loading, handleSubmit,
}: LoginCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="max-w-4xl w-full mx-auto"
    >
      <div className="bg-[#1e293b]/70 backdrop-blur-md rounded-[24px] shadow-2xl border border-[rgba(148,163,184,0.1)] overflow-hidden grid md:grid-cols-2">

        {/* ─── Panel Izquierdo ─── */}
        <div className="p-8 md:p-12 bg-gradient-to-br from-[rgba(56,189,248,0.08)] to-transparent border-r border-[rgba(148,163,184,0.08)] flex flex-col items-center text-center min-h-[400px] md:min-h-[500px]">

          {/* Nombre institución */}
          <div className="w-full">
            <h1 className="text-3xl md:text-4xl font-light leading-snug text-[#f8fafc]">
              Unidad Educativa <br />
              <span className="font-bold text-[#38bdf8]">Julio Garmendia</span>
            </h1>
          </div>

          {/* Logo mejorado */}
          <div className="flex-1 flex items-center justify-center w-full py-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, duration: 0.55 }}
              className="relative group"
            >
              {/* Halo difuso de fondo */}
              <div className="absolute inset-0 rounded-full bg-[#38bdf8]/15 blur-[60px] scale-[1.8] group-hover:bg-[#38bdf8]/22 transition-all duration-700" />

              {/* Contenedor exterior con borde sutil */}
              <div className="relative rounded-[28px] p-[2px] bg-gradient-to-br from-[rgba(56,189,248,0.25)] to-[rgba(56,189,248,0.04)]">
                {/* Superficie interna */}
                <div className="rounded-[26px] bg-[#0d1f35]/80 backdrop-blur-xl p-6 md:p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  {/* Bandeja blanca suave solo para el logo */}
                  <div className="rounded-2xl bg-white/[0.09] p-4 border border-white/[0.07]">
                    <img
                      src={LOGO_BASE64}
                      alt="Logo Unidad Educativa Julio Garmendia"
                      className="w-24 h-24 md:w-32 md:h-32 object-contain"
                      style={{
                        filter:
                          'drop-shadow(0 0 14px rgba(56,189,248,0.35)) brightness(1.08) contrast(1.02)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Stats */}
          <div className="w-full grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 rounded-xl border border-white/5 backdrop-blur-sm">
              <span className="block font-bold text-[#38bdf8] text-xl">1.2k+</span>
              <span className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-semibold">
                Estudiantes
              </span>
            </div>
            <div className="p-4 bg-white/5 rounded-xl border border-white/5 backdrop-blur-sm">
              <span className="block font-bold text-[#38bdf8] text-xl">98%</span>
              <span className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-semibold">
                Efectividad
              </span>
            </div>
          </div>
        </div>

        {/* ─── Panel Derecho – Formulario ─── */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-[#0f172a]/30">
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-[#f8fafc]">Bienvenido de nuevo</h2>
            <p className="text-[#94a3b8] text-sm mt-2">
              Ingresa tus credenciales para acceder al portal.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider ml-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@garmendia.local"
                className="w-full bg-[#0f172a]/50 border border-[rgba(148,163,184,0.15)] focus:border-[#38bdf8] rounded-xl px-4 py-3 text-sm transition-all focus:outline-none focus:ring-4 focus:ring-[rgba(56,189,248,0.1)] text-[#f8fafc] placeholder:text-[#475569]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider ml-1">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••"
                className="w-full bg-[#0f172a]/50 border border-[rgba(148,163,184,0.15)] focus:border-[#38bdf8] rounded-xl px-4 py-3 text-sm transition-all focus:outline-none focus:ring-4 focus:ring-[rgba(56,189,248,0.1)] text-[#f8fafc] placeholder:text-[#475569]"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm text-center"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full bg-[#38bdf8] text-[#0f172a] font-bold py-3.5 rounded-xl shadow-lg shadow-[rgba(56,189,248,0.25)] hover:shadow-[rgba(56,189,248,0.45)] hover:bg-[#7dd3fc] transition-all text-sm mt-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'VERIFICANDO...' : 'INICIAR SESIÓN'}
            </motion.button>
          </form>

          <div className="mt-8 text-center">
            <button
              type="button"
              className="text-[13px] text-[#94a3b8] font-medium hover:text-[#f8fafc] transition-colors"
            >
              ¿Problemas al entrar?{' '}
              <span className="text-[#38bdf8] hover:underline cursor-pointer">
                Contactar Soporte IT
              </span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

