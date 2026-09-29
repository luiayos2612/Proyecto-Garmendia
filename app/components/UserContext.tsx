'use client';

import { createContext, useContext } from 'react';

interface UserContextValue {
  rol: string;
  nombre: string;
}

// ✅ NUEVO: contexto que expone rol/nombre del usuario logueado a CUALQUIER
// componente cliente dentro de app/dashboard/*, sin tener que volver a
// llamar una API. El valor real se inyecta desde dashboard/layout.tsx
// (que lee la cookie en el servidor en cada request).
const UserContext = createContext<UserContextValue>({ rol: 'docente', nombre: 'Usuario' });

export function UserProvider({
  rol,
  nombre,
  children,
}: {
  rol: string;
  nombre: string;
  children: React.ReactNode;
}) {
  return (
    <UserContext.Provider value={{ rol, nombre }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}