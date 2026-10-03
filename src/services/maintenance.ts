import { DATA_TABLES, db } from '../data/db';
import { addDays, nowISO } from '../domain/dates';
import type { Idea, ISODate, PracticeStat, SpeakingSession } from '../domain/types';

// ---------- Recomeçar ----------

export interface WeekContents {
  sessions: number;
  ideas: number;
  chunks: number;
  speaking: number;
}

async function weekScope(weekStart: ISODate) {
  const weekEnd = addDays(weekStart, 6);
  const sessions = await db.sessions.where('date').between(weekStart, weekEnd, true, true).toArray();
  const sessionIds = sessions.map((s) => s.id);
  const [ideas, chunks, speaking, writings] = await Promise.all([
    db.ideas.where('sessionId').anyOf(sessionIds).toArray(),
    db.chunks.where('sessionId').anyOf(sessionIds).toArray(),
    db.speaking.where('date').between(weekStart, weekEnd, true, true).toArray(),
    db.writings.where('weekStart').equals(weekStart).toArray(),
  ]);
  return { sessionIds, ideas, chunks, speaking, writings };
}

/** O que existe na semana, para o usuário conferir antes de apagar. */
export async function weekContents(weekStart: ISODate): Promise<WeekContents> {
  const { sessionIds, ideas, chunks, speaking } = await weekScope(weekStart);
  return { sessions: sessionIds.length, ideas: ideas.length, chunks: chunks.length, speaking: speaking.length };
}

/**
 * Apaga tudo o que foi estudado numa semana: sessões, ideias, cards, dicionário,
 * chunks (com seu histórico de revisão), falas, reflexões, fechamento e texto.
 *
 * Revisões feitas nessa semana de chunks aprendidos em semanas anteriores são
 * mantidas: apagá-las deixaria o calendário daqueles chunks incoerente.
 */
export async function resetWeek(weekStart: ISODate): Promise<void> {
  const tables = [db.recordings, ...DATA_TABLES.map((name) => db.table(name))];
  await db.transaction('rw', tables, async () => {
    const { sessionIds, ideas, chunks, speaking, writings } = await weekScope(weekStart);
    const chunkIds = chunks.map((c) => c.id);
    const speakingIds = speaking.map((s) => s.id);
    const vocab = await db.vocab.where('sessionId').anyOf(sessionIds).toArray();
    const reflections = await db.reflections.where('sessionId').anyOf(sessionIds).toArray();

    // Retornos da IA ligados a qualquer coisa que está sendo apagada.
    const targets = new Set([
      ...ideas.map((i) => i.id),
      ...chunkIds,
      ...speakingIds,
      ...reflections.map((r) => r.id),
      ...writings.map((w) => w.id),
    ]);
    const feedback = await db.aiFeedback.toArray();

    await db.aiFeedback.bulkDelete(feedback.filter((f) => targets.has(f.targetId)).map((f) => f.id));
    await db.practiceStats.bulkDelete([...chunkIds.map((id) => `chunk:${id}`), ...vocab.map((v) => `vocab:${v.id}`)]);
    await db.reviews.where('chunkId').anyOf(chunkIds).delete();
    await db.chunks.bulkDelete(chunkIds);
    await db.vocab.bulkDelete(vocab.map((v) => v.id));
    await db.reflections.bulkDelete(reflections.map((r) => r.id));
    await db.cards.where('sessionId').anyOf(sessionIds).delete();
    await db.ideas.bulkDelete(ideas.map((i) => i.id));
    await db.recordings.bulkDelete(speakingIds);
    await db.speaking.bulkDelete(speakingIds);
    await db.writings.bulkDelete(writings.map((w) => w.id));
    await db.weeklyReviews.delete(weekStart);
    await db.sessions.bulkDelete(sessionIds);
  });
}

/** Apaga todos os estudos e recomeça do zero. Tema e configuração de IA são mantidos. */
export async function resetAll(): Promise<void> {
  const tables = [db.settings, db.recordings, ...DATA_TABLES.map((name) => db.table(name))];
  await db.transaction('rw', tables, async () => {
    await db.recordings.clear();
    await Promise.all(DATA_TABLES.map((name) => db.table(name).clear()));
    // O ciclo de 4 semanas recomeça na próxima sessão.
    const settings = await db.settings.get('settings');
    if (settings) await db.settings.put({ ...settings, cycleStartDate: null });
  });
}

// ---------- Desempenho nos exercícios ----------

export function recordPractice(itemKey: string, correct: boolean): Promise<void> {
  return db.transaction('rw', db.practiceStats, async () => {
    const current: PracticeStat = (await db.practiceStats.get(itemKey)) ?? {
      id: itemKey,
      right: 0,
      wrong: 0,
      lastAt: '',
    };
    await db.practiceStats.put({
      ...current,
      right: current.right + (correct ? 1 : 0),
      wrong: current.wrong + (correct ? 0 : 1),
      lastAt: nowISO(),
    });
  });
}

// ---------- Áudios das falas ----------

export async function saveRecording(speakingId: string, blob: Blob): Promise<void> {
  await db.recordings.put({ id: speakingId, blob, createdAt: nowISO() });
}

export interface SpokenItem {
  speaking: SpeakingSession;
  idea: Idea | null;
  /** O áudio só existe no navegador em que a fala foi gravada. */
  audio: Blob | null;
}

/** As falas de uma semana, da mais antiga para a mais recente, com o áudio quando há. */
export async function listWeekSpeaking(weekStart: ISODate): Promise<SpokenItem[]> {
  const speaking = await db.speaking
    .where('date')
    .between(weekStart, addDays(weekStart, 6), true, true)
    .sortBy('createdAt');
  return Promise.all(
    speaking.map(async (s): Promise<SpokenItem> => ({
      speaking: s,
      idea: s.ideaId ? ((await db.ideas.get(s.ideaId)) ?? null) : null,
      audio: (await db.recordings.get(s.id))?.blob ?? null,
    })),
  );
}

export interface RecordingsUsage {
  count: number;
  bytes: number;
}

export async function recordingsUsage(): Promise<RecordingsUsage> {
  const all = await db.recordings.toArray();
  return { count: all.length, bytes: all.reduce((sum, r) => sum + r.blob.size, 0) };
}

/** Apaga os áudios gravados antes de `date`. As transcrições e os tempos ficam. */
export async function deleteRecordingsBefore(date: ISODate): Promise<number> {
  return db.recordings.where('createdAt').below(date).delete();
}
