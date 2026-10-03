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
  draftPt: '',
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

describe('leitura de imagem por card', () => {
  it('remove cerca de código e aspas em volta do texto, sem mexer no conteúdo', async () => {
    const { cleanCardText } = await import('./coach');
    expect(cleanCardText('```\nDo one thing at a time.\n```')).toBe('Do one thing at a time.');
    expect(cleanCardText('“Keep it out of your head.”')).toBe('Keep it out of your head.');
    expect(cleanCardText('  He said "focus" twice.\n\nSecond paragraph.  ')).toBe('He said "focus" twice.\n\nSecond paragraph.');
  });
});

describe('modelos em uso', () => {
  it('informa o modelo de cada função, com os padrões do provedor', async () => {
    const { modelsInUse } = await import('./feedback');
    const base = { baseUrl: '', model: '', apiKey: 'k' };
    expect(modelsInUse({ ...base, provider: 'groq' })).toEqual({
      provider: 'Groq',
      text: 'llama-3.3-70b-versatile',
      images: 'meta-llama/llama-4-scout-17b-16e-instruct',
      audio: 'whisper-large-v3-turbo',
    });
    expect(modelsInUse({ ...base, provider: 'groq', model: 'meu-modelo', visionModel: 'minha-visao' })).toMatchObject({
      text: 'meu-modelo',
      images: 'minha-visao',
    });
    expect(modelsInUse({ ...base, provider: 'anthropic' })).toEqual({
      provider: 'Anthropic',
      text: 'claude-opus-5-5',
      images: 'claude-opus-5-5',
      audio: null,
    });
    expect(modelsInUse({ ...base, provider: 'none' })).toBeNull();
  });
});

describe('rascunho em português', () => {
  it('a orientação parte do que o aluno quer dizer, sem traduzir por ele', () => {
    const { system, user } = buildCoachPrompt({
      ...base,
      step: 'reflect',
      draftPt: 'Concordo, mas no meu trabalho preciso cuidar de várias coisas ao mesmo tempo.',
    });
    expect(user).toContain('rascunho dele em português: Concordo, mas no meu trabalho');
    expect(system).toContain('Parta desse rascunho');
    expect(system).toContain('Não traduza o rascunho inteiro');
  });

  it('sem rascunho, a instrução extra não aparece', () => {
    expect(buildCoachPrompt({ ...base, step: 'reflect' }).system).not.toContain('Parta desse rascunho');
  });
});

describe('importação por imagens com qualquer quantidade de cards', () => {
  it('junta os lotes mantendo a ordem e o primeiro título encontrado', async () => {
    const { mergeImported } = await import('./coach');
    expect(
      mergeImported([
        { title: 'Make It Obvious', cards: ['1', '2', '3', '4'] },
        { title: '', cards: ['5', '6', '7', '8'] },
        { title: 'Outro', cards: ['9'] },
      ]),
    ).toEqual({ title: 'Make It Obvious', cards: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] });
    expect(mergeImported([])).toEqual({ title: '', cards: [] });
  });
});
