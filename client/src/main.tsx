import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';
import './lib/pwa';
import { trackVisit } from './lib/analytics';

trackVisit();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
