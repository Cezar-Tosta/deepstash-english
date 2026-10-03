import { useSyncExternalStore } from 'react';
import { errorMessage } from '../services/errors';

export interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'info';
}

let current: Toast | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(toast: Toast | null): void {
  current = toast;
  for (const l of listeners) l();
}

export function showToast(text: string, tone: Toast['tone'] = 'info'): void {
  clearTimeout(timer);
  set({ id: nextId++, text, tone });
  timer = setTimeout(() => set(null), tone === 'error' ? 7000 : 3500);
}

export function dismissToast(): void {
  clearTimeout(timer);
  set(null);
}

/** Executa uma gravação e, se falhar, avisa o usuário em vez de falhar em silêncio. */
export function attempt(action: Promise<unknown>): void {
  action.catch((error: unknown) => showToast(errorMessage(error), 'error'));
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
