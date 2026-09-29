'use client';

import { FileText, TrendingUp, BarChart3, Activity } from 'lucide-react';
import Link from 'next/link';

export default function ReportesPage() {
  const reportes = [
    {
      title: 'Auditoría del Sistema',
      description: 'Registro de todas las acciones realizadas en el sistema',
      icon: Activity,
      color: 'bg-purple-50',
      iconColor: 'text-purple-600',
      href: '/reportes/auditoria'
    },
    {
      title: 'Boletines',
      description: 'Calificaciones y desempeño de estudiantes',
      icon: FileText,
      color: 'bg-blue-50',
      iconColor: 'text-blue-600',
      href: '/reportes/boletines'
    },
    {
      title: 'Estadísticas',
      description: 'Análisis de datos y tendencias',
      icon: BarChart3,
      color: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      href: '/reportes/estadisticas'
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Reportes</h1>
        <p className="text-slate-500 text-sm mt-1">Accede a todos los reportes y estadísticas del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reportes.map((reporte, index) => {
          const Icon = reporte.icon;
          return (
            <Link
              key={index}
              href={reporte.href}
              className={`${reporte.color} rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer`}
            >
              <div className={`${reporte.iconColor} mb-4`}>
                <Icon size={32} />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">{reporte.title}</h2>
              <p className="text-slate-600 text-sm">{reporte.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}