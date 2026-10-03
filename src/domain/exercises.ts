import type { Chunk, ChunkReview, ComprehensionVocab, PracticeStat } from './types';

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

/** O termo sem as reticências que marcam um chunk aberto ("before you..."). */
export function coreTerm(term: string): string {
  return term.replace(/[.…]+$/, '').trim();
}

/** Troca o termo por uma lacuna dentro da frase; null se o termo não aparece nela. */
export function blankOut(sentence: string, term: string): string | null {
  const core = coreTerm(term);
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

// ---------- O que pode ser treinado ----------

export interface PracticeMaterial {
  vocab: readonly ComprehensionVocab[];
  chunks: readonly Chunk[];
  stats: readonly PracticeStat[];
  reviews: readonly ChunkReview[];
}

export type ItemSource = 'dictionary' | 'chunks';

/** Uma palavra do dicionário ou um chunk, com o que se sabe dele e o quanto custa lembrar. */
export interface StudyItem {
  /** `vocab:<id>` ou `chunk:<id>`: a mesma chave usada em PracticeStat. */
  key: string;
  term: string;
  meaning: string;
  phonetic: string;
  /** Frases em que o termo aparece (do card ou escritas pelo usuário). */
  sentences: string[];
  source: ItemSource;
  right: number;
  wrong: number;
  /** Quanto maior, mais o termo precisa de treino. */
  difficulty: number;
}

/**
 * Dificuldade de um termo. Erros pesam o dobro dos acertos, e um termo nunca
 * treinado entra na frente dos já dominados. Para chunks, as revisões espaçadas
 * também contam: "não lembrei" pesa como dois erros e "difícil" como um.
 */
export function difficultyOf(stat: PracticeStat | undefined, reviews: readonly ChunkReview[]): number {
  const right = stat?.right ?? 0;
  const wrong = stat?.wrong ?? 0;
  const fromReviews = reviews.reduce(
    (sum, r) => sum + (r.rating === 'AGAIN' ? 2 : r.rating === 'HARD' ? 1 : 0),
    0,
  );
  const untouched = right + wrong === 0 ? 1 : 0;
  return wrong * 2 - right + fromReviews + untouched;
}

/** Todos os termos treináveis: precisam de significado ou de ao menos uma frase. */
export function studyItems(m: PracticeMaterial): StudyItem[] {
  const stats = new Map(m.stats.map((s) => [s.id, s]));
  const build = (
    key: string,
    term: string,
    meaning: string,
    phonetic: string,
    sentences: (string | undefined)[],
    source: ItemSource,
    reviews: readonly ChunkReview[],
  ): StudyItem => {
    const stat = stats.get(key);
    return {
      key,
      term,
      meaning: meaning.trim(),
      phonetic,
      sentences: sentences.flatMap((s) => (s?.trim() ? [s.trim()] : [])),
      source,
      right: stat?.right ?? 0,
      wrong: stat?.wrong ?? 0,
      difficulty: difficultyOf(stat, reviews),
    };
  };

  return [
    ...m.vocab.map((v) => build(`vocab:${v.id}`, v.term, v.meaning, v.phonetic ?? '', [v.context], 'dictionary', [])),
    ...m.chunks.map((c) =>
      build(
        `chunk:${c.id}`,
        c.text,
        c.meaning,
        '',
        [c.userSentence, c.originalSentence],
        'chunks',
        m.reviews.filter((r) => r.chunkId === c.id),
      ),
    ),
  ].filter((item) => item.meaning || item.sentences.length > 0);
}

/** Os termos que mais precisam de treino, do mais difícil para o mais fácil. */
export function hardest(items: readonly StudyItem[], count: number): StudyItem[] {
  return [...items]
    .filter((i) => i.difficulty > 0 && i.right + i.wrong > 0)
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, count);
}

// ---------- Treino: três formas de pergunta, todas de produção ----------

/**
 * - `recall`: vê o significado e escreve o termo em inglês.
 * - `gap`: vê a frase com uma lacuna, sem tradução, e completa.
 * - `dictation`: ouve a frase e a escreve.
 */
export type QuestionKind = 'recall' | 'gap' | 'dictation';

export interface Question {
  id: string;
  itemKey: string;
  kind: QuestionKind;
  /** Frase com lacuna (gap) ou vazia. */
  prompt: string;
  /** Significado em português (recall) ou vazio. */
  hint: string;
  /** O que o usuário deve escrever. */
  answer: string;
  /** Frase completa, revelada depois da tentativa. */
  full: string;
  phonetic: string;
}

