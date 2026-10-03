import { liveQuery, type Subscription } from 'dexie';
import { useSyncExternalStore } from 'react';
import { adoptCloudAI, clearLocalData, exportForCloud, isLocalEmpty, restoreBackup } from '../data/backup';
import { type MetaStore, type SyncMeta, SyncEngine, type SyncOutcome } from './engine';
import { cloudEnabled, createSupabaseStore, getClient } from './supabase';

export interface CloudState {
  /** O build tem um projeto Supabase configurado. */
  enabled: boolean;
  /** Já se sabe se há alguém logado. */
  authReady: boolean;
  user: { id: string; email: string } | null;
  /** Os dados locais já foram conferidos com a nuvem ao menos uma vez nesta visita. */
  hydrated: boolean;
  status: 'idle' | 'syncing' | 'synced' | 'choose' | 'error';
  lastSyncedAt: string | null;
  error: string;
}

let state: CloudState = {
  enabled: cloudEnabled,
  authReady: !cloudEnabled,
  user: null,
  hydrated: false,
  status: 'idle',
  lastSyncedAt: null,
  error: '',
};
const listeners = new Set<() => void>();

function update(patch: Partial<CloudState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useCloud(): CloudState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

// ---------- O que este navegador lembra da última sincronização ----------

const META_KEY = 'ds-sync-meta';

const metaStore: MetaStore = {
  get(): SyncMeta | null {
    try {
      const raw = localStorage.getItem(META_KEY);
      return raw ? (JSON.parse(raw) as SyncMeta) : null;
    } catch {
      return null;
    }
  },
  set(meta) {
    try {
      if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
      else localStorage.removeItem(META_KEY);
    } catch {
      // Sem localStorage a sincronização ainda funciona; só reconfere tudo a cada visita.
    }
  },
};

// ---------- Motor ----------

let engine: SyncEngine | null = null;
let watcher: Subscription | null = null;
let debounce: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!navigator.onLine || /fetch|network/i.test(message)) {
    return 'Sem conexão com a nuvem. Suas alterações ficam neste navegador e serão enviadas quando a conexão voltar.';
  }
  return `Falha ao sincronizar: ${message}`;
}

/** Roda uma operação de cada vez, para envio e recebimento nunca se cruzarem. */
function run(task: (e: SyncEngine) => Promise<SyncOutcome>): Promise<SyncOutcome | null> {
  const current = engine;
  if (!current) return Promise.resolve(null);
  const result = queue.then(async (): Promise<SyncOutcome | null> => {
    if (engine !== current) return null;
    update({ status: 'syncing', error: '' });
    try {
      const outcome = await task(current);
      update(
        outcome === 'synced'
          ? { status: 'synced', hydrated: true, lastSyncedAt: new Date().toISOString() }
          : { status: 'choose' },
      );
      return outcome;
    } catch (error) {
      // Num navegador que já sincronizou antes, dá para seguir estudando sem rede.
      const knownHere = metaStore.get()?.userId === state.user?.id;
      update({ status: 'error', error: describe(error), hydrated: state.hydrated || knownHere });
      return null;
    }
  });
  queue = result;
  return result;
}

function watchLocalChanges(): void {
  watcher?.unsubscribe();
  // liveQuery dispara de novo sempre que qualquer tabela exportada muda.
  watcher = liveQuery(exportForCloud).subscribe(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (state.hydrated && state.status !== 'choose') void run((e) => e.pushIfChanged());
    }, 1500);
  });
}

function startFor(user: { id: string; email: string }): void {
  if (state.user?.id === user.id && engine) return;
  engine = new SyncEngine(
    user.id,
    createSupabaseStore(getClient(), user.id),
    { export: exportForCloud, restore: restoreBackup, isEmpty: isLocalEmpty, adoptAI: adoptCloudAI },
    metaStore,
  );
  update({ user, authReady: true, hydrated: false, status: 'idle', error: '' });
  void run((e) => e.reconcile()).then(watchLocalChanges);
}

function stop(): void {
  watcher?.unsubscribe();
  watcher = null;
  clearTimeout(debounce);
  engine = null;
  update({ user: null, authReady: true, hydrated: false, status: 'idle', error: '', lastSyncedAt: null });
}

/** Liga a autenticação e a sincronização. Chamado uma vez ao abrir o app. */
export function initCloud(): void {
  if (!cloudEnabled) return;
  getClient().auth.onAuthStateChange((_event, session) => {
    // O Supabase pede para não chamar a própria API de dentro deste callback.
    setTimeout(() => {
      const user = session?.user;
      if (user) startFor({ id: user.id, email: user.email ?? '' });
      else stop();
    }, 0);
  });

  // Ao voltar para a aba ou recuperar a rede, confere se outro navegador mudou algo.
  const recheck = () => {
    if (document.visibilityState === 'visible' && state.status !== 'choose') {
      void run((e) => e.reconcile());
    }
  };
  document.addEventListener('visibilitychange', recheck);
  window.addEventListener('online', recheck);
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await getClient().auth.signInWithPassword({ email: email.trim(), password });
  if (!error) return null;
  if (error.code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
  if (error.code === 'email_not_confirmed') return 'Confirme o e-mail da conta antes de entrar.';
  return describe(error);
}

/**
 * Sai da conta e apaga os dados deste navegador, para não ficarem num computador
 * compartilhado. Só sai depois de confirmar que tudo foi enviado.
 */
export async function signOut(): Promise<string | null> {
  const outcome = await run((e) => e.pushIfChanged());
  if (outcome !== 'synced') {
    return 'Não foi possível enviar suas últimas alterações. Resolva a sincronização antes de sair, para não perder nada.';
  }
  watcher?.unsubscribe();
  watcher = null;
  engine = null;
  await clearLocalData();
  metaStore.set(null);
  await getClient().auth.signOut();
  return null;
}

export function syncNow(): Promise<SyncOutcome | null> {
  return run((e) => e.reconcile());
}

export function resolveConflict(keep: 'cloud' | 'local'): Promise<SyncOutcome | null> {
  return run((e) => e.resolve(keep));
}
