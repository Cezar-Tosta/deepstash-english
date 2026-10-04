/** Dia local no formato yyyy-mm-dd. Todo o agendamento trabalha em dias, nunca em horas. */
export type ISODate = string;
export type ISODateTime = string;

export type Rating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
export type ChunkStatus = 'new' | 'learning' | 'learned' | 'retired';
export type SessionStatus = 'in_progress' | 'completed';
export type ThemePref = 'system' | 'light' | 'dark';
export type AIProviderKind = 'none' | 'anthropic' | 'groq' | 'openai-compatible';

export type StepId = 'review' | 'read' | 'focus' | 'check' | 'mine' | 'retell' | 'personalize' | 'reflect' | 'sowhat' | 'schedule';

export interface AISettings {
  provider: AIProviderKind;
  baseUrl: string;
  model: string;
  /** Fica só neste aparelho (IndexedDB). Nunca entra no backup nem no código-fonte. */
  apiKey: string;
  /** Modelo que lê imagens, usado para importar screenshots de cards. Vazio = padrão do provedor. */
  visionModel?: string;
}

export interface StudyFocus {
  text: string;
  at: ISODateTime;
  /** Quantas correções havia quando o plano foi gerado, para avisar que há novas. */
  corrections: number;
}

export interface UserSettings {
  id: 'settings';
  theme: ThemePref;
  /** Início do ciclo a partir do qual as 4 fases são contadas. Null = desde o primeiro ciclo. */
  cycleStartDate: ISODate | null;
  /**
   * Datas em que cada ciclo de 7 dias começa. Ausente em dados antigos: aí vale a
   * semana de calendário (segunda a domingo) de cada sessão.
   */
  cycleStarts?: ISODate[];
  /** Plano de estudo dos assuntos mais críticos, escrito pela IA a partir de todos os ciclos. */
  studyFocus?: StudyFocus;
  ai: AISettings;
  lastBackupAt: ISODateTime | null;
}

export interface StudySession {
  id: string;
  date: ISODate;
  cycleNumber: number;
  cycleWeek: number;
  startedAt: ISODateTime;
  completedAt: ISODateTime | null;
  ideaOfDayId: string | null;
  currentStep: StepId;
  status: SessionStatus;
  /** CHECK: o que entendi errado ou não sabia. */
  misunderstood: string;
  /** RETELL: palavras de apoio para a fala. */
  retellNotes: string;
  /** Resumo "o que estudar", escrito pela IA a partir das correções e dos exercícios do dia. */
  studySummary?: string;
  studySummaryAt?: ISODateTime;
}

/**
 * Uma ideia de um livro, como o Deepstash a apresenta. É a unidade de leitura e de
 * aprofundamento: a "Idea of the Day" é uma ideia inteira, não um card isolado.
 */
export interface Idea {
  id: string;
  sessionId: string;
  date: ISODate;
  bookTitle: string;
  title: string;
  mainIdea: string;
  category: string;
  notes: string;
  createdAt: ISODateTime;
}

/** Um card da ideia. Os cards de uma ideia são lidos em sequência, como uma história. */
export interface SourceCard {
  id: string;
  ideaId: string;
  sessionId: string;
  date: ISODate;
  /** Ordem do card dentro da ideia, começando em 0. */
  position: number;
  content: string;
  createdAt: ISODateTime;
  /** Comentário da IA sobre a estrutura do texto (gramática, ortografia, sintaxe e semântica). */
  analysis?: string;
  analysisAt?: ISODateTime;
  /** O texto do card quando o comentário foi gerado, para avisar se ele mudou depois. */
  analysisOf?: string;
}

/** Vocabulário só para entender o card. Nunca entra na repetição espaçada. */
export interface ComprehensionVocab {
  id: string;
  ideaId: string;
  sessionId: string;
  term: string;
  meaning: string;
  /** Frase em que o termo apareceu (preenchida ao adicionar pela leitura). */
  context?: string;
  /** Explicação do sentido naquele contexto. */
  explanation?: string;
  /** Transcrição fonética (IPA). */
  phonetic?: string;
  /** Classe gramatical naquele contexto: verbo, substantivo, phrasal verb… */
  wordClass?: string;
  createdAt: ISODateTime;
}

export interface Chunk {
  id: string;
  sessionId: string;
  sourceIdeaId: string | null;
  text: string;
  meaning: string;
  originalSentence: string;
  userSentence: string;
  /** Frases a mais escritas com o chunk, em treinos posteriores. */
  extraSentences?: string[];
  createdAt: ISODateTime;
  /** D0. */
  createdDate: ISODate;
  status: ChunkStatus;
  /** Índice da próxima revisão no calendário do scheduler. */
  stage: number;
  nextReviewDate: ISODate | null;
}

