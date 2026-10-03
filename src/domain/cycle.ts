import { diffDays } from './dates';
import type { ISODate } from './types';

export const WEEKS_PER_CYCLE = 4;

export interface CyclePosition {
  cycle: number;
  week: number;
}

/** Posição de `date` nos ciclos de 4 semanas que começam em `cycleStart` (uma segunda-feira). */
export function cyclePosition(cycleStart: ISODate, date: ISODate): CyclePosition {
  const weeks = Math.max(0, Math.floor(diffDays(cycleStart, date) / 7));
  return {
    cycle: Math.floor(weeks / WEEKS_PER_CYCLE) + 1,
    week: (weeks % WEEKS_PER_CYCLE) + 1,
  };
}

export interface WeekPlan {
  week: number;
  focus: string;
  translation: string;
  speakingLabel: string;
  /** Faixa-alvo do retelling, em segundos. */
  speakingMinSec: number;
  speakingMaxSec: number;
}

const PLANS: readonly WeekPlan[] = [
  {
    week: 1,
    focus: 'Compreensão.',
    translation: 'Tradução permitida depois da tentativa.',
    speakingLabel: '≈ 1 minuto',
    speakingMinSec: 60,
    speakingMaxSec: 60,
  },
  {
    week: 2,
    focus: 'Compreender antes de traduzir.',
    translation: 'Só consulte a tradução depois de formular a ideia principal.',
    speakingLabel: '1–2 minutos',
    speakingMinSec: 60,
    speakingMaxSec: 120,
  },
  {
    week: 3,
    focus: 'Pensar do conceito direto para o inglês.',
    translation: 'Reduza a tradução.',
    speakingLabel: '≈ 2 minutos',
    speakingMinSec: 120,
    speakingMaxSec: 120,
  },
  {
    week: 4,
    focus: 'Explicar e ensinar a ideia.',
    translation: 'Tradução apenas quando necessária.',
    speakingLabel: '2–3 minutos',
    speakingMinSec: 120,
    speakingMaxSec: 180,
  },
];

export function weekPlan(week: number): WeekPlan {
  const index = Math.min(Math.max(Math.trunc(week), 1), WEEKS_PER_CYCLE) - 1;
  return PLANS[index] ?? (PLANS[0] as WeekPlan);
}
