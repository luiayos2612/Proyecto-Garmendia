'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { LoginCard } from './LoginCard';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        window.location.href = '/dashboard';
      } else {
        setError(data.message || 'Credenciales incorrectas');
      }
    } catch (err) {
      setError('Error de conexión. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] overflow-hidden font-sans">
      <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_50%,_#1e293b_0%,_#0f172a_100%)] flex items-center justify-center p-4 sm:p-8 relative">
        
        {/* Efectos de luz decorativos */}
        <div className="absolute top-[10%] left-[10%] w-[300px] h-[300px] bg-[#38bdf8] blur-[150px] opacity-10 -z-10 animate-pulse" />
        <div className="absolute bottom-[10%] right-[10%] w-[300px] h-[300px] bg-[#38bdf8] blur-[150px] opacity-10 -z-10" />
        
        <LoginCard
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          error={error}
          loading={loading}
          handleSubmit={handleSubmit}
        />
      </main>
    </div>
  );
}