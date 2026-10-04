import { addDays, diffDays, isISODate, startOfWeek } from './dates';
import type { ISODate } from './types';

/** Um ciclo de estudo dura 7 dias: 5 de sessão e 2 só de revisão. */
export const CYCLE_DAYS = 7;
export const CYCLE_SESSION_DAYS = 5;
/** A cada 4 ciclos a meta de fala sobe uma fase. */
export const PHASES = 4;

/** Um ciclo de 7 dias, que começa na data escolhida pelo usuário. */
export interface Period {
  start: ISODate;
  /** Último dia, inclusive. Normalmente start + 6; menos, se o ciclo seguinte começou antes. */
  end: ISODate;
  /** Posição entre todos os ciclos, a partir de 0. */
  index: number;
}

/** Datas de início válidas, sem repetição, da mais antiga para a mais recente. */
export function normalizeStarts(starts: readonly unknown[]): ISODate[] {
  return [...new Set(starts.filter(isISODate))].sort();
}

/** Os ciclos definidos por `starts`. Um ciclo interrompido por outro termina na véspera do seguinte. */
export function periods(starts: readonly ISODate[]): Period[] {
  const sorted = normalizeStarts(starts);
  return sorted.map((start, index) => {
    const full = addDays(start, CYCLE_DAYS - 1);
    const next = sorted[index + 1];
    return { start, end: next !== undefined && next <= full ? addDays(next, -1) : full, index };
  });
}

/** O ciclo que contém `date`; null nos dias entre um ciclo e outro. */
export function periodOf(starts: readonly ISODate[], date: ISODate): Period | null {
  return periods(starts).find((p) => p.start <= date && date <= p.end) ?? null;
}

/** O ciclo que contém `date` ou, num dia sem ciclo, o último que terminou antes dela. */
export function periodAround(starts: readonly ISODate[], date: ISODate): Period | null {
  return periods(starts).findLast((p) => p.start <= date) ?? null;
}

/** O ciclo que começa em `start`. Se a data não é um início registrado, vale um ciclo cheio a partir dela. */
export function periodStarting(starts: readonly ISODate[], start: ISODate): Period {
  return periods(starts).find((p) => p.start === start) ?? { start, end: addDays(start, CYCLE_DAYS - 1), index: -1 };
}

export function periodDates(period: Period): ISODate[] {
  return Array.from({ length: diffDays(period.start, period.end) + 1 }, (_, i) => addDays(period.start, i));
}

/** Dia do ciclo, de 1 a 7. */
export function dayOfPeriod(period: Period, date: ISODate): number {
  return diffDays(period.start, date) + 1;
}

/** Dias 6 e 7 do ciclo: sem sessão nova, só revisões. */
export function isRestDay(period: Period, date: ISODate): boolean {
  return dayOfPeriod(period, date) > CYCLE_SESSION_DAYS;
}

/**
 * Antes de existirem ciclos com data escolhida, cada semana de calendário com estudo
 * era um ciclo começando na segunda-feira. Reconstrói esses inícios a partir das datas.
 */
export function legacyStarts(studyDates: Iterable<ISODate>): ISODate[] {
  return normalizeStarts([...studyDates].map(startOfWeek));
}

export interface Phase {
  /** Rodada de 4 fases, a partir de 1. */
  cycle: number;
  /** Fase de 1 a 4: define a meta de fala e o uso de tradução. */
  week: number;
}

/**
 * A fase de um ciclo: sobe uma a cada ciclo e volta à 1 depois da 4. A contagem
 * começa no primeiro ciclo ou, se o usuário reiniciou as fases, no ciclo de `anchor`.
 */
export function phaseOf(starts: readonly ISODate[], period: Period, anchor: ISODate | null): Phase {
  const all = periods(starts);
  const from = anchor === null ? 0 : all.findIndex((p) => p.end >= anchor);
  const steps = Math.max(0, period.index - Math.max(0, from));
  return { cycle: Math.floor(steps / PHASES) + 1, week: (steps % PHASES) + 1 };
}
