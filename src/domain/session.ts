import { formatDate } from './dates';
import type { StepId, ISODate } from './types';

/** Limite rígido do método: no máximo 3 chunks novos por dia. */
export const MAX_CHUNKS_PER_DAY = 3;

export interface StepDef {
  id: StepId;
  label: string;
  hint: string;
  /** Com que frequência a etapa é feita. */
  frequency: string;
  /** Tempo sugerido, em minutos. */
  minutes: number;
}

const DAILY = 'Dias 1 a 5 do ciclo';

/** A sessão acontece nos 5 primeiros dias do ciclo de 7; os dias 6 e 7 são só de revisões. */
export const SESSION_DAYS_PER_WEEK = 5;

export const STEPS: readonly StepDef[] = [
  { id: 'review', label: 'REVIEW', hint: 'Recupere antes de olhar.', frequency: `${DAILY}, antes de ler`, minutes: 5 },
  { id: 'read', label: 'READ', hint: 'Leia as ideias sem traduzir primeiro.', frequency: DAILY, minutes: 8 },
  { id: 'focus', label: 'IDEA OF THE DAY', hint: 'Escolha uma ideia para aprofundar.', frequency: DAILY, minutes: 1 },
  { id: 'check', label: 'CHECK', hint: 'Confirme a compreensão.', frequency: DAILY, minutes: 3 },
  { id: 'mine', label: 'MINE', hint: 'Até 3 chunks úteis.', frequency: `${DAILY}, no máximo 3 chunks`, minutes: 3 },
  { id: 'retell', label: 'RETELL', hint: 'Explique sem olhar.', frequency: DAILY, minutes: 3 },
  { id: 'personalize', label: 'PERSONALIZE', hint: 'Use o inglês.', frequency: DAILY, minutes: 3 },
  { id: 'reflect', label: 'REFLECT', hint: 'Do I agree?', frequency: DAILY, minutes: 2 },
  { id: 'sowhat', label: 'SO WHAT?', hint: 'Transforme em ação.', frequency: DAILY, minutes: 1 },
  { id: 'schedule', label: 'SCHEDULE REVIEW', hint: 'Agende e encerre.', frequency: DAILY, minutes: 1 },
];

export interface RoutineItem {
  activity: string;
  frequency: string;
  detail: string;
}

/** A rotina completa do método: o que fazer e de quanto em quanto tempo. */
export const ROUTINE: readonly RoutineItem[] = [
  {
    activity: 'Sessão de estudo',
    frequency: 'Dias 1 a 5 do ciclo',
    detail: `${STEPS.reduce((sum, s) => sum + s.minutes, 0)} min: as 10 etapas, do REVIEW ao SCHEDULE REVIEW.`,
  },
  {
    activity: 'Dias de revisão',
    frequency: 'Dias 6 e 7 do ciclo',
    detail: 'Sem sessão nova: só as revisões que caírem nesses dias.',
  },
  {
    activity: 'Revisão de cada chunk',
    frequency: '5 vezes',
    detail: '1, 3, 7, 14 e 30 dias depois de aprendido (D1, D3, D7, D14, D30).',
  },
  {
    activity: 'Did you do it?',
    frequency: '3 dias depois',
    detail: 'Cada ação do "So what?" é cobrada uma vez, na tela Today.',
  },
  { activity: 'Exercícios', frequency: '2 a 3 vezes por ciclo', detail: 'Treino curto com os termos em que você mais erra.' },
  {
    activity: 'Fechamento do ciclo',
    frequency: 'Dia 5 do ciclo',
    detail: 'Depois da última sessão do ciclo: relembrar as ideias, Top 3, ouvir suas falas, fala livre e texto de 80 a 120 palavras.',
  },
  {
    activity: 'Fechamento do livro',
    frequency: 'Ao terminar cada livro',
    detail: 'Explicar o livro em 2 minutos e escrever o que fica dele.',
  },
  {
    activity: 'Fases',
    frequency: 'Uma por ciclo, de 1 a 4',
    detail:
      'O ciclo tem 7 dias e começa na data que você escolher em Settings. A cada ciclo, a meta de fala sobe de 1 para 2 a 3 minutos e a tradução vai sendo reduzida.',
  },
];

