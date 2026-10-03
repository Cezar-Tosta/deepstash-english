import { Component, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { initCloud } from './sync/cloud';
import { CloudGate } from './ui/CloudGate';
import { useApplyTheme, useSettings } from './ui/hooks';
import { Layout } from './ui/Layout';
import { IdeaDetailPage } from './ui/pages/IdeaDetailPage';
import { BookPage } from './ui/pages/BookPage';
import { KnowledgePage } from './ui/pages/KnowledgePage';
import { ManualPage } from './ui/pages/ManualPage';
import { PracticePage } from './ui/pages/PracticePage';
import { ProgressPage } from './ui/pages/ProgressPage';
import { ReviewPage } from './ui/pages/ReviewPage';
import { SettingsPage } from './ui/pages/SettingsPage';
import { TodayPage } from './ui/pages/TodayPage';
import { WeeklyPage } from './ui/pages/WeeklyPage';
import { SessionPage } from './ui/session/SessionPage';

/** Última barreira: se o banco ou uma tela falhar, o usuário vê o motivo e como seguir. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md px-6 py-16 text-ink">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-3 text-muted">
          Seus dados continuam guardados neste aparelho. Recarregue o app; se o erro voltar, o navegador pode estar
          bloqueando o armazenamento (modo privado, por exemplo).
        </p>
        <p className="mt-3 rounded-lg bg-sunken p-3 font-mono text-sm">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 min-h-12 rounded-xl bg-accent px-5 font-semibold text-accent-ink"
        >
          Recarregar
        </button>
      </div>
    );
  }
}

function App() {
  useApplyTheme(useSettings()?.theme);
  return (
    // HashRouter: as rotas funcionam em qualquer hospedagem estática, sem configurar o servidor.
    <CloudGate>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TodayPage />} />
          <Route path="session" element={<SessionPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="knowledge/idea/:ideaId" element={<IdeaDetailPage />} />
          <Route path="knowledge/book/:key" element={<BookPage />} />
          <Route path="practice" element={<PracticePage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="weekly/:weekStart?" element={<WeeklyPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="manual" element={<ManualPage />} />
          <Route path="*" element={<TodayPage />} />
        </Route>
      </Routes>
    </HashRouter>
    </CloudGate>
  );
}

initCloud();

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado.');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
