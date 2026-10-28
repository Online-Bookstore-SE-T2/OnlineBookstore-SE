import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
// Fonts are bundled with the app, so no request leaves for a third-party font service (SRS 7, privacy).
import '@fontsource/archivo-black';
import '@fontsource-variable/public-sans';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
