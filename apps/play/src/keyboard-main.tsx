import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import KeyboardGuide from './KeyboardGuide';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KeyboardGuide />
  </StrictMode>,
);
