import { useSyncExternalStore } from 'react';
import { showToast } from './toast';
import { splitSentences } from '../domain/reader';

export const RATES = [1, 0.75, 0.5] as const;
export type Rate = (typeof RATES)[number];

export interface SpeechState {
  /** Velocidade da leitura em voz alta e das gravações. */
  rate: Rate;
  /** Repete o áudio até o usuário parar. */
  loop: boolean;
  /** voiceURI da voz escolhida; vazio = a voz em inglês padrão do navegador. Vale só neste aparelho. */
  voice: string;
  /** Texto que está sendo lido agora, ou null. */
  playing: string | null;
}

const PREFS_KEY = 'ds-speech';
const LOOP_PAUSE_MS = 600;

function loadPrefs(): Pick<SpeechState, 'rate' | 'loop' | 'voice'> {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<SpeechState>;
    return { rate: RATES.find((r) => r === raw.rate) ?? 1, loop: raw.loop === true, voice: typeof raw.voice === 'string' ? raw.voice : '' };
  } catch {
    return { rate: 1, loop: false, voice: '' };
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
    localStorage.setItem(PREFS_KEY, JSON.stringify({ rate: state.rate, loop: state.loop, voice: state.voice }));
  } catch {
    // Sem localStorage a preferência vale só até recarregar a página.
  }
  for (const l of listeners) l();
}

/**
 * Lê frase por frase, em fila: vários navegadores cortam uma fala longa no meio, e o
 * texto inteiro de um LISTEN pode ter muitos parágrafos. O fim da última frase encerra
 * a leitura (ou recomeça, em loop).
 */
function utter(text: string, mine: number): void {
  const parts = splitSentences(text);
  const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === state.voice);
  parts.forEach((part, i) => {
    const utterance = new SpeechSynthesisUtterance(part);
    utterance.lang = voice?.lang ?? 'en-US';
    if (voice) utterance.voice = voice;
    utterance.rate = state.rate;
    if (i === parts.length - 1) {
      utterance.addEventListener('end', () => {
        if (mine !== generation) return;
        if (state.loop) loopTimer = setTimeout(() => mine === generation && utter(text, mine), LOOP_PAUSE_MS);
        else update({ playing: null });
      });
    }
    utterance.addEventListener('error', () => {
      if (mine === generation) update({ playing: null });
    });
    window.speechSynthesis.speak(utterance);
  });
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

export function setVoice(voice: string): void {
  update({ voice });
}

let voices: SpeechSynthesisVoice[] = [];
const voiceListeners = new Set<() => void>();

function loadVoices(): void {
  const next = window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  // Só troca a lista (e redesenha) quando ela mudou de verdade.
  if (next.map((v) => v.voiceURI).join('|') === voices.map((v) => v.voiceURI).join('|')) return;
  voices = next;
  for (const l of voiceListeners) l();
}

function subscribeVoices(listener: () => void): () => void {
  if (!('speechSynthesis' in window)) return () => undefined;
  if (voiceListeners.size === 0) window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  voiceListeners.add(listener);
  loadVoices();
  return () => {
    voiceListeners.delete(listener);
    if (voiceListeners.size === 0) window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  };
}

/** As vozes em inglês deste navegador. A lista chega aos poucos, então fica escutando a mudança. */
export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(subscribeVoices, () => voices);
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
