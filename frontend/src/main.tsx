import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { PomodoroProvider } from './context/PomodoroContext';
import './styles/globals.css';

// Undo the redirect 404.html performs for GitHub Pages (see that file for
// why): restore the real path before the app's own router reads location.
(function restoreGithubPagesRoute() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  if (redirect !== null) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    window.history.replaceState(null, '', base + redirect);
  }
})();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <PomodoroProvider>
            <App />
          </PomodoroProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
