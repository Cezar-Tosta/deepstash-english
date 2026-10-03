import { describe, expect, it } from 'vitest';
import { buildCoachPrompt, type CoachContext } from './coach';

const base: CoachContext = {
  step: 'mine',
  cycleWeek: 2,
  bookTitle: 'Getting Things Done',
  ideaTitle: 'Thought Into Action',
  cardsText: 'Your mind is for having ideas, not holding them.',
  mainIdea: 'We should focus on one task at a time.',
  chunks: ['one thing at a time'],
  attempt: '',
};

describe('orientação da IA por etapa', () => {
  it('leva o objetivo da etapa e o conteúdo em estudo', () => {
    const { system, user } = buildCoachPrompt(base);
    expect(system).toContain('MINE');
    expect(system).toContain('Semana 2');
    expect(user).toContain('Livro: Getting Things Done');
    expect(user).toContain('Your mind is for having ideas');
    expect(user).toContain('Chunks escolhidos: one thing at a time');
  });

  it('cada etapa pede um tipo diferente de ajuda', () => {
    expect(buildCoachPrompt({ ...base, step: 'retell' }).system).toContain('roteiro');
    expect(buildCoachPrompt({ ...base, step: 'reflect' }).system).toContain('ângulos');
    expect(buildCoachPrompt({ ...base, step: 'sowhat' }).system).toContain('ação');
  });

  it('orienta sem entregar a resposta, e considera o que o aluno já escreveu', () => {
    const { system, user } = buildCoachPrompt({ ...base, step: 'reflect', attempt: 'I agree because it works.' });
    expect(system).toContain('não entrega a resposta pronta');
    expect(user).toContain('I agree because it works.');
  });

  it('sem conteúdo registrado, orienta sobre a etapa em geral', () => {
    const { user } = buildCoachPrompt({ ...base, bookTitle: '', ideaTitle: '', cardsText: '', mainIdea: '', chunks: [] });
    expect(user).toContain('Ainda não há conteúdo');
  });
});
