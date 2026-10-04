/** Quantas fases há: uma por ciclo de 7 dias, depois recomeça. */
export const WEEKS_PER_CYCLE = 4;

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
