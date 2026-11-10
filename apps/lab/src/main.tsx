import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import App from './App';
import ComparePage from './ComparePage';
import '@menger/theme';
import './index.css';

inject();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.replace(/\/$/, '') === '/lab/compare' ? <ComparePage /> : <App />}
  </StrictMode>,
);
