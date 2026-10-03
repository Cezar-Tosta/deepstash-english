import { addDays } from '../dates';
import type { ISODate, Rating } from '../types';
import type { PlannedReview, ReviewScheduler, ScheduleState } from './scheduler';

/** Dias depois de D0 em que cada revisão acontece: D1, D3, D7, D14, D30. */
export const DEFAULT_OFFSETS: readonly number[] = [1, 3, 7, 14, 30];

/**
 * Calendário fixo D1/D3/D7/D14/D30.
 *
 * - GOOD: avança um estágio. O intervalo conta a partir do dia da revisão, então
 *   uma revisão atrasada empurra as seguintes em vez de empilhá-las.
 * - AGAIN: volta um estágio e revisa de novo amanhã.
 * - HARD: repete o mesmo estágio com metade do intervalo.
 * - EASY: pula um estágio.
 */
export function createFixedIntervalScheduler(
  offsets: readonly number[] = DEFAULT_OFFSETS,
): ReviewScheduler {
  const count = offsets.length;
  const offsetAt = (stage: number): number =>
    stage < 0 ? 0 : (offsets[Math.min(stage, count - 1)] ?? 0);
  const gapInto = (stage: number): number => offsetAt(stage) - offsetAt(stage - 1);

  const learned: ScheduleState = { stage: count, nextReviewDate: null, status: 'learned' };

  function advance(from: number, to: number, reviewedOn: ISODate): ScheduleState {
    if (to >= count) return learned;
    return {
      stage: to,
      nextReviewDate: addDays(reviewedOn, offsetAt(to) - offsetAt(from)),
      status: 'learning',
    };
  }

  return {
    id: 'fixed-interval',

    initial(createdDate: ISODate): ScheduleState {
      return { stage: 0, nextReviewDate: addDays(createdDate, offsetAt(0)), status: 'new' };
    },

    next(state: ScheduleState, rating: Rating, reviewedOn: ISODate): ScheduleState {
      const stage = Math.min(Math.max(state.stage, 0), count - 1);
      switch (rating) {
        case 'AGAIN':
          return {
            stage: Math.max(0, stage - 1),
            nextReviewDate: addDays(reviewedOn, 1),
            status: 'learning',
          };
        case 'HARD':
          return {
            stage,
            nextReviewDate: addDays(reviewedOn, Math.max(1, Math.floor(gapInto(stage) / 2))),
            status: 'learning',
          };
        case 'GOOD':
          return advance(stage, stage + 1, reviewedOn);
        case 'EASY':
          return advance(stage, stage + 2, reviewedOn);
      }
    },

    plan(createdDate: ISODate): PlannedReview[] {
      return offsets.map((offset, stage) => ({
        stage,
        label: `D${offset}`,
        date: addDays(createdDate, offset),
      }));
    },

    stageLabel(stage: number): string {
      return stage >= count ? 'Concluído' : `D${offsetAt(stage)}`;
    },
  };
}
