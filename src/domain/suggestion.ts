import type { ISODate } from './types';

export interface SuggestionInput {
  date: ISODate;
  /** Dia do ciclo de 7 dias, de 1 a 7; null num dia sem ciclo em andamento. */
  cycleDay: number | null;
  dueReviews: number;
  overdueReviews: number;
  session: 'none' | 'in_progress' | 'completed';
  /** Etapa em que a sessão parou e quantos minutos faltam, quando está em andamento. */
  currentStepLabel: string;
  remainingMinutes: number;
  sessionMinutes: number;
  /** Meta de fala da semana do ciclo, por exemplo "1–2 minutos". */
  speakingLabel: string;
  pendingActions: number;
  /** Termos (dicionário e chunks) que já dá para treinar. */
  trainableItems: number;
  hardItems: number;
  /** Dias desde o último exercício; null se nunca treinou. */
  daysSincePractice: number | null;
  /** Ideas of the Day já estudadas neste ciclo. */
  weekIdeas: number;
  weeklyDone: boolean;
}

export interface Suggestion {
  id: 'reviews' | 'session' | 'actions' | 'practice' | 'weekly';
  title: string;
  detail: string;
  minutes: number;
  /** Tela em que a atividade é feita. */
  to: string;
}

const TRAINING_SIZE = 5;
/** O treino é sugerido quando faz pelo menos este número de dias desde o último. */
const PRACTICE_EVERY_DAYS = 2;
/** Último dia de sessão do ciclo: é quando se faz o fechamento. Depois dele, só revisões. */
const LAST_SESSION_DAY = 5;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * O plano do dia, na ordem em que vale fazer: primeiro recuperar o que está
 * agendado, depois a sessão, depois o que é periódico. No fim de semana, só as
 * revisões. Só entra o que de fato há
 * para fazer hoje; lista vazia significa que está tudo em dia.
 */
export function suggestToday(input: SuggestionInput): Suggestion[] {
  const plan: Suggestion[] = [];
  const weekend = input.cycleDay !== null && input.cycleDay > LAST_SESSION_DAY;
  const noCycle = input.cycleDay === null;

  // Com a sessão ainda por começar num dia útil, as revisões são a primeira etapa dela.
  if (input.dueReviews > 0 && (weekend || input.session !== 'none')) {
    plan.push({
      id: 'reviews',
      title: `Revise ${plural(input.dueReviews, 'expressão', 'expressões')}`,
      detail:
        input.overdueReviews > 0
          ? `${plural(input.overdueReviews, 'está atrasada', 'estão atrasadas')}. Tente lembrar antes de revelar.`
          : 'Tente lembrar e criar uma frase antes de revelar.',
      minutes: Math.max(1, Math.ceil(input.dueReviews / 2)),
      to: '/review',
    });
  }

  // Dias 6 e 7 do ciclo: só as revisões. Sessão, ações, treino e fechamento ficam para os dias de sessão.
  if (weekend) return plan;

  if (input.session === 'none') {
    plan.push({
      id: 'session',
      title: noCycle ? 'Comece um novo ciclo com a sessão de hoje' : 'Faça a sessão de hoje',
      detail: [
        noCycle && 'Não há ciclo em andamento: a sessão de hoje abre um ciclo de 7 dias.',
        input.dueReviews > 0 && `Começa por ${plural(input.dueReviews, 'revisão', 'revisões')}.`,
        'Leia as ideias no Deepstash, aprofunde uma, guarde até 3 chunks e reconte em voz alta',
        `(meta de fala: ${input.speakingLabel}).`,
      ]
        .filter(Boolean)
        .join(' '),
      minutes: input.sessionMinutes,
      to: '/session',
    });
  } else if (input.session === 'in_progress') {
    plan.push({
      id: 'session',
      title: `Continue a sessão na etapa ${input.currentStepLabel}`,
      detail: 'O que você já fez está salvo. Termine e finalize para o dia contar como completo.',
      minutes: Math.max(1, input.remainingMinutes),
      to: '/session',
    });
  }

  if (input.pendingActions > 0) {
    plan.push({
      id: 'actions',
      title: `Responda “Did you do it?” (${input.pendingActions})`,
      detail: 'Conte em inglês o que aconteceu com a ação que você se propôs.',
      minutes: input.pendingActions * 2,
      to: '/',
    });
  }

  const practiceDue = input.daysSincePractice === null || input.daysSincePractice >= PRACTICE_EVERY_DAYS;
  if (input.trainableItems > 0 && practiceDue) {
    const size = Math.min(TRAINING_SIZE, input.trainableItems);
    plan.push({
      id: 'practice',
      title: `Treine ${plural(size, 'termo', 'termos')}`,
      detail:
        input.hardItems > 0
          ? `Começa pelos ${input.hardItems === 1 ? 'termo em que' : `${input.hardItems} termos em que`} você mais erra.`
          : input.daysSincePractice === null
            ? 'Seu primeiro treino com as palavras e chunks que você guardou.'
            : `Faz ${plural(input.daysSincePractice, 'dia', 'dias')} desde o último treino.`,
      minutes: size,
      to: '/practice',
    });
  }

  // O fechamento é no dia 5, depois da última sessão do ciclo.
  if (input.cycleDay === LAST_SESSION_DAY && input.session === 'completed' && !input.weeklyDone && input.weekIdeas > 0) {
    plan.push({
      id: 'weekly',
      title: 'Feche o ciclo',
      detail: `Relembre ${plural(input.weekIdeas, 'ideia', 'ideias')}, escolha as melhores, ouça suas falas e fale 2 a 3 minutos.`,
      minutes: 20,
      to: '/weekly',
    });
  }

  return plan;
}
