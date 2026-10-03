import { useSyncExternalStore } from 'react';
import { showToast } from './toast';

export const RATES = [1, 0.75, 0.5] as const;
export type Rate = (typeof RATES)[number];

export interface SpeechState {
  /** Velocidade da leitura em voz alta e das gravações. */
  rate: Rate;
  /** Repete o áudio até o usuário parar. */
  loop: boolean;
  /** Texto que está sendo lido agora, ou null. */
  playing: string | null;
}

const PREFS_KEY = 'ds-speech';
const LOOP_PAUSE_MS = 600;

function loadPrefs(): Pick<SpeechState, 'rate' | 'loop'> {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<SpeechState>;
    return { rate: RATES.find((r) => r === raw.rate) ?? 1, loop: raw.loop === true };
  } catch {
    return { rate: 1, loop: false };
  }
}

let state: SpeechState = { ...loadPrefs(), playing: null };
const listeners = new Set<() => void>();
/** Muda a cada play/stop: descarta eventos de leituras já canceladas. */
let generation = 0;
let loopTimer: ReturnType<typeof setTimeout> | undefined;

function update(patch: Partial<SpeechState>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ rate: state.rate, loop: state.loop }));
  } catch {
    // Sem localStorage a preferência vale só até recarregar a página.
  }
  for (const l of listeners) l();
}

function utter(text: string, mine: number): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = state.rate;
  utterance.addEventListener('end', () => {
    if (mine !== generation) return;
    if (state.loop) loopTimer = setTimeout(() => mine === generation && utter(text, mine), LOOP_PAUSE_MS);
    else update({ playing: null });
  });
  utterance.addEventListener('error', () => {
    if (mine === generation) update({ playing: null });
  });
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  generation += 1;
  clearTimeout(loopTimer);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (state.playing !== null) update({ playing: null });
}

/** Lê o texto em inglês com a voz do navegador, na velocidade e no modo de repetição atuais. */
export function speak(text: string): void {
  if (!('speechSynthesis' in window)) {
    showToast('Este navegador não lê texto em voz alta.', 'error');
    return;
  }
  stopSpeaking();
  if (!text.trim()) return;
  update({ playing: text });
  utter(text, generation);
}

/** Tocar de novo o que já está tocando para. */
export function toggleSpeak(text: string): void {
  if (state.playing === text) stopSpeaking();
  else speak(text);
}

export function setRate(rate: Rate): void {
  const current = state.playing;
  update({ rate });
  // A velocidade só vale para uma leitura nova, então recomeça a atual.
  if (current !== null) speak(current);
}

export function setLoop(loop: boolean): void {
  update({ loop });
}

export function useSpeech(): SpeechState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
