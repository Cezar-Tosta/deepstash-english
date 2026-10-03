import { createFixedIntervalScheduler } from './fixedInterval';
import type { ReviewScheduler } from './scheduler';

export type { PlannedReview, ReviewScheduler, ScheduleState } from './scheduler';

/** Algoritmo em uso. Para adotar SM-2 ou FSRS, troque apenas esta linha. */
export const scheduler: ReviewScheduler = createFixedIntervalScheduler();
