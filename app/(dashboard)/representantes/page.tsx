'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RepresentantesPage() {
  const [representantes, setRepresentantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const router = useRouter();

  useEffect(() => {
    cargarRepresentantes();
  }, []);

  const cargarRepresentantes = async () => {
    try {
      const response = await fetch('/api/representantes');
      const data = await response.json();
      setRepresentantes(data.representantes || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const representantesFiltrados = representantes.filter(r => 
    r.nombre_completo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    r.cedula?.includes(busqueda)
  );

  if (loading) return <div className="flex h-screen items-center justify-center">Cargando...</div>;

  return (
    <div className="flex h-screen bg-gray-50">
      
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Gestión de Representantes</h1>
              <p className="text-sm text-gray-500">Padres y representantes legales</p>
            </div>
            {/* BOTÓN PÚRPURA ELIMINADO - Solo se añaden representantes desde estudiantes */}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            
            {/* Buscador */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-6">
              <input
                type="text"
                placeholder="Buscar representante por nombre o cédula..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
              />
            </div>

            {/* Lista de Representantes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {representantesFiltrados.map((rep) => (
                <div key={rep.id} className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition">
                  {/* Header del representante */}
                  <div className="flex justify-between items-start mb-4 pb-4 border-b">
                    <div>
                      <h3 className="font-bold text-lg text-gray-800">{rep.nombre_completo}</h3>
                      <p className="text-sm text-gray-500">CI: {rep.cedula}</p>
                    </div>
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {rep.estudiantes?.length || 0} estudiante(s)
                    </span>
                  </div>

                  {/* Contacto */}
                  <div className="space-y-2 mb-4 text-sm">
                    {rep.telefono && (
                      <p className="flex items-center gap-2 text-gray-600">
                        <span>📱</span> {rep.telefono}
                      </p>
                    )}
                    {rep.email && (
                      <p className="flex items-center gap-2 text-gray-600">
                        <span>📧</span> {rep.email}
                      </p>
                    )}
                  </div>

                  {/* Estudiantes asignados */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-sm text-gray-700 mb-3">Estudiantes a cargo:</h4>
                    {rep.estudiantes && rep.estudiantes.length > 0 ? (
                      <div className="space-y-2">
                        {rep.estudiantes.map((est: any) => (
                          <div key={est.id} className="flex justify-between items-center bg-white p-2 rounded border">
                            <div>
                              <p className="font-medium text-sm">{est.apellidos} {est.nombres}</p>
                              <p className="text-xs text-gray-500">{est.cedula_escolar}</p>
                            </div>
                            <span className="text-xs px-2 py-1 bg-pink-100 text-pink-700 rounded">
                              {est.periodo_id ? `Período ${est.periodo_id}` : `${est.grado || ''} ${est.seccion || ''}`.trim()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Sin estudiantes asignados</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {representantesFiltrados.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">No se encontraron representantes</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
