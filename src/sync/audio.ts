import { db } from '../data/db';
import { addDays, nowISO } from '../domain/dates';
import type { ISODate, ISODateTime } from '../domain/types';

/** Semanas de áudio que cada aparelho guarda. As mais antigas ficam só na nuvem. */
export const AUDIO_KEEP_WEEKS = 4;

/** Um áudio guardado na nuvem. O id é o da fala (SpeakingSession) a que ele pertence. */
export interface RemoteAudio {
  id: string;
  createdAt: ISODateTime;
}

/** Onde os áudios das falas ficam na nuvem. */
export interface AudioStore {
  list(): Promise<RemoteAudio[]>;
  upload(id: string, blob: Blob): Promise<void>;
  download(id: string): Promise<Blob>;
  remove(ids: readonly string[]): Promise<void>;
}

export interface AudioPlan {
  upload: string[];
  download: string[];
  remove: string[];
}

/** Aplica o plano: envia, baixa e apaga. Uma falha no meio para tudo; a próxima conferência continua de onde parou. */
export async function syncAudio(store: AudioStore, today: ISODate): Promise<AudioPlan> {
  const [remote, local, speaking] = await Promise.all([store.list(), db.recordings.toCollection().primaryKeys(), db.speaking.toArray()]);
  const plan = planAudioSync({
    local: local.map(String),
    remote,
    speaking,
    keepSince: addDays(today, -7 * AUDIO_KEEP_WEEKS),
    now: nowISO(),
  });
  for (const id of plan.upload) {
    const recording = await db.recordings.get(id);
    if (recording) await store.upload(id, recording.blob);
  }
  for (const id of plan.download) {
    const blob = await store.download(id);
    const createdAt = speaking.find((s) => s.id === id)?.createdAt ?? nowISO();
    await db.recordings.put({ id, blob, createdAt });
  }
  if (plan.remove.length > 0) await store.remove(plan.remove);
  return plan;
}

/** Folga antes de apagar da nuvem um áudio sem fala: pode ser de uma fala que este navegador ainda não recebeu. */
const REMOVE_AFTER_MS = 10 * 60 * 1000;

/**
 * O que fazer para os áudios deste navegador e da nuvem ficarem em dia:
 * - envia o que só existe aqui;
 * - baixa o que falta aqui, só das falas a partir de `keepSince` (as antigas ficam na nuvem);
 * - apaga da nuvem o áudio de fala que já não existe, passada a folga.
 */
export function planAudioSync(input: {
  /** Ids das gravações guardadas neste navegador. */
  local: readonly string[];
  remote: readonly RemoteAudio[];
  speaking: readonly { id: string; date: ISODate }[];
  keepSince: ISODate;
  now: ISODateTime;
}): AudioPlan {
  const local = new Set(input.local);
  const remote = new Set(input.remote.map((r) => r.id));
  const speaking = new Set(input.speaking.map((s) => s.id));
  const limit = new Date(input.now).getTime() - REMOVE_AFTER_MS;
  return {
    upload: input.local.filter((id) => !remote.has(id)),
    download: input.speaking.filter((s) => s.date >= input.keepSince && !local.has(s.id) && remote.has(s.id)).map((s) => s.id),
    remove: input.remote.filter((r) => !speaking.has(r.id) && new Date(r.createdAt).getTime() < limit).map((r) => r.id),
  };
}
