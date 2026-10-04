import { db } from '../data/db';
import { today } from '../domain/dates';
import {
  dayOfPeriod,
  isRestDay,
  legacyStarts,
  normalizeStarts,
  type Period,
  periodAround,
  periodOf,
  periods,
  periodStarting,
  phaseOf,
} from '../domain/periods';
import type { ISODate } from '../domain/types';
import { DomainError } from './errors';
import { getSettings } from './settings';

/**
 * As datas de início dos ciclos de 7 dias. Enquanto o usuário não definiu nenhuma,
 * valem as semanas de calendário (segunda a domingo) em que houve sessão.
 *
 * As leituras daqui usam só promessas do Dexie (`.then`), sem `await`: assim as telas
 * que as chamam dentro de um liveQuery continuam reagindo às mudanças do banco.
 */
export function getCycleStarts(): Promise<ISODate[]> {
  return db.settings.get('settings').then((settings) => {
    if (settings?.cycleStarts) return normalizeStarts(settings.cycleStarts);
    return db.sessions.toArray().then((sessions) => legacyStarts(sessions.map((s) => s.date)));
  });
}

export function listCycles(): Promise<Period[]> {
  return getCycleStarts().then(periods);
}

/** O ciclo que começa em `start`, com o seu último dia. */
export function getCycle(start: ISODate): Promise<Period> {
  return getCycleStarts().then((starts) => periodStarting(starts, start));
}

export interface CycleInfo {
  /** O ciclo em andamento em `date`; null nos dias entre um ciclo e outro. */
  period: Period | null;
  /** O ciclo em andamento ou, na falta dele, o último encerrado: é o que o histórico mostra. */
  reference: Period | null;
  /** Dia do ciclo, de 1 a 7. */
  day: number | null;
  /** Dia 6 ou 7: só revisões. */
  rest: boolean;
  /** Fase de 1 a 4 e rodada. */
  week: number;
  cycle: number;
}

export function getCycleInfo(date: ISODate = today()): Promise<CycleInfo> {
  return getCycleStarts().then((starts) =>
    db.settings.get('settings').then((settings) => {
      const period = periodOf(starts, date);
      const reference = period ?? periodAround(starts, date);
      // Num dia sem ciclo, a fase mostrada é a do ciclo que começaria agora.
      const next: Period = period ?? { start: date, end: date, index: periods(starts).filter((p) => p.start < date).length };
      const phase = phaseOf(period ? starts : [...starts, date], next, settings?.cycleStartDate ?? null);
      return {
        period,
        reference,
        day: period ? dayOfPeriod(period, date) : null,
        rest: period !== null && isRestDay(period, date),
        week: phase.week,
        cycle: phase.cycle,
      };
    }),
  );
}

/** Grava a lista de inícios. Na primeira gravação, os ciclos antigos (por semana de calendário) são preservados. */
async function saveStarts(change: (starts: ISODate[]) => ISODate[]): Promise<ISODate[]> {
  const next = normalizeStarts(change(await getCycleStarts()));
  await db.settings.put({ ...(await getSettings()), cycleStarts: next });
  return next;
}

/** Começa um ciclo de 7 dias em `date`. Um ciclo ainda em andamento passa a terminar na véspera. */
export function startCycle(date: ISODate): Promise<ISODate[]> {
  return db.transaction('rw', db.settings, db.sessions, async () => {
    const starts = await getCycleStarts();
    if (starts.includes(date)) throw new DomainError('Já existe um ciclo começando nesta data.');
    return saveStarts((current) => [...current, date]);
  });
}

/**
 * Garante que `date` esteja dentro de um ciclo: se não estiver, um novo começa nela.
 * Deve ser chamada dentro de uma transação que inclua `settings` e `sessions`.
 */
export async function ensureCycle(date: ISODate): Promise<ISODate[]> {
  const starts = await getCycleStarts();
  return periodOf(starts, date) ? starts : saveStarts((current) => [...current, date]);
}

/** Remove um ciclo da lista. Os estudos daqueles dias não são apagados; só saem do histórico por ciclo. */
export function removeCycle(start: ISODate): Promise<ISODate[]> {
  return db.transaction('rw', db.settings, db.sessions, () => saveStarts((current) => current.filter((s) => s !== start)));
}

/** Volta para a fase 1 a partir do ciclo de `date`. O histórico não é tocado. */
export function restartPhases(date: ISODate = today()): Promise<void> {
  return db.transaction('rw', db.settings, db.sessions, async () => {
    const period = periodOf(await getCycleStarts(), date);
    await db.settings.put({ ...(await getSettings()), cycleStartDate: period?.start ?? date });
  });
}
