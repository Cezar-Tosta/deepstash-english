import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { ROUTINE, STEPS } from '../domain/session';
import {
  deleteRecordingsBefore,
  deleteSpeaking,
  listWeekSpeaking,
  recordPractice,
  resetAll,
  resetWeek,
  saveRecording,
  weekContents,
} from './maintenance';
import { rateChunk } from './reviews';
import { addChunk, addIdea, recordSpeaking, saveReflection, setIdeaOfDay, startSession } from './sessions';
import { addToDictionary, saveBookNote } from './study';
import { saveWeeklyReview } from './weekly';

const WEEK1 = '2026-09-28';
const WEEK2 = '2026-10-05';

/** Uma sessão completa num dia, com tudo o que uma semana pode conter. */
async function study(date: string, title: string) {
  const session = await startSession(date);
  const idea = await addIdea(session.id, { title, bookTitle: 'Atomic Habits', cards: ['one', 'two'] });
  await setIdeaOfDay(session.id, idea.id);
  const chunk = await addChunk(session.id, { text: `${title} chunk`, meaning: 'x' });
  const entry = await addToDictionary({ ideaId: idea.id, term: `${title} word`, meaning: 'y' });
  await saveReflection(session.id, idea.id, { soWhat: "I'll do it." });
  const speakingId = await recordSpeaking({ kind: 'daily', sessionId: session.id, ideaId: idea.id, date, durationSec: 60, targetSec: 60 });
  await recordPractice(`chunk:${chunk.id}`, false);
  await recordPractice(`vocab:${entry.id}`, true);
  return { session, idea, chunk, entry, speakingId: speakingId ?? '' };
}

describe('resetar uma semana', () => {
  it('apaga tudo daquela semana e não toca nas outras', async () => {
    const first = await study('2026-09-29', 'Week one');
    const second = await study('2026-10-06', 'Week two');
    await saveWeeklyReview(WEEK1, { topIdeaIds: [first.idea.id] });
    await saveBookNote('atomic habits', 'Atomic Habits', { takeaway: 'Small habits.' });

    expect(await weekContents(WEEK1)).toEqual({ sessions: 1, ideas: 1, chunks: 1, speaking: 1 });
    await resetWeek(WEEK1);

    expect(await weekContents(WEEK1)).toEqual({ sessions: 0, ideas: 0, chunks: 0, speaking: 0 });
    expect(await db.weeklyReviews.get(WEEK1)).toBeUndefined();
    expect(await db.cards.where('ideaId').equals(first.idea.id).count()).toBe(0);
    expect(await db.practiceStats.get(`chunk:${first.chunk.id}`)).toBeUndefined();
    expect(await db.reflections.where('ideaId').equals(first.idea.id).count()).toBe(0);

    expect(await weekContents(WEEK2)).toEqual({ sessions: 1, ideas: 1, chunks: 1, speaking: 1 });
    expect(await db.cards.where('ideaId').equals(second.idea.id).count()).toBe(2);
    expect(await db.practiceStats.get(`chunk:${second.chunk.id}`)).toMatchObject({ wrong: 1 });
    expect(await db.bookNotes.count()).toBe(1);
  });

  it('mantém as revisões feitas na semana de chunks aprendidos antes', async () => {
    const first = await study('2026-09-29', 'Old');
    await rateChunk(first.chunk.id, 'GOOD', '', '2026-10-06');
    await study('2026-10-06', 'New');

    await resetWeek(WEEK2);

    expect(await db.reviews.where('chunkId').equals(first.chunk.id).count()).toBe(1);
    expect((await db.chunks.get(first.chunk.id))?.stage).toBe(1);
  });

  it('depois do reset dá para estudar o mesmo dia de novo', async () => {
    await study('2026-09-29', 'First try');
    await resetWeek(WEEK1);
    const again = await study('2026-09-29', 'Second try');
    expect(again.session.status).toBe('in_progress');
    expect(await db.ideas.count()).toBe(1);
  });
});

describe('recomeçar do zero', () => {
  it('apaga todos os estudos, preservando tema e IA e reiniciando o ciclo', async () => {
    await study('2026-09-29', 'A');
    await db.settings.put({ ...(await db.settings.get('settings'))!, theme: 'dark', ai: { provider: 'groq', baseUrl: '', model: '', apiKey: 'k' } });

    await resetAll();

    expect(await db.sessions.count()).toBe(0);
    expect(await db.ideas.count()).toBe(0);
    expect(await db.practiceStats.count()).toBe(0);
    expect(await db.settings.get('settings')).toMatchObject({
      theme: 'dark',
      cycleStartDate: null,
      ai: { provider: 'groq', apiKey: 'k' },
    });
  });
});

describe('desempenho nos exercícios', () => {
  it('acumula acertos e erros por termo', async () => {
    await recordPractice('vocab:x', false);
    await recordPractice('vocab:x', false);
    await recordPractice('vocab:x', true);
    expect(await db.practiceStats.get('vocab:x')).toMatchObject({ right: 1, wrong: 2 });
  });
});

describe('áudios das falas', () => {
  it('lista as falas da semana com o áudio, quando ele existe neste navegador', async () => {
    const withAudio = await study('2026-09-29', 'Recorded');
    const noAudio = await study('2026-09-30', 'Only time');
    await study('2026-10-06', 'Other week');
    await saveRecording(withAudio.speakingId, new Blob(['audio'], { type: 'audio/webm' }));

    const spoken = await listWeekSpeaking(WEEK1);
    expect(spoken.map((s) => [s.idea?.title, s.audio !== null])).toEqual([
      ['Recorded', true],
      ['Only time', false],
    ]);
    expect(noAudio.speakingId).not.toBe('');
  });

  it('apagar áudios antigos mantém o registro da fala', async () => {
    const { speakingId } = await study('2026-09-29', 'Recorded');
    await saveRecording(speakingId, new Blob(['audio']));

    expect(await deleteRecordingsBefore('2999-01-01')).toBe(1);
    expect(await db.recordings.count()).toBe(0);
    expect(await db.speaking.get(speakingId)).toMatchObject({ durationSec: 60 });
  });
});

describe('excluir uma fala', () => {
  it('remove o áudio e o registro, e o tempo deixa de contar na semana', async () => {
    const keep = await study('2026-09-29', 'Keep');
    const drop = await study('2026-09-30', 'Drop');
    await saveRecording(drop.speakingId, new Blob(['audio']));

    await deleteSpeaking(drop.speakingId);

    expect(await db.speaking.get(drop.speakingId)).toBeUndefined();
    expect(await db.recordings.count()).toBe(0);
    expect((await listWeekSpeaking(WEEK1)).map((s) => s.idea?.title)).toEqual(['Keep']);
    expect(await db.speaking.get(keep.speakingId)).toBeDefined();
    // A ideia e o resto da sessão não são tocados.
    expect(await db.ideas.count()).toBe(2);
  });
});
describe('frequência das etapas', () => {
  it('toda etapa da sessão informa frequência e tempo, somando cerca de 30 minutos', () => {
    expect(STEPS.every((s) => s.frequency && s.minutes > 0)).toBe(true);
    expect(STEPS.reduce((sum, s) => sum + s.minutes, 0)).toBe(30);
  });

  it('a rotina cobre do dia a dia ao ciclo de 4 semanas', () => {
    expect(ROUTINE.map((r) => r.frequency)).toEqual([
      'Segunda a sexta',
      'Sábado e domingo',
      '5 vezes',
      '3 dias depois',
      '2 a 3 vezes por semana',
      'Sexta-feira',
      'Ao terminar cada livro',
      'A cada 4 semanas',
    ]);
  });
});