const MIN_DICTATION_WORDS = 3;
const MAX_DICTATION_WORDS = 18;

/** As formas de pergunta que este termo admite, conforme o que foi registrado sobre ele. */
export function questionsFor(item: StudyItem): Question[] {
  const answer = coreTerm(item.term);
  const base = { itemKey: item.key, phonetic: item.phonetic };
  const out: Question[] = [];

  if (item.meaning) {
    out.push({
      ...base,
      id: `${item.key}:recall`,
      kind: 'recall',
      prompt: '',
      hint: item.meaning,
      answer,
      full: item.sentences[0] ?? '',
    });
  }
  const withTerm = item.sentences.find((s) => blankOut(s, item.term));
  if (withTerm) {
    out.push({
      ...base,
      id: `${item.key}:gap`,
      kind: 'gap',
      prompt: blankOut(withTerm, item.term) ?? '',
      hint: '',
      answer,
      full: withTerm,
    });
  }
  const speakable = item.sentences.find((s) => {
    const words = s.split(/\s+/).length;
    return words >= MIN_DICTATION_WORDS && words <= MAX_DICTATION_WORDS;
  });
  if (speakable) {
    out.push({
      ...base,
      id: `${item.key}:dictation`,
      kind: 'dictation',
      prompt: '',
      hint: '',
      answer: speakable,
      full: speakable,
    });
  }
  return out;
}

/**
 * Monta um treino com os `count` termos mais difíceis (empates sorteados) e uma
 * pergunta para cada um. A forma da pergunta gira conforme o quanto o termo já foi
 * treinado, para que o mesmo termo não volte sempre do mesmo jeito.
 */
export function buildTraining(
  items: readonly StudyItem[],
  count: number,
  random: () => number = Math.random,
): Question[] {
  const ranked = shuffle(items, random)
    .map((item) => ({ item, questions: questionsFor(item) }))
    .filter((entry) => entry.questions.length > 0)
    .sort((a, b) => b.item.difficulty - a.item.difficulty)
    .slice(0, Math.max(1, Math.trunc(count) || 1));

  return shuffle(
    ranked.flatMap(({ item, questions }) => {
      const question = questions[(item.right + item.wrong) % questions.length];
      return question ? [question] : [];
    }),
    random,
  );
}

/** Quantas posições adiante uma pergunta errada volta na mesma rodada. */
export const REQUEUE_GAP = 3;

/** Reinsere a pergunta errada um pouco adiante, para nova tentativa ainda nesta rodada. */
export function requeue(queue: readonly Question[], index: number): Question[] {
  const question = queue[index];
  if (!question) return [...queue];
  const at = Math.min(queue.length, index + 1 + REQUEUE_GAP);
  return [...queue.slice(0, at), question, ...queue.slice(at)];
}

// ---------- Flashcards ----------

export type FlashSource = ItemSource | 'both';

export interface Flashcard {
  id: string;
  itemKey: string;
  /** Frente: a palavra ou expressão em inglês. */
  front: string;
  /** Verso: o significado em português. */
  back: string;
  /** Frase em que o termo apareceu ou que o usuário criou com ele. */
  context: string;
  phonetic: string;
  source: ItemSource;
}

export function buildFlashcards(items: readonly StudyItem[], source: FlashSource): Flashcard[] {
  return items
    .filter((item) => source === 'both' || item.source === source)
    .map((item) => ({
      id: `flash-${item.key}`,
      itemKey: item.key,
      front: item.term,
      back: item.meaning,
      context: item.sentences[0] ?? '',
      phonetic: item.phonetic,
      source: item.source,
    }));
}

/**
 * Sorteia `count` flashcards, limitado ao que existe e a pelo menos um. Com
 * `hardestFirst`, entram primeiro os termos mais difíceis.
 */
export function pickFlashcards(
  cards: readonly Flashcard[],
  count: number,
  options: { difficulty?: ReadonlyMap<string, number>; random?: () => number } = {},
): Flashcard[] {
  const wanted = Math.min(cards.length, Math.max(1, Math.trunc(count) || 1));
  const shuffled = shuffle(cards, options.random);
  const { difficulty } = options;
  if (!difficulty) return shuffled.slice(0, wanted);
  const chosen = shuffled
    .sort((a, b) => (difficulty.get(b.itemKey) ?? 0) - (difficulty.get(a.itemKey) ?? 0))
    .slice(0, wanted);
  return shuffle(chosen, options.random);
}
