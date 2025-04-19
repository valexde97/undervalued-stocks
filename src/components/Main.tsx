import { ReactNode } from 'react';

export const Main = ({ children }: { children: ReactNode }) => (
  <main style={{ padding: '2rem', minHeight: '70vh' }}>
    {children}
  </main>
);
