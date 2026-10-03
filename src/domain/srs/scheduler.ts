import type { ChunkStatus, ISODate, Rating } from '../types';

export interface ScheduleState {
  stage: number;
  nextReviewDate: ISODate | null;
  status: ChunkStatus;
}

export interface PlannedReview {
  stage: number;
  label: string;
  date: ISODate;
}

/**
 * Contrato do algoritmo de repetição espaçada. O resto do sistema só conhece esta
 * interface, então trocar o calendário fixo por SM-2 ou FSRS é escrever outra
 * implementação e apontar `scheduler` (em `./index.ts`) para ela.
 */
export interface ReviewScheduler {
  readonly id: string;
  /** Estado de um chunk recém-criado em `createdDate` (D0). */
  initial(createdDate: ISODate): ScheduleState;
  /** Estado depois de uma revisão avaliada em `reviewedOn`. */
  next(state: ScheduleState, rating: Rating, reviewedOn: ISODate): ScheduleState;
  /** Calendário previsto se todas as revisões forem feitas em dia e avaliadas como GOOD. */
  plan(createdDate: ISODate): PlannedReview[];
  stageLabel(stage: number): string;
}
