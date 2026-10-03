import { describe, expect, it } from 'vitest';
import { createFixedIntervalScheduler } from './fixedInterval';

const s = createFixedIntervalScheduler();

describe('calendário D1/D3/D7/D14/D30', () => {
  it('reproduz o exemplo do método para um chunk criado em 03/10', () => {
    expect(s.plan('2026-10-03')).toEqual([
      { stage: 0, label: 'D1', date: '2026-10-04' },
      { stage: 1, label: 'D3', date: '2026-10-06' },
      { stage: 2, label: 'D7', date: '2026-10-10' },
      { stage: 3, label: 'D14', date: '2026-10-17' },
      { stage: 4, label: 'D30', date: '2026-11-02' },
    ]);
  });

  it('agenda a primeira revisão para D1', () => {
    expect(s.initial('2026-10-03')).toEqual({
      stage: 0,
      nextReviewDate: '2026-10-04',
      status: 'new',
    });
  });

  it('GOOD em dia percorre exatamente o calendário e termina em learned', () => {
    let state = s.initial('2026-10-03');
    const visited: (string | null)[] = [];
    while (state.nextReviewDate) {
      visited.push(state.nextReviewDate);
      state = s.next(state, 'GOOD', state.nextReviewDate);
    }
    expect(visited).toEqual(['2026-10-04', '2026-10-06', '2026-10-10', '2026-10-17', '2026-11-02']);
    expect(state.status).toBe('learned');
  });
});

describe('avaliações', () => {
  const atD7 = { stage: 2, nextReviewDate: '2026-10-10', status: 'learning' } as const;

  it('AGAIN antecipa para amanhã e volta um estágio', () => {
    expect(s.next(atD7, 'AGAIN', '2026-10-10')).toEqual({
      stage: 1,
      nextReviewDate: '2026-10-11',
      status: 'learning',
    });
  });

  it('AGAIN no primeiro estágio não fica negativo', () => {
    expect(s.next(s.initial('2026-10-03'), 'AGAIN', '2026-10-04').stage).toBe(0);
  });

  it('HARD repete o estágio com intervalo encurtado', () => {
    // O intervalo para chegar em D7 é de 4 dias; HARD usa metade.
    expect(s.next(atD7, 'HARD', '2026-10-10')).toEqual({
      stage: 2,
      nextReviewDate: '2026-10-12',
      status: 'learning',
    });
  });

  it('GOOD segue a programação', () => {
    expect(s.next(atD7, 'GOOD', '2026-10-10')).toEqual({
      stage: 3,
      nextReviewDate: '2026-10-17',
      status: 'learning',
    });
  });

  it('EASY pula um estágio e dá um intervalo maior', () => {
    expect(s.next(atD7, 'EASY', '2026-10-10')).toEqual({
      stage: 4,
      nextReviewDate: '2026-11-02',
      status: 'learning',
    });
  });

  it('EASY perto do fim conclui o chunk', () => {
    const atD14 = { stage: 3, nextReviewDate: '2026-10-17', status: 'learning' } as const;
    expect(s.next(atD14, 'EASY', '2026-10-17')).toEqual({
      stage: 5,
      nextReviewDate: null,
      status: 'learned',
    });
  });
});

describe('revisão atrasada', () => {
  it('conta o próximo intervalo a partir do dia em que a revisão foi feita', () => {
    // D1 era 04/10, feita só em 08/10: D3 fica 2 dias depois da revisão real.
    const next = s.next(s.initial('2026-10-03'), 'GOOD', '2026-10-08');
    expect(next).toEqual({ stage: 1, nextReviewDate: '2026-10-10', status: 'learning' });
  });
});
