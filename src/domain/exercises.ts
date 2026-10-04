import { termWords, tokenize } from './reader';
import type { Chunk, ChunkReview, ComprehensionVocab, PracticeStat, VerbEntry } from './types';

export const GAP = '_____';

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

export interface Located {
  before: string;
  /** O trecho da frase que corresponde ao termo, como está escrito nela. */
  match: string;
  after: string;
}

/** Semelhança mínima (0 a 1) para aceitar um trecho parecido como sendo o termo. */
const MIN_SIMILARITY = 0.7;
/** Uma palavra só é aceita por semelhança se compartilhar ao menos este começo. */
const MIN_STEM = 4;

/** Tamanho da maior subsequência comum entre duas listas de palavras. */
function commonInOrder(a: readonly string[], b: readonly string[]): number {
  const row = Array.from({ length: b.length + 1 }, () => 0);
  for (const x of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j] ?? 0;
      row[j] = x === b[j - 1] ? diagonal + 1 : Math.max(above, row[j - 1] ?? 0);
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

/** Duas palavras são a mesma com flexão diferente ("hold" e "holding", "habit" e "habits")? */
function sameStem(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_STEM && long.startsWith(short) && long.length - short.length <= 3;
}

/**
 * Encontra o termo dentro da frase. Primeiro procura o texto exato; se não achar,
 * aceita o trecho mais parecido, para cobrir o termo cadastrado com uma pequena
 * diferença da frase: uma palavra a mais ou a menos ("one thing at time" em
 * "one thing at a time") ou outra flexão ("hold" em "holding").
 */
export function locateTerm(sentence: string, term: string): Located | null {
  const core = coreTerm(term);
  if (!core) return null;

  const exact = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(core)}(?![\\p{L}\\p{N}])`, 'iu').exec(sentence);
  if (exact) {
    return {
      before: sentence.slice(0, exact.index),
      match: exact[0],
      after: sentence.slice(exact.index + exact[0].length),
    };
  }

  const tokens = tokenize(sentence);
  const wordAt: number[] = [];
  tokens.forEach((t, i) => {
    if (t.isWord) wordAt.push(i);
  });
  const words = wordAt.map((i) => termWords(tokens[i]?.text ?? '')[0] ?? '');
  const wanted = termWords(core);
  if (wanted.length === 0 || words.length === 0) return null;

  let best: { start: number; size: number; score: number } | null = null;
  const consider = (start: number, size: number, score: number) => {
    const closer = best !== null && score === best.score && Math.abs(size - wanted.length) < Math.abs(best.size - wanted.length);
    if (best === null || score > best.score || closer) best = { start, size, score };
  };

  if (wanted.length === 1) {
    const only = wanted[0] ?? '';
    words.forEach((w, i) => {
      if (sameStem(w, only)) consider(i, 1, 1 - Math.abs(w.length - only.length) / 10);
    });
  } else {
    for (let size = Math.max(1, wanted.length - 1); size <= wanted.length + 2; size += 1) {
      for (let start = 0; start + size <= words.length; start += 1) {
        const window = words.slice(start, start + size);
        // O trecho precisa começar e terminar em palavras do termo: sem bordas soltas.
        if (!wanted.includes(window[0] ?? '') || !wanted.includes(window.at(-1) ?? '')) continue;
        const score = (2 * commonInOrder(wanted, window)) / (wanted.length + size);
        if (score >= MIN_SIMILARITY) consider(start, size, score);
      }
    }
  }

  const found = best as { start: number; size: number; score: number } | null;
  if (!found) return null;
  const from = wordAt[found.start] ?? 0;
  const to = wordAt[found.start + found.size - 1] ?? from;
  const join = (list: readonly { text: string }[]): string => list.map((t) => t.text).join('');
  return { before: join(tokens.slice(0, from)), match: join(tokens.slice(from, to + 1)), after: join(tokens.slice(to + 1)) };
}

/** Troca o termo por uma lacuna dentro da frase; null se o termo não aparece nela. */
export function blankOut(sentence: string, term: string): string | null {
  const found = locateTerm(sentence, term);
  return found ? `${found.before}${GAP}${found.after}` : null;
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
  verbs: readonly VerbEntry[];
}

export type ItemSource = 'dictionary' | 'chunks';

/** Uma palavra do dicionário ou um chunk, sempre com ao menos uma frase em que aparece. */
export interface StudyItem {
  /** `vocab:<id>` ou `chunk:<id>`: a mesma chave usada em PracticeStat. */
  key: string;
  term: string;
  meaning: string;
  phonetic: string;
  /** Classe gramatical (verbo, substantivo, phrasal verb…), quando registrada. */
  wordClass: string;
  /** Explicação do uso naquele contexto, quando registrada. */
  explanation: string;
  /** Frases em que o termo aparece (do card ou escritas pelo usuário). Nunca vazio. */
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
export function difficultyOf(stat: PracticeStat | undefined, reviews: readonly ChunkReview[] = []): number {
  const right = stat?.right ?? 0;
  const wrong = stat?.wrong ?? 0;
  const fromReviews = reviews.reduce((sum, r) => sum + (r.rating === 'AGAIN' ? 2 : r.rating === 'HARD' ? 1 : 0), 0);
  const untouched = right + wrong === 0 ? 1 : 0;
  return wrong * 2 - right + fromReviews + untouched;
}

/**
 * Os termos treináveis. Nenhum exercício mostra palavra solta, então só entra o
 * termo que tem pelo menos uma frase registrada (o contexto do card ou uma frase
 * do usuário).
 */
export function studyItems(m: PracticeMaterial): StudyItem[] {
  const stats = new Map(m.stats.map((s) => [s.id, s]));
  const build = (
    key: string,
    term: string,
    fields: { meaning: string; phonetic?: string; wordClass?: string; explanation?: string },
    sentences: (string | undefined)[],
    source: ItemSource,
    reviews: readonly ChunkReview[],
  ): StudyItem => {
    const stat = stats.get(key);
    return {
      key,
      term,
      meaning: fields.meaning.trim(),
      phonetic: fields.phonetic ?? '',
      wordClass: fields.wordClass ?? '',
      explanation: fields.explanation ?? '',
      sentences: sentences.flatMap((s) => (s?.trim() ? [s.trim()] : [])),
      source,
      right: stat?.right ?? 0,
      wrong: stat?.wrong ?? 0,
      difficulty: difficultyOf(stat, reviews),
    };
  };

  return [
    ...m.vocab.map((v) => build(`vocab:${v.id}`, v.term, v, [v.context], 'dictionary', [])),
    ...m.chunks.map((c) =>
      build(
        `chunk:${c.id}`,
        c.text,
        { meaning: c.meaning },
        [c.userSentence, c.originalSentence, ...(c.extraSentences ?? [])],
        'chunks',
        m.reviews.filter((r) => r.chunkId === c.id),
      ),
    ),
  ].filter((item) => item.sentences.length > 0);
}

/** Termos cadastrados sem nenhuma frase: ficam fora dos exercícios até ganharem contexto. */
export function withoutContext(m: PracticeMaterial): number {
  return m.vocab.length + m.chunks.length - studyItems(m).length;
}

/** Os termos que mais precisam de treino, do mais difícil para o mais fácil. */
export function hardest(items: readonly StudyItem[], count: number): StudyItem[] {
  return [...items]
    .filter((i) => i.difficulty > 0 && i.right + i.wrong > 0)
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, count);
}

// ---------- Perguntas: sempre dentro de uma frase ----------

/**
 * - `gap`: lê a frase com uma lacuna e escreve o que falta.
 * - `listen`: ouve a frase inteira e escreve a palavra que falta no texto.
 * - `dictation`: ouve uma frase curta e a escreve inteira.
 * - `tense`: completa a frase com o verbo no tempo pedido.
 */
export type QuestionKind = 'gap' | 'listen' | 'dictation' | 'tense';

export interface Question {
  id: string;
  /** Chave de desempenho: o termo (vocab/chunk) ou a pergunta de verbo. */
  itemKey: string;
  kind: QuestionKind;
  /** Frase com lacuna; vazia no ditado. */
  prompt: string;
  /** Ajuda opcional: o significado em português, ou o tempo verbal e o verbo. */
  hint: string;
  /** O que o usuário deve escrever. */
  answer: string;
  /** Frase completa: é o que se ouve e o que se revela depois da tentativa. */
  full: string;
  phonetic: string;
}

const MIN_DICTATION_WORDS = 3;
const MAX_DICTATION_WORDS = 18;

const isShort = (sentence: string): boolean => {
  const words = sentence.split(/\s+/).length;
  return words >= MIN_DICTATION_WORDS && words <= MAX_DICTATION_WORDS;
};

/** As formas de pergunta que este termo admite. Todas partem de uma frase em que ele aparece. */
export function questionsFor(item: StudyItem): Question[] {
  const base = { itemKey: item.key, phonetic: item.phonetic };
  const out: Question[] = [];

  const withTerm = item.sentences.find((s) => locateTerm(s, item.term));
  const found = withTerm ? locateTerm(withTerm, item.term) : null;
  if (withTerm && found) {
    // A resposta é o trecho como está escrito na frase, mesmo que o termo tenha sido cadastrado com um deslize.
    const answer = found.match;
    const prompt = `${found.before}${GAP}${found.after}`;
    out.push({ ...base, id: `${item.key}:gap`, kind: 'gap', prompt, hint: item.meaning, answer, full: withTerm });
    out.push({ ...base, id: `${item.key}:listen`, kind: 'listen', prompt, hint: '', answer, full: withTerm });
  }
  const speakable = item.sentences.find(isShort);
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
export function buildTraining(items: readonly StudyItem[], count: number, random: () => number = Math.random): Question[] {
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

// ---------- Tempos verbais ----------

/** Chave de comparação de um tempo verbal: "Past Simple " e "past simple" são o mesmo. */
export const tenseKey = (tense: string): string => tense.trim().toLowerCase();

export interface TenseFilter {
  /** Formas base dos verbos que entram. Sem isto, entram todos. */
  bases?: ReadonlySet<string>;
  /** Tempos verbais que entram (chaves de `tenseKey`). Sem isto, entram todos. */
  tenses?: ReadonlySet<string>;
}

/** As formas base dos verbos marcados para estudo, sem repetição, em ordem alfabética. */
export function verbBases(verbs: readonly VerbEntry[]): string[] {
  return [...new Set(verbs.filter((v) => v.selected).map((v) => v.base))].sort((a, b) => a.localeCompare(b));
}

/** Os tempos verbais que têm ao menos uma frase de exercício, do mais frequente para o menos. */
export function tenseNames(verbs: readonly VerbEntry[]): string[] {
  const seen = new Map<string, { name: string; count: number }>();
  for (const q of tenseQuestions(verbs)) {
    const name = q.hint.split(' · ')[0] ?? '';
    const entry = seen.get(tenseKey(name)) ?? { name, count: 0 };
    entry.count += 1;
    seen.set(tenseKey(name), entry);
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((e) => e.name);
}

/**
 * As perguntas de tempo verbal dos verbos marcados: frase com lacuna, tempo pedido
 * e verbo na forma base. O filtro restringe a certos verbos e a certos tempos.
 */
export function tenseQuestions(verbs: readonly VerbEntry[], filter: TenseFilter = {}): Question[] {
  return verbs
    .filter((v) => v.selected && (!filter.bases || filter.bases.has(v.base)))
    .flatMap((verb) =>
      verb.drills.flatMap((drill, i): Question[] => {
        if (!/_{3,}/.test(drill.sentence) || !drill.answer.trim()) return [];
        if (filter.tenses && !filter.tenses.has(tenseKey(drill.tense))) return [];
        const key = `verb:${verb.id}:${i}`;
        return [
          {
            id: key,
            itemKey: key,
            kind: 'tense',
            prompt: drill.sentence.replace(/_{3,}/, GAP),
            hint: `${drill.tense.trim()} · to ${verb.base}`,
            answer: drill.answer.trim(),
            full: drill.sentence.replace(/_{3,}/, drill.answer.trim()),
            phonetic: '',
          },
        ];
      }),
    );
}

/** Uma rodada de tempos verbais, começando pelas perguntas mais erradas (empates sorteados). */
export function buildTenseTraining(
  verbs: readonly VerbEntry[],
  stats: readonly PracticeStat[],
  count: number,
  options: { filter?: TenseFilter; random?: () => number } = {},
): Question[] {
  const byId = new Map(stats.map((s) => [s.id, s]));
  const ranked = shuffle(tenseQuestions(verbs, options.filter), options.random)
    .sort((a, b) => difficultyOf(byId.get(b.itemKey)) - difficultyOf(byId.get(a.itemKey)))
    .slice(0, Math.max(1, Math.trunc(count) || 1));
  return shuffle(ranked, options.random);
}

export interface VerbDifficulty {
  base: string;
  right: number;
  wrong: number;
}

/**
 * Os verbos em que o usuário mais erra nos exercícios de tempo verbal, somando
 * todas as frases do verbo (em todas as ideias). Só entram verbos com mais erros
 * do que a metade dos acertos, do pior para o melhor.
 */
export function hardestVerbs(verbs: readonly VerbEntry[], stats: readonly PracticeStat[], count: number): VerbDifficulty[] {
  const byId = new Map(stats.map((s) => [s.id, s]));
  const totals = new Map<string, VerbDifficulty>();
  for (const verb of verbs.filter((v) => v.selected)) {
    const total = totals.get(verb.base) ?? { base: verb.base, right: 0, wrong: 0 };
    verb.drills.forEach((_, i) => {
      const stat = byId.get(`verb:${verb.id}:${i}`);
      total.right += stat?.right ?? 0;
      total.wrong += stat?.wrong ?? 0;
    });
    totals.set(verb.base, total);
  }
  return [...totals.values()]
    .filter((v) => v.wrong > 0 && v.wrong * 2 > v.right)
    .sort((a, b) => b.wrong * 2 - b.right - (a.wrong * 2 - a.right) || a.base.localeCompare(b.base))
    .slice(0, count);
}

// ---------- Flashcards ----------

export type FlashSource = ItemSource | 'both';

export interface Flashcard {
  id: string;
  itemKey: string;
  /** A palavra ou expressão em inglês. */
  front: string;
  /** A frase em que ela aparece: o flashcard nunca mostra o termo solto. */
  context: string;
  /** Verso: o significado em português. */
  back: string;
  /** Classe gramatical (verbo, substantivo, phrasal verb…), quando registrada. */
  wordClass: string;
  /** Como o termo está sendo usado nessa frase. */
  explanation: string;
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
      // A frase em que o termo aparece tem preferência sobre as demais.
      context: item.sentences.find((s) => blankOut(s, item.term)) ?? item.sentences[0] ?? '',
      back: item.meaning,
      wordClass: item.wordClass,
      explanation: item.explanation,
      phonetic: item.phonetic,
      source: item.source,
    }));
}

/**
 * Sorteia `count` flashcards, limitado ao que existe e a pelo menos um. Com
 * `difficulty`, entram primeiro os termos mais difíceis.
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
  const chosen = shuffled.sort((a, b) => (difficulty.get(b.itemKey) ?? 0) - (difficulty.get(a.itemKey) ?? 0)).slice(0, wanted);
  return shuffle(chosen, options.random);
}

/** A frase em três partes, para destacar o termo dentro dela. */
export function splitAround(sentence: string, term: string): Located | null {
  return locateTerm(sentence, term);
}

// ---------- Ditado ----------

/** Fração mínima de palavras certas para um ditado contar como acerto. */
export const DICTATION_PASS = 0.9;

export type TermsPerAudio = 1 | 2 | 3;

export interface DictationPart {
  itemKey: string;
  term: string;
  meaning: string;
  /** A frase em que o termo aparece: é ela que é dita. */
  sentence: string;
}

/** Um áudio para escrever: as frases de um, dois ou três termos, ditas em sequência. */
export interface Dictation {
  id: string;
  parts: DictationPart[];
  /** Tudo o que é dito, na ordem. */
  full: string;
}

/** A frase curta em que o termo aparece; null se o termo não tem frase que sirva para ditado. */
function dictationSentence(item: StudyItem): string | null {
  return item.sentences.find((s) => isShort(s) && locateTerm(s, item.term) !== null) ?? null;
}

/** Os termos que podem entrar num ditado: têm uma frase curta em que aparecem. */
export function dictationItems(items: readonly StudyItem[], source: FlashSource): StudyItem[] {
  return items.filter((item) => (source === 'both' || item.source === source) && dictationSentence(item) !== null);
}

export interface DictationOptions {
  source: FlashSource;
  /** Quantas palavras ou chunks entram em cada áudio. */
  perAudio: TermsPerAudio;
  /** Quantos ditados montar. */
  count: number;
  random?: () => number;
}

/**
 * Monta os ditados: os termos em que o usuário mais erra vêm primeiro, e cada áudio
 * junta `perAudio` termos, sem repetir a mesma frase dentro dele.
 */
export function buildDictations(items: readonly StudyItem[], options: DictationOptions): Dictation[] {
  const { perAudio, random } = options;
  const pool = shuffle(dictationItems(items, options.source), random).sort((a, b) => b.difficulty - a.difficulty);
  const wanted = Math.max(1, Math.trunc(options.count) || 1);
  const out: Dictation[] = [];
  const rest = [...pool];

  while (out.length < wanted && rest.length > 0) {
    const parts: DictationPart[] = [];
    for (let i = 0; i < rest.length && parts.length < perAudio;) {
      const item = rest[i] as StudyItem;
      const sentence = dictationSentence(item) ?? '';
      // Dois termos da mesma frase não entram no mesmo áudio: ela seria dita duas vezes.
      if (parts.some((p) => p.sentence === sentence)) {
        i += 1;
        continue;
      }
      parts.push({ itemKey: item.key, term: item.term, meaning: item.meaning, sentence });
      rest.splice(i, 1);
    }
    out.push({
      id: `dictation-${parts.map((p) => p.itemKey).join('+')}`,
      parts,
      // Cada frase termina com pontuação, para a voz fazer a pausa entre elas.
      full: parts.map((p) => (/[.!?…]$/u.test(p.sentence.trim()) ? p.sentence.trim() : `${p.sentence.trim()}.`)).join(' '),
    });
  }
  return out;
}

export interface DictationResult {
  /** Fração (0 a 1) das palavras ditas que o usuário escreveu, na ordem. */
  score: number;
  /** As palavras do que foi dito, com a marca de quais o usuário acertou. */
  words: { text: string; hit: boolean }[];
  missed: number;
}

/** Confere o ditado palavra por palavra, ignorando maiúsculas e pontuação. */
export function checkDictation(answer: string, expected: string): DictationResult {
  const shown = expected.split(/\s+/u).filter(Boolean);
  const want = shown.map(normalizeAnswer);
  const got = normalizeAnswer(answer).split(' ').filter(Boolean);
  // Maior subsequência comum, de trás para frente, para depois marcar quais palavras entraram nela.
  const cols = got.length + 1;
  const table = new Uint32Array((want.length + 1) * cols);
  for (let i = want.length - 1; i >= 0; i -= 1) {
    for (let j = got.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        want[i] === got[j]
          ? (table[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0);
    }
  }
  const hits = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < want.length && j < got.length) {
    if (want[i] === got[j]) {
      hits.add(i);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * cols + j] ?? 0) >= (table[i * cols + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  // Um sinal solto ("—") não é palavra: não conta nem como acerto nem como falta.
  const real = want.filter((w) => w !== '').length;
  const words = shown.map((text, index) => ({ text, hit: hits.has(index) || want[index] === '' }));
  return { score: real === 0 ? 0 : hits.size / real, words, missed: words.filter((w) => !w.hit).length };
}
