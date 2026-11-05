import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { useLang } from './lib/i18n.js';
import './styles.css';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Everything redraws when the language changes, without leaving the game you're in
function Root() {
  useLang();
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
