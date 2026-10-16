'use client';

import { useEffect, useState } from 'react';
import CalendarioDashboard from '../../components/CalendarioDashboard';
import {
  Users,
  GraduationCap,
  TrendingUp,
  CheckCircle2,
  Calendar,
  AlertCircle,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { useUser } from '../../components/UserContext'; // ✅ NUEVO

interface DashboardData {
  totalEstudiantes?: number;
  totalDocentes?: number;
  promedioGeneral?: string;
  
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { nombre, rol } = useUser(); // ✅ NUEVO: reemplaza el "Director Jorge" fijo

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400">Cargando...</p>
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Estudiantes',
      value: data?.totalEstudiantes ?? 0,
      icon: Users,
      color: 'bg-blue-500',
      lightColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      href: '/estudiantes'
    },
    {
      title: 'Docentes Activos',
      value: data?.totalDocentes ?? 0,
      icon: GraduationCap,
      color: 'bg-violet-500',
      lightColor: 'bg-violet-50',
      textColor: 'text-violet-600',
      href: '/docentes'
    },
    {
      title: 'Promedio General',
      value: Number(data?.promedioGeneral ?? 0).toFixed(2),
      icon: CheckCircle2,
      color: 'bg-amber-500',
      lightColor: 'bg-amber-50',
      textColor: 'text-amber-600',
      href: '#'
    },
    
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          {/* ✅ MODIFICADO: nombre real y saludo condicionado al rol,
              ya no dice "Director Jorge" para todo el mundo. */}
          <h1 className="text-2xl font-extrabold text-slate-900">
            ¡Hola, {rol === 'director' ? 'Director' : 'Profesor'} {nombre}!
          </h1>
          <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
            <Calendar size={14} />
            {new Date().toLocaleDateString('es-ES', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          En construccion
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Link
              key={index}
              href={stat.href}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${stat.lightColor}`}>
                  <Icon size={20} className={stat.textColor} />
                </div>
                <ArrowRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">{stat.title}</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{stat.value}</p>
            </Link>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <div className="lg:col-span-2">
            <CalendarioDashboard esDirector={rol === 'director'} />
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Resumen Rápido</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Estudiantes</p>
              <p className="text-xs text-slate-400">Total inscritos</p>
            </div>
            <p className="text-xl font-extrabold text-blue-600">{data?.totalEstudiantes || 0}</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Docentes</p>
              <p className="text-xs text-slate-400">Activos</p>
            </div>
            <p className="text-xl font-extrabold text-violet-600">{data?.totalDocentes || 0}</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Promedio</p>
              <p className="text-xs text-slate-400">General</p>
            </div>
            <p className="text-xl font-extrabold text-amber-600">{data?.promedioGeneral || '17.2'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}