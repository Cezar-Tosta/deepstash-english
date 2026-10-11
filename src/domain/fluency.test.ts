import { describe, expect, it } from 'vitest';
import { fluencyOf } from './fluency';

describe('métricas de fala a partir da transcrição', () => {
  const transcript = 'Um, the text is about sleep. Sleep is, you know, very important for the brain and for memory.';

  it('palavras por minuto contam só as palavras ditas, sem as hesitações', () => {
    const m = fluencyOf(transcript, 10, []);
    // 18 palavras ditas; "um" e "you know" (3 palavras) são hesitações: 15 palavras em 10 s = 90 por minuto.
    expect(m.words).toBe(15);
    expect(m.wpm).toBe(90);
    expect(m.fillers).toBe(2);
  });

  it('variedade: palavras diferentes sobre o total, sem contar maiúsculas', () => {
    // 15 palavras, 11 diferentes (the, is, sleep, for se repetem).
    expect(fluencyOf(transcript, 10, []).variety).toBeCloseTo(11 / 15);
  });

  it('conta os chunks usados, tolerando outra flexão', () => {
    const m = fluencyOf('I keep a regular schedule and I am holding my ideas.', 20, [
      'regular schedule',
      'hold my ideas',
      'out of your head',
    ]);
    expect(m.chunksUsed).toEqual(['regular schedule', 'hold my ideas']);
  });

  it('sem fala ou sem duração, não há ritmo', () => {
    expect(fluencyOf('', 30, [])).toMatchObject({ words: 0, wpm: null, variety: null });
    expect(fluencyOf('Hello there.', 0, []).wpm).toBeNull();
  });
});
