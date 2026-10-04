import { describe, expect, it } from 'vitest';
import { type SuggestionInput, suggestToday } from './suggestion';

const quiet: SuggestionInput = {
  date: '2026-10-07',
  cycleDay: 3,
  dueReviews: 0,
  overdueReviews: 0,
  session: 'completed',
  currentStepLabel: '',
  remainingMinutes: 0,
  sessionMinutes: 30,
  speakingLabel: '1–2 minutos',
  pendingActions: 0,
  trainableItems: 0,
  hardItems: 0,
  daysSincePractice: 0,
  weekIdeas: 0,
  weeklyDone: false,
};
const ids = (input: Partial<SuggestionInput>) => suggestToday({ ...quiet, ...input }).map((s) => s.id);

describe('sugestão de estudo para o dia', () => {
  it('dia em dia: nada a sugerir', () => {
    expect(suggestToday(quiet)).toEqual([]);
  });

  it('sem sessão: sugere a sessão, que já começa pelas revisões', () => {
    const plan = suggestToday({ ...quiet, session: 'none', dueReviews: 4 });
    expect(plan.map((s) => s.id)).toEqual(['session']);
    expect(plan[0]).toMatchObject({ minutes: 30, to: '/session' });
    expect(plan[0]?.detail).toContain('Começa por 4 revisões');
    expect(plan[0]?.detail).toContain('1–2 minutos');
  });

  it('sessão em andamento: retoma de onde parou, com o tempo que falta', () => {
    const [step] = suggestToday({ ...quiet, session: 'in_progress', currentStepLabel: 'RETELL', remainingMinutes: 10 });
    expect(step).toMatchObject({ title: 'Continue a sessão na etapa RETELL', minutes: 10 });
  });

  it('revisões pendentes fora da sessão vêm antes de tudo e avisam das atrasadas', () => {
    const plan = suggestToday({ ...quiet, dueReviews: 3, overdueReviews: 1, pendingActions: 1 });
    expect(plan.map((s) => s.id)).toEqual(['reviews', 'actions']);
    expect(plan[0]?.title).toBe('Revise 3 expressões');
    expect(plan[0]?.detail).toContain('1 está atrasada');
  });

  it('treino: sugerido a cada 2 dias, ou na primeira vez, se houver o que treinar', () => {
    expect(ids({ trainableItems: 8, daysSincePractice: 2 })).toEqual(['practice']);
    expect(ids({ trainableItems: 8, daysSincePractice: 1 })).toEqual([]);
    expect(ids({ trainableItems: 8, daysSincePractice: null })).toEqual(['practice']);
    expect(ids({ trainableItems: 0, daysSincePractice: null })).toEqual([]);
  });

  it('o treino tem no máximo 5 termos e destaca os difíceis', () => {
    const [few] = suggestToday({ ...quiet, trainableItems: 3, daysSincePractice: 4 });
    expect(few).toMatchObject({ title: 'Treine 3 termos', minutes: 3 });
    const [hard] = suggestToday({ ...quiet, trainableItems: 20, hardItems: 4, daysSincePractice: 4 });
    expect(hard?.title).toBe('Treine 5 termos');
    expect(hard?.detail).toContain('4 termos em que você mais erra');
  });

  it('fechamento da semana: na sexta, depois da sessão, se houve estudo e ainda não foi feito', () => {
    expect(ids({ cycleDay: 5, weekIdeas: 5 })).toEqual(['weekly']);
    expect(ids({ cycleDay: 4, weekIdeas: 5 })).toEqual([]);
    expect(ids({ cycleDay: 5, weekIdeas: 0 })).toEqual([]);
    expect(ids({ cycleDay: 5, weekIdeas: 5, weeklyDone: true })).toEqual([]);
    expect(ids({ cycleDay: 5, weekIdeas: 4, session: 'none' })).toEqual(['session']);
  });

  it('sábado e domingo: só revisões, mesmo com sessão, ações e treino pendentes', () => {
    const busy = {
      session: 'none' as const,
      dueReviews: 3,
      pendingActions: 2,
      trainableItems: 9,
      daysSincePractice: 5,
      weekIdeas: 4,
    };
    expect(ids({ ...busy, cycleDay: 6 })).toEqual(['reviews']);
    expect(ids({ ...busy, cycleDay: 7 })).toEqual(['reviews']);
    expect(ids({ ...busy, cycleDay: 7, dueReviews: 0 })).toEqual([]);
  });

  it('dia cheio numa sexta: a ordem é revisar, sessão, ações, treino', () => {
    expect(
      ids({
        cycleDay: 5,
        session: 'in_progress',
        currentStepLabel: 'MINE',
        remainingMinutes: 12,
        dueReviews: 2,
        pendingActions: 2,
        trainableItems: 9,
        daysSincePractice: 3,
        weekIdeas: 4,
      }),
    ).toEqual(['reviews', 'session', 'actions', 'practice']);
  });
});
