import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { isDigestEmpty, loadDayDigest } from '../services/digest';
import { recordPractice } from '../services/maintenance';
import { addChunk, addIdea, recordSpeaking, saveTranscript, startSession, updateIdea } from '../services/sessions';
import type { FeedbackKind, FeedbackTarget } from '../domain/types';
import { type AIProvider } from './AIProvider';
import { getFeedbackFor } from './feedback';
import { buildSummaryPrompt, generateStudySummary } from './summary';

const DAY = '2026-10-06';

function fakeAI(reply: string) {
  const calls: { system: string; user: string }[] = [];
  const provider: AIProvider = {
    id: 'fake',
    model: 'fake',
    complete: async (request) => {
      calls.push({ system: request.system, user: request.user });
      return reply;
    },
    chat: async () => '',
  };
  return { provider, calls };
}

async function feedback(targetType: FeedbackTarget, targetId: string, kind: FeedbackKind, original: string, corrected: string, why = '') {
  await db.aiFeedback.add({
    id: `${targetId}-${kind}-${original.length}`,
    kind,
    targetType,
    targetId,
    original,
    corrected,
    explanation: why,
    moreNatural: null,
    provider: 'fake',
    model: 'fake',
    createdAt: nowISO(),
  });
}

async function seed() {
  const session = await startSession(DAY);
  const idea = await addIdea(session.id, { title: 'Thought Into Action' });
  await updateIdea(idea.id, { mainIdea: 'The main idea are focus.' });
  await db.sessions.update(session.id, { ideaOfDayId: idea.id });
  const used = await addChunk(session.id, {
    text: 'one thing at a time',
    meaning: 'uma coisa de cada vez',
    originalSentence: 'Do one thing at a time.',
    sourceIdeaId: idea.id,
  });
  const unused = await addChunk(session.id, {
    text: 'out of your head',
    meaning: 'fora da cabeça',
    originalSentence: 'Keep it out of your head.',
    sourceIdeaId: idea.id,
  });
  return { session, idea, used, unused };
}

describe('resumo do dia: o que estudar', () => {
  it('sem correções, erros nem revisões esquecidas, não há o que resumir e a IA não é chamada', async () => {
    const { session, idea } = await seed();
    await feedback('mainIdea', idea.id, 'grammar', 'Focus on one task.', 'Focus on one task.');
    const digest = (await loadDayDigest(session.id))!;
    expect(isDigestEmpty(digest)).toBe(true);
    expect(digest.cleanFeedback).toBe(1);

    const { provider, calls } = fakeAI('x');
    expect(await generateStudySummary(session.id, provider)).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('junta as correções do dia, os erros nos exercícios e os chunks não usados na fala', async () => {
    const { session, idea, used, unused } = await seed();
    await feedback('mainIdea', idea.id, 'grammar', 'The main idea are focus.', 'The main idea is focus.', 'Concordância: idea is.');
    await feedback(
      'chunkSentence',
      used.id,
      'improve',
      'I do one thing at a time in work.',
      'I do one thing at a time at work.',
      'Preposição: at work.',
    );
    await recordPractice(`chunk:${unused.id}`, false);
    await recordPractice(`chunk:${unused.id}`, false);
    const speaking = await recordSpeaking({
      kind: 'daily',
      sessionId: session.id,
      ideaId: idea.id,
      date: DAY,
      durationSec: 60,
      targetSec: 60,
    });
    await saveTranscript(String(speaking), 'I try to do one thing at a time.');

    const digest = (await loadDayDigest(session.id))!;
    expect(digest.corrections.map((c) => [c.target, c.corrected])).toEqual([
      ['mainIdea', 'The main idea is focus.'],
      ['chunkSentence', 'I do one thing at a time at work.'],
    ]);
    expect(digest.hardTerms.map((t) => [t.term, t.wrong])).toEqual([['out of your head', 2]]);
    expect(digest.unusedChunks).toEqual(['out of your head']);

    const { user, system } = buildSummaryPrompt(digest);
    expect(system).toContain('não invente erros');
    expect(user).toContain('"The main idea are focus." → "The main idea is focus." | Concordância: idea is.');
    expect(user).toContain('out of your head (fora da cabeça): 2 erros, 0 acertos');
    expect(user).toContain('NÃO USOU AO RECONTAR');
  });

  it('o resumo da IA fica guardado na sessão', async () => {
    const { session, idea } = await seed();
    await feedback('mainIdea', idea.id, 'grammar', 'The main idea are focus.', 'The main idea is focus.');
    const { provider, calls } = fakeAI('- **Concordância**: idea is.\n\nPróximo passo: revisar.');

    expect(await generateStudySummary(session.id, provider)).toContain('Próximo passo');
    expect(calls).toHaveLength(1);
    const stored = await db.sessions.get(session.id);
    expect(stored?.studySummary).toContain('**Concordância**');
    expect(stored?.studySummaryAt).toBeTruthy();
  });

  it('cada pedido de retorno vira uma resposta própria; as anteriores continuam guardadas', async () => {
    const { used } = await seed();
    await feedback(
      'chunkSentence',
      used.id,
      'grammar',
      'I do one thing at a time in work.',
      'I do one thing at a time at work.',
      'Preposição.',
    );
    await feedback(
      'chunkSentence',
      used.id,
      'natural',
      'I do one thing at a time in work.',
      'I focus on one thing at a time at work.',
      'Mais natural.',
    );
    const history = await getFeedbackFor('chunkSentence', used.id);
    expect(history.map((f) => [f.kind, f.explanation]).toReversed()).toEqual([
      ['grammar', 'Preposição.'],
      ['natural', 'Mais natural.'],
    ]);
  });
});
