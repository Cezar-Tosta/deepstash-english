import { useSyncExternalStore } from 'react';

/** De quanto em quanto tempo o app pergunta ao servidor se há versão nova. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

function notify(worker: ServiceWorker): void {
  waiting = worker;
  for (const l of listeners) l();
}

/**
 * Registra o service worker sem trocar de versão sozinho. Uma aba aberta com a versão
 * antiga pediria arquivos que já não existem (a IA, por exemplo, falha ao carregar);
 * por isso a versão nova fica esperando e o app avisa. A troca acontece quando o
 * usuário recarrega: o worker novo recebe SKIP_WAITING e assume a página.
 */
export function registerUpdates(): void {
  // Em desenvolvimento não há service worker gerado.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((registration) => {
      // Só há "versão nova" quando já existe uma versão no controle da página.
      const watch = (worker: ServiceWorker | null) => {
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) notify(worker);
        });
      };
      if (registration.waiting && navigator.serviceWorker.controller) notify(registration.waiting);
      registration.addEventListener('updatefound', () => watch(registration.installing));

      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      };
      setInterval(check, CHECK_EVERY_MS);
      // Voltar para a aba depois de horas é o caso mais comum de versão desatualizada.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    })
    .catch(() => undefined);
}

/** Ativa a versão nova e recarrega a página quando ela assumir. */
export function applyUpdate(): void {
  if (!waiting) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function useNeedRefresh(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => waiting !== null,
  );
}