export interface CycleDayNames {
  /** Dias de sessão, por exemplo "ter a sáb". */
  session: string;
  /** Dias de revisão, por exemplo "dom e seg". Vazio se o ciclo foi encurtado antes deles. */
  rest: string;
  /** Dia do fechamento, por exemplo "sáb". */
  closing: string;
}

/** Os dias da semana em que cai cada parte do ciclo, a partir das datas dele. */
export function cycleDayNames(days: readonly ISODate[]): CycleDayNames {
  const name = (date: ISODate | undefined): string => (date ? formatDate(date, 'weekday').replace('.', '') : '');
  const session = days.slice(0, SESSION_DAYS_PER_WEEK);
  const rest = days.slice(SESSION_DAYS_PER_WEEK);
  return {
    session: session.length > 1 ? `${name(session[0])} a ${name(session.at(-1))}` : name(session[0]),
    rest: rest.map(name).join(' e '),
    closing: days.length >= SESSION_DAYS_PER_WEEK ? name(days[SESSION_DAYS_PER_WEEK - 1]) : '',
  };
}

/**
 * A rotina com os dias da semana do ciclo em andamento: "Dias 1 a 5 (ter a sáb)".
 * Sem ciclo em andamento, fica a descrição genérica, por dia do ciclo.
 */
export function routineFor(days: readonly ISODate[] | null): readonly RoutineItem[] {
  if (!days || days.length === 0) return ROUTINE;
  const names = cycleDayNames(days);
  const labels: Record<string, string> = {
    'Sessão de estudo': `Dias 1 a 5 (${names.session})`,
    'Dias de revisão': names.rest ? `Dias 6 e 7 (${names.rest})` : 'Dias 6 e 7 do ciclo',
    'Fechamento do ciclo': names.closing ? `Dia 5 (${names.closing})` : 'Dia 5 do ciclo',
  };
  return ROUTINE.map((item) => ({ ...item, frequency: labels[item.activity] ?? item.frequency }));
}

export function stepIndex(id: StepId): number {
  const index = STEPS.findIndex((s) => s.id === id);
  return index < 0 ? 0 : index;
}

export function canAddChunk(currentCount: number): boolean {
  return currentCount < MAX_CHUNKS_PER_DAY;
}

/** Uma palavra só raramente é um chunk reutilizável; a tela usa isto para avisar, não para bloquear. */
export function looksLikeSingleWord(text: string): boolean {
  return text.trim().split(/\s+/).filter(Boolean).length < 2;
}

export interface ProgressInput {
  /** Ideias lidas hoje. Não há meta numérica: basta ter lido ao menos uma. */
  ideas: number;
  hasIdeaOfDay: boolean;
  hasMainIdea: boolean;
  chunks: number;
  sentences: number;
  spoke: boolean;
  hasView: boolean;
  hasSoWhat: boolean;
}

/** Percentual da sessão, de 0 a 100. Cada pilar do método pesa o mesmo. */
export function sessionProgress(p: ProgressInput): number {
  const parts = [
    p.ideas > 0 ? 1 : 0,
    p.hasIdeaOfDay ? 1 : 0,
    p.hasMainIdea ? 1 : 0,
    Math.min(p.chunks, MAX_CHUNKS_PER_DAY) / MAX_CHUNKS_PER_DAY,
    Math.min(p.sentences, MAX_CHUNKS_PER_DAY) / MAX_CHUNKS_PER_DAY,
    p.spoke ? 1 : 0,
    p.hasView ? 1 : 0,
    p.hasSoWhat ? 1 : 0,
  ];
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
