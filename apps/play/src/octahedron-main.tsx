import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import OctahedronApp from './octahedron/OctahedronApp';
import './index.css';

inject();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OctahedronApp />
  </StrictMode>,
);
