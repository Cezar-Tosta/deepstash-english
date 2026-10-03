import { splitSentences } from './reader';
import type { Chunk, ComprehensionVocab, SourceCard } from './types';

export type ExerciseKind = 'dictionary' | 'gap' | 'write' | 'dictation';

export interface Exercise {
  id: string;
  kind: ExerciseKind;
  /** O que o usuário vê antes de responder. */
  prompt: string;
  /** Dica em português (significado), quando existe. */
  hint: string;
  /** Resposta esperada. Vazia em 'write', que não tem resposta única. */
  answer: string;
  /** Frase completa, revelada depois da tentativa (e lida em voz alta no ditado). */
  full: string;
}

const GAP = '_____';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normaliza para comparar respostas: caixa, pontuação e espaços não contam como erro. */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCorrect(answer: string, expected: string): boolean {
  return normalizeAnswer(answer) !== '' && normalizeAnswer(answer) === normalizeAnswer(expected);
}

/** Troca o termo por uma lacuna dentro da frase; null se o termo não aparece nela. */
export function blankOut(sentence: string, term: string): string | null {
  // Reticências no fim ("before you...") marcam um chunk aberto, não fazem parte do texto.
  const core = term.replace(/[.…]+$/, '').trim();
  if (!core) return null;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(core)}(?![\\p{L}\\p{N}])`, 'iu');
  return pattern.test(sentence) ? sentence.replace(pattern, GAP) : null;
}

/** Fração (0 a 1) das palavras da frase original que o usuário acertou, na ordem. */
export function dictationScore(answer: string, expected: string): number {
  const want = normalizeAnswer(expected).split(' ').filter(Boolean);
  const got = normalizeAnswer(answer).split(' ').filter(Boolean);
  if (want.length === 0) return 0;
  // Maior subsequência comum: tolera uma palavra faltando sem zerar o resto.
  const row = Array.from({ length: got.length + 1 }, () => 0);
  for (const w of want) {
    let diagonal = 0;
    for (let j = 1; j <= got.length; j += 1) {
      const above = row[j] ?? 0;
      row[j] = w === got[j - 1] ? diagonal + 1 : Math.max(above, row[j - 1] ?? 0);
      diagonal = above;
    }
  }
  return (row[got.length] ?? 0) / want.length;
}

export interface PracticeMaterial {
  vocab: readonly ComprehensionVocab[];
  chunks: readonly Chunk[];
  cards: readonly SourceCard[];
}

const MIN_DICTATION_WORDS = 4;
const MAX_DICTATION_WORDS = 18;

/** Monta todos os exercícios possíveis de um tipo a partir do que o usuário já estudou. */
export function buildExercises(kind: ExerciseKind, m: PracticeMaterial): Exercise[] {
  switch (kind) {
    case 'dictionary':
      return m.vocab
        .filter((v) => v.meaning.trim())
        .map((v) => ({
          id: `dictionary-${v.id}`,
          kind,
          prompt: (v.context && blankOut(v.context, v.term)) ?? '',
          hint: v.meaning,
          answer: v.term,
          full: v.context ?? v.term,
        }));

    case 'gap': {
      const fromChunks = m.chunks.flatMap((c) =>
        [c.userSentence, c.originalSentence].flatMap((sentence, i): Exercise[] => {
          const prompt = sentence ? blankOut(sentence, c.text) : null;
          if (!prompt) return [];
          const answer = c.text.replace(/[.…]+$/, '').trim();
          return [{ id: `gap-${c.id}-${i}`, kind, prompt, hint: c.meaning, answer, full: sentence }];
        }),
      );
      const fromVocab = m.vocab.flatMap((v): Exercise[] => {
        const prompt = v.context ? blankOut(v.context, v.term) : null;
        if (!prompt || !v.context) return [];
        return [{ id: `gap-${v.id}`, kind, prompt, hint: v.meaning, answer: v.term, full: v.context }];
      });
      return [...fromChunks, ...fromVocab];
    }

    case 'write':
      return [
        ...m.chunks.map((c) => ({
          id: `write-${c.id}`,
          kind,
          prompt: c.text,
          hint: c.meaning,
          answer: '',
          full: c.userSentence || c.originalSentence,
        })),
        ...m.vocab.map((v) => ({
          id: `write-${v.id}`,
          kind,
          prompt: v.term,
          hint: v.meaning,
          answer: '',
          full: v.context ?? '',
        })),
      ];

    case 'dictation': {
      const sentences = new Set<string>();
      for (const card of m.cards) {
        for (const s of splitSentences(card.content)) {
          const words = s.split(/\s+/).length;
          if (words >= MIN_DICTATION_WORDS && words <= MAX_DICTATION_WORDS) sentences.add(s);
        }
      }
      for (const c of m.chunks) if (c.originalSentence.trim()) sentences.add(c.originalSentence.trim());
      return [...sentences].map((s, i) => ({
        id: `dictation-${i}`,
        kind,
        prompt: '',
        hint: '',
        answer: s,
        full: s,
      }));
    }
  }
}

/** Embaralha sem alterar a lista original (Fisher–Yates). `random` é injetável para testes. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
