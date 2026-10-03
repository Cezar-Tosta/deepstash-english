import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { today } from '../domain/dates';
import type { ISODate, ThemePref, UserSettings } from '../domain/types';
import { getSettings } from '../services/settings';

export function useSettings(): UserSettings | undefined {
  return useLiveQuery(getSettings, []);
}

/** O dia de hoje, atualizado quando o app volta ao primeiro plano depois da meia-noite. */
export function useToday(): ISODate {
  const [date, setDate] = useState(today);
  useEffect(() => {
    const refresh = () => setDate(today());
    const id = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return date;
}

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/** Aplica o tema na raiz e guarda uma cópia para o index.html usar antes da primeira pintura. */
export function useApplyTheme(theme: ThemePref | undefined): void {
  useEffect(() => {
    if (!theme) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    try {
      localStorage.setItem('ds-theme', theme);
    } catch {
      // Sem localStorage o tema ainda funciona; só pode piscar ao abrir.
    }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
