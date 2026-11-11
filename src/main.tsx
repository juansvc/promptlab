import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { MOCK_SPEED } from './providers/mock';

// ?simulador=rapido acelera el adaptador simulado (demostraciones y pruebas automatizadas).
if (new URLSearchParams(window.location.search).get('simulador') === 'rapido') MOCK_SPEED.factor = 0.02;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
