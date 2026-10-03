import type { StepId } from './types';

/** "5" é meta, não restrição: a sessão vale com qualquer quantidade de cards. */
export const CARD_GOAL = 5;
/** Limite rígido do método: no máximo 3 chunks novos por dia. */
export const MAX_CHUNKS_PER_DAY = 3;

export interface StepDef {
  id: StepId;
  label: string;
  hint: string;
}

export const STEPS: readonly StepDef[] = [
  { id: 'review', label: 'REVIEW', hint: 'Recupere antes de olhar.' },
  { id: 'read', label: 'READ', hint: 'Leia os cards sem traduzir primeiro.' },
  { id: 'focus', label: 'CARD OF THE DAY', hint: 'Escolha um para aprofundar.' },
  { id: 'check', label: 'CHECK', hint: 'Confirme a compreensão.' },
  { id: 'mine', label: 'MINE', hint: 'Até 3 chunks úteis.' },
  { id: 'retell', label: 'RETELL', hint: 'Explique sem olhar.' },
  { id: 'personalize', label: 'PERSONALIZE', hint: 'Use o inglês.' },
  { id: 'reflect', label: 'REFLECT', hint: 'Do I agree?' },
  { id: 'sowhat', label: 'SO WHAT?', hint: 'Transforme em ação.' },
  { id: 'schedule', label: 'SCHEDULE REVIEW', hint: 'Agende e encerre.' },
];

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
  cards: number;
  hasCardOfDay: boolean;
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
    Math.min(p.cards, CARD_GOAL) / CARD_GOAL,
    p.hasCardOfDay ? 1 : 0,
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
