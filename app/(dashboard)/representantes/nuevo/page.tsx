'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NuevoRepresentantePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  
  const [formData, setFormData] = useState({
    nombre_completo: '',
    cedula: '',
    telefono: '',
    email: '',
    direccion: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensaje('');

    try {
      const response = await fetch('/api/representantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        setMensaje('✅ Representante registrado exitosamente');
        setTimeout(() => {
          router.push('/representantes');
        }, 1500);
      } else {
        setMensaje(`❌ Error: ${data.error || 'No se pudo registrar'}`);
      }
    } catch (error) {
      setMensaje('❌ Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Nuevo Representante</h2>
            <p className="text-sm text-gray-500">Registrar padre o representante legal</p>
          </div>
          <button 
            onClick={() => router.push('/representantes')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Volver a lista
          </button>
        </header>
        
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-md p-8">
            
            {mensaje && (
              <div className={`mb-6 p-4 rounded-lg text-center ${mensaje.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {mensaje}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Nombre Completo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  name="nombre_completo"
                  value={formData.nombre_completo}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
                  placeholder="María Elena González"
                />
              </div>

              {/* Cédula */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cédula de Identidad *
                </label>
                <input
                  type="text"
                  name="cedula"
                  value={formData.cedula}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
                  placeholder="V12345678"
                />
              </div>

              {/* Contacto */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
                    placeholder="0412-1234567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
                    placeholder="representante@email.com"
                  />
                </div>
              </div>

              {/* Dirección */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dirección
                </label>
                <textarea
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
                  placeholder="Dirección completa de residencia..."
                />
              </div>

              {/* Botones */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => router.push('/representantes')}
                  className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-lg hover:shadow-lg transition disabled:opacity-50 font-medium"
                >
                  {loading ? 'Guardando...' : '💾 Registrar Representante'}
                </button>
              </div>

            </form>
          </div>
        </main>
      </div>
    </div>
  );
}