/** Uma tentativa de revisão. Registro só de inclusão: o histórico nunca é apagado. */
export interface ChunkReview {
  id: string;
  chunkId: string;
  scheduledDate: ISODate;
  completedDate: ISODate;
  stage: number;
  rating: Rating;
  userSentence: string;
  createdAt: ISODateTime;
}

export interface SpeakingSession {
  id: string;
  kind: 'daily' | 'weekly' | 'book';
  /** Livro explicado, quando `kind` é 'book'. */
  bookKey?: string;
  sessionId: string | null;
  ideaId: string | null;
  date: ISODate;
  durationSec: number;
  targetSec: number;
  /** Reservados para gravação/transcrição (v0.6). */
  transcript: string | null;
  audioPath: string | null;
  createdAt: ISODateTime;
}

export interface Reflection {
  id: string;
  ideaId: string;
  sessionId: string;
  /** MY VIEW — Do I agree? Why? */
  userOpinion: string;
  /** SO WHAT? — What will I do differently? */
  soWhat: string;
  /** Rascunho em português da opinião: organiza a ideia antes de escrever em inglês. */
  opinionPt?: string;
  /** Rascunho em português da ação. */
  soWhatPt?: string;
  /** Acompanhamento da ação, dias depois: "Did you do it?" */
  followUpStatus?: FollowUpStatus;
  /** "What happened?" */
  followUp?: string;
  followUpAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface WeeklyReview {
  /** Igual a weekStart: existe no máximo um fechamento por semana. */
  id: ISODate;
  weekStart: ISODate;
  /** ideaId → o que o usuário lembrou antes de revelar. */
  recalls: Record<string, string>;
  topIdeaIds: string[];
  speakingIdeaId: string | null;
  wentWell: string;
  difficulty: string;
  consistency: number | null;
  completedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export interface WritingExercise {
  id: string;
  weekStart: ISODate;
  ideaId: string | null;
  /** Primeira versão. Congelada ao finalizar. */
  text: string;
  finalizedAt: ISODateTime | null;
  revisedText: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Um exercício de tempo verbal: frase com lacuna, o tempo pedido e a resposta. */
export interface VerbDrill {
  /** Nome do tempo em inglês, por exemplo "Past simple". */
  tense: string;
  /** Frase com "_____" no lugar do verbo conjugado. */
  sentence: string;
  answer: string;
  /** Tradução da frase completa para o português, quando a IA a enviou. */
  translation?: string;
}

/** Um verbo encontrado no texto de uma ideia, com suas formas e exercícios. */
export interface VerbEntry {
  id: string;
  ideaId: string;
  base: string;
  translation: string;
  thirdPerson: string;
  past: string;
  participle: string;
  gerund: string;
  /** Como aparece no texto, e em que tempo ou forma. */
  textForm: string;
  textTense: string;
  /** A frase do card em que ele aparece. */
  sentence: string;
  /** Só os verbos selecionados entram nos exercícios. */
  selected: boolean;
  drills: VerbDrill[];
  createdAt: ISODateTime;
}

/** Tradução guardada de uma frase em inglês. A chave é a própria frase. */
export interface SentenceTranslation {
  id: string;
  pt: string;
  createdAt: ISODateTime;
}

/** Uma mensagem da conversa com a IA sobre uma ideia. */
export interface ChatMessage {
  id: string;
  ideaId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: ISODateTime;
}

/** Desempenho acumulado de um termo (palavra do dicionário ou chunk) nos exercícios. */
export interface PracticeStat {
  /** `vocab:<id>` ou `chunk:<id>`. */
  id: string;
  right: number;
  wrong: number;
  lastAt: ISODateTime;
}

/** Áudio de uma fala. Fica só neste navegador: não entra no backup nem na nuvem. */
export interface Recording {
  /** Igual ao id da SpeakingSession a que pertence. */
  id: string;
  blob: Blob;
  createdAt: ISODateTime;
}

export type FollowUpStatus = 'done' | 'partly' | 'not';

/** Fechamento de um livro. A chave é o título normalizado (ver domain/books). */
export interface BookNote {
  id: string;
  title: string;
  /** O que fica do livro, nas palavras do usuário, em inglês. */
  takeaway: string;
  finishedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export type FeedbackKind = 'grammar' | 'improve' | 'natural' | 'retell';
export type FeedbackTarget =
  | 'mainIdea'
  | 'chunkSentence'
  | 'opinion'
  | 'soWhat'
  | 'writing'
  | 'retell'
  | 'followUp'
  | 'bookTakeaway'
  | 'practice';

/** Retorno da IA. Guarda o original ao lado da correção; nada é sobrescrito. */
export interface AIFeedback {
  id: string;
  kind: FeedbackKind;
  targetType: FeedbackTarget;
  targetId: string;
  original: string;
  corrected: string;
  explanation: string;
  moreNatural: string | null;
  provider: string;
  model: string;
  createdAt: ISODateTime;
}
