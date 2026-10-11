import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useEffect, useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { canTranscribe, transcribeAudio } from '../../ai/feedback';
import { weekPlan } from '../../domain/cycle';
import { formatDate, formatDuration } from '../../domain/dates';
import { checkDictation, DICTATION_PASS, locateTerm } from '../../domain/exercises';
import { listeningSentences } from '../../domain/listening';
import { countWords, looksLikeSingleWord, MAX_CHUNKS_PER_DAY } from '../../domain/session';
import { scheduler } from '../../domain/srs';
import type { Chunk, ListeningAnswer, StepId } from '../../domain/types';
import { ChunkLimitError } from '../../services/errors';
import { saveRecording } from '../../services/maintenance';
import { getUpcoming } from '../../services/reviews';
import {
  addChunk,
  addChunkSentence,
  addIdea,
  addVocab,
  type ChunkInput,
  chunksToPractice,
  deleteChunk,
  deleteIdea,
  deleteVocab,
  type IdeaWithCards,
  lastBookTitle,
  recordSpeaking,
  replaceChunk,
  saveListeningAnswer,
  saveReflection,
  saveTranscript,
  type SessionBundle,
  setIdeaOfDay,
  splitIntoCards,
  updateChunk,
  updateIdea,
  updateSessionNotes,
} from '../../services/sessions';
import { sentenceTarget } from '../../domain/feedback';
import { AIFeedbackPanel } from '../components/AIFeedbackPanel';
import { DaySummary } from '../components/DaySummary';
import { ListenButton, ListenSettings, RecordingPlayer } from '../components/Listen';
import { GlossedParagraph, Reader } from '../components/Reader';
import { SentenceTranslation } from '../components/SentenceTranslation';
import { CardSequence } from '../components/CardSequence';
import { IdeaImport } from '../components/IdeaImport';
import { ReviewFlow } from '../components/ReviewFlow';
import { Timer } from '../components/Timer';
import {
  AutoTextArea,
  Badge,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Hint,
  Notice,
  Prompt,
  StarterChips,
  type StarterGroup,
  TextArea,
  TextInput,
} from '../components/ui';
import { useSettings } from '../hooks';
import { stopSpeaking } from '../speech';
import { attempt, showToast } from '../toast';

export interface StepProps {
  bundle: SessionBundle;
  goTo: (step: StepId) => void;
}

const paragraphCount = (n: number): string => `${n} ${n === 1 ? 'parágrafo' : 'parágrafos'}`;

/** Os parágrafos com texto, na ordem de leitura. */
const paragraphsOf = (item: IdeaWithCards): string[] => item.cards.map((c) => c.content.trim()).filter(Boolean);

function NeedsText({ goTo }: Pick<StepProps, 'goTo'>) {
  return (
    <EmptyState title="Nenhum texto registrado hoje.">
      <p className="mb-4">Esta etapa trabalha o texto do dia. Registre-o primeiro.</p>
      <Button onClick={() => goTo('text')}>Registrar o texto</Button>
    </EmptyState>
  );
}

/** Cabeçalho do texto em estudo, com a fonte de onde ele vem. */
function TextHeading({ item }: { item: IdeaWithCards }) {
  return (
    <div>
      <Eyebrow>Texto do dia</Eyebrow>
      <h3 className="mt-1 font-serif text-xl">{item.idea.title}</h3>
      <p className="text-sm text-muted">
        {[item.idea.bookTitle, paragraphCount(item.cards.length), `${countWords(paragraphsOf(item).join(' '))} palavras`]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}

// ---------- 1. REVIEW ----------

export function ReviewStep({ bundle }: StepProps) {
  return (
    <div className="space-y-4">
      <Hint>Tente recuperar o significado e criar uma frase antes de conferir.</Hint>
      <ReviewFlow date={bundle.session.date} />
    </div>
  );
}

// ---------- 2. TEXT ----------

function TextEditor({ item, current, onlyOne }: { item: IdeaWithCards; current: boolean; onlyOne: boolean }) {
  const [open, setOpen] = useState<'paragraphs' | 'details' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { idea, cards } = item;
  const toggle = (panel: 'paragraphs' | 'details') => setOpen(open === panel ? null : panel);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-serif text-lg leading-snug break-words">{idea.title}</h4>
          <p className="text-sm text-muted">{[idea.bookTitle, paragraphCount(cards.length)].filter(Boolean).join(' · ')}</p>
        </div>
        {current && !onlyOne && <Badge tone="accent">Em estudo</Badge>}
      </div>
      {!current && (
        <div className="mt-2">
          <Button small variant="secondary" onClick={() => attempt(setIdeaOfDay(idea.sessionId, idea.id))}>
            Estudar este texto hoje
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-5">
        <button
          type="button"
          aria-expanded={open === 'paragraphs'}
          onClick={() => toggle('paragraphs')}
          className="min-h-10 text-sm font-medium text-accent"
        >
          Parágrafos ({cards.length})
        </button>
        <button
          type="button"
          aria-expanded={open === 'details'}
          onClick={() => toggle('details')}
          className="min-h-10 text-sm font-medium text-accent"
        >
          Título, fonte, tema e observações
        </button>
      </div>

      {open === 'paragraphs' && (
        <div className="mt-2">
          <Hint>Para não estragar o LISTEN, confira os parágrafos só se precisar corrigir algo.</Hint>
          <CardSequence item={item} />
        </div>
      )}

      {open === 'details' && (
        <div className="mt-2 space-y-3">
          <AutoTextArea label="Título" value={idea.title} onSave={(title) => updateIdea(idea.id, { title })} rows={1} lang="en" />
          <AutoTextArea label="Fonte" value={idea.bookTitle} onSave={(bookTitle) => updateIdea(idea.id, { bookTitle })} rows={1} />
          <AutoTextArea label="Tema / categoria" value={idea.category} onSave={(category) => updateIdea(idea.id, { category })} rows={1} />
          <AutoTextArea label="Observações" value={idea.notes} onSave={(notes) => updateIdea(idea.id, { notes })} rows={2} />
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Apagar este texto e o que foi feito com ele?</span>
              <Button small variant="danger" onClick={() => attempt(deleteIdea(idea.id))}>
                Apagar
              </Button>
              <Button small variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button small variant="danger" onClick={() => setConfirming(true)}>
              Apagar texto
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function TextStep({ bundle, goTo }: StepProps) {
  const { session, ideas } = bundle;
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const remembered = useLiveQuery(lastBookTitle, [ideas.length]);
  const paragraphs = splitIntoCards(body);

  // Sugere a fonte do último texto registrado, até o usuário digitar outra.
  useEffect(() => {
    if (source === null && remembered !== undefined) setSource(remembered);
  }, [source, remembered]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || paragraphs.length === 0) return;
    attempt(
      addIdea(session.id, { title, bookTitle: source ?? '', cards: paragraphs }).then(() => {
        setTitle('');
        setBody('');
      }),
    );
  };

  if (ideas.length > 0) {
    return (
      <div className="space-y-4">
        {ideas.map((item) => (
          <TextEditor key={item.idea.id} item={item} current={item.idea.id === session.ideaOfDayId} onlyOne={ideas.length === 1} />
        ))}
        <Notice>
          Texto registrado. Agora vem o <strong>LISTEN</strong>: ouça antes de ler, para treinar o ouvido sem o apoio da escrita.
        </Notice>
        <Button onClick={() => goTo('listen')}>Ir para o LISTEN</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Notice>
        Qualquer texto em inglês serve: artigo, notícia, página de livro, post, letra de música. Para uma sessão, de 150 a 400 palavras é um
        bom tamanho. <strong>Cole sem ler</strong>: a primeira passada será só ouvindo.
      </Notice>

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line p-4">
        <TextInput label="Título" value={title} onChange={setTitle} lang="en" placeholder="Why we sleep" autoComplete="off" />
        <TextInput
          label="Fonte (opcional)"
          value={source ?? ''}
          onChange={setSource}
          autoComplete="off"
          placeholder="Livro, site, autor…"
        />
        <TextArea
          label="Texto"
          value={body}
          onChange={setBody}
          rows={8}
          lang="en"
          placeholder="Cole o texto aqui. Cada parágrafo fica separado do outro por uma quebra de linha."
        />
        {body.trim() && (
          <Hint>
            {paragraphCount(paragraphs.length)} · {countWords(body)} palavras
          </Hint>
        )}
        <Button type="submit" block disabled={!title.trim() || paragraphs.length === 0}>
          Registrar o texto
        </Button>
        <IdeaImport
          onImported={(imported) => {
            if (imported.title && !title.trim()) setTitle(imported.title);
            setBody(imported.cards.join('\n\n'));
          }}
        />
      </form>
    </div>
  );
}

// ---------- 3. LISTEN ----------

/** Quantas frases do texto entram no ditado do LISTEN. */
const LISTEN_SENTENCES = 3;

/** Uma frase do texto para ouvir e escrever. A resposta fica guardada na sessão. */
function ListeningSentence({
  sessionId,
  number,
  sentence,
  saved,
}: {
  sessionId: string;
  number: number;
  sentence: string;
  saved: ListeningAnswer | undefined;
}) {
  const [answer, setAnswer] = useState('');
  const [retrying, setRetrying] = useState(false);
  const checked = saved !== undefined && !retrying;
  const result = checked ? checkDictation(saved.answer, sentence) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    stopSpeaking();
    const score = checkDictation(answer, sentence).score;
    attempt(
      saveListeningAnswer(sessionId, { sentence, answer: answer.trim(), score }).then(() => {
        setRetrying(false);
        setAnswer('');
      }),
    );
  };

  return (
    <li className="space-y-2 border-l-2 border-line pl-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Frase {number}</span>
        <ListenButton text={sentence} label="Ouvir" />
      </div>
      {result && saved ? (
        <div className="space-y-1" aria-live="polite">
          <p className={`text-sm font-medium ${result.score >= DICTATION_PASS ? 'text-good' : 'text-danger'}`}>
            {Math.round(result.score * 100)}% das palavras certas
          </p>
          <p className="font-serif text-lg break-words" lang="en">
            {result.words.map((word, i) => (
              <span key={i}>
                {i > 0 && ' '}
                {word.hit ? word.text : <mark className="rounded bg-sunken px-0.5 text-danger">{word.text}</mark>}
              </span>
            ))}
          </p>
          <p className="text-sm text-muted break-words">
            Você escreveu: <span lang="en">{saved.answer}</span>
          </p>
          <SentenceTranslation sentence={sentence} />
          <button type="button" onClick={() => setRetrying(true)} className="min-h-8 text-sm font-medium text-accent">
            Tentar de novo
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <TextArea label={`O que você ouviu na frase ${number}`} hideLabel value={answer} onChange={setAnswer} rows={2} lang="en" />
          <Button small type="submit" variant="secondary" disabled={!answer.trim()}>
            Conferir
          </Button>
        </form>
      )}
    </li>
  );
}

export function ListenStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay } = bundle;
  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const paragraphs = paragraphsOf(ideaOfDay);
  if (paragraphs.length === 0) return <NeedsText goTo={goTo} />;
  const whole = paragraphs.join('\n\n');
  const sentences = listeningSentences(paragraphs, LISTEN_SENTENCES);
  const answers = session.listenAnswers ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Texto do dia</Eyebrow>
        <h3 className="mt-1 font-serif text-xl">{ideaOfDay.idea.title}</h3>
      </div>

      <div className="space-y-3">
        <Prompt>1. Ouça o texto inteiro, sem ler.</Prompt>
        <Hint>
          Na primeira vez, só a ideia geral. Ouça de novo quantas vezes quiser; se estiver difícil, diminua a velocidade ou ouça um
          parágrafo por vez.
        </Hint>
        <ListenSettings />
        <ListenButton big text={whole} label="Ouvir o texto inteiro" />
        {paragraphs.length > 1 && (
          <div className="flex flex-wrap gap-x-4">
            {paragraphs.map((p, i) => (
              <ListenButton key={i} text={p} label={`Parágrafo ${i + 1}`} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Prompt>2. O que você entendeu?</Prompt>
        <AutoTextArea
          label="O que entendi só ouvindo (em inglês ou em português)"
          hideLabel
          value={session.listenGist ?? ''}
          onSave={(listenGist) => updateSessionNotes(session.id, { listenGist })}
          rows={3}
          placeholder="Do que o texto fala? Que palavras você reconheceu?"
        />
        <Hint>Na etapa READ você compara isto com o que o texto diz de verdade.</Hint>
      </div>

      {sentences.length > 0 && (
        <div className="space-y-3">
          <Prompt>3. Ditado: ouça e escreva cada frase.</Prompt>
          <Hint>Frases tiradas do texto. Maiúsculas, pontuação e apóstrofos não contam.</Hint>
          <ol className="space-y-4">
            {sentences.map((sentence, i) => (
              <ListeningSentence
                key={sentence}
                sessionId={session.id}
                number={i + 1}
                sentence={sentence}
                saved={answers.find((a) => a.sentence === sentence)}
              />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ---------- 4. READ ----------

export function ReadStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, vocab } = bundle;
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const { idea, cards } = ideaOfDay;
  const withText = cards.filter((c) => c.content.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    attempt(
      addVocab(session.id, idea.id, term, meaning).then(() => {
        setTerm('');
        setMeaning('');
      }),
    );
  };

  return (
    <div className="space-y-6">
      <TextHeading item={ideaOfDay} />

      <Notice>
        Leia tudo em inglês antes de traduzir e não pare em toda palavra desconhecida. Depois, clique nas palavras e expressões que quiser
        entender: a análise aparece no contexto e pode ir para o dicionário.
      </Notice>

      {withText.length > 0 && <Reader ideaId={idea.id} cards={withText} />}

      {session.listenGist?.trim() && (
        <Card>
          <Eyebrow>O que você entendeu só ouvindo</Eyebrow>
          <p className="mt-2 whitespace-pre-wrap">{session.listenGist}</p>
          <Hint>Compare com o texto: o que você captou e o que escapou?</Hint>
        </Card>
      )}

      <div className="space-y-3">
        <Prompt>What is the main idea?</Prompt>
        <Hint>Uma frase que resuma o texto inteiro, não só o primeiro parágrafo.</Hint>
        <AutoTextArea
          label="Ideia principal, em uma frase em inglês"
          hideLabel
          value={idea.mainIdea}
          onSave={(mainIdea) => updateIdea(idea.id, { mainIdea })}
          rows={3}
          lang="en"
          placeholder="The main idea is that…"
        />
        <AIFeedbackPanel targetType="mainIdea" targetId={idea.id} text={idea.mainIdea} context={`Texto: ${idea.title}`} />
      </div>

      <Notice>
        Só agora consulte tradução ou dicionário e compare com a sua primeira interpretação. {weekPlan(session.cycleWeek).translation}
      </Notice>

      <AutoTextArea
        label="O que eu entendi errado ou não sabia?"
        value={session.misunderstood}
        onSave={(misunderstood) => updateSessionNotes(session.id, { misunderstood })}
        rows={3}
      />

      <div className="space-y-3">
        <div>
          <Eyebrow>Vocabulário de compreensão</Eyebrow>
          <Hint>Só para entender este texto. Não entra na revisão; para isso existem os chunks da próxima etapa.</Hint>
        </div>
        {vocab.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {vocab.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-serif" lang="en">
                    {v.term}
                  </span>
                  {v.meaning && <span className="text-muted"> — {v.meaning}</span>}
                </span>
                <Button small variant="ghost" aria-label={`Remover ${v.term}`} onClick={() => attempt(deleteVocab(v.id))}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextInput label="Palavra ou expressão" value={term} onChange={setTerm} lang="en" autoComplete="off" />
          <TextInput label="Significado" value={meaning} onChange={setMeaning} autoComplete="off" />
          <Button type="submit" variant="secondary" disabled={!term.trim()}>
            Anotar
          </Button>
        </form>
      </div>
    </div>
  );
}

// ---------- 5. MINE ----------

export function MineStep({ bundle }: StepProps) {
  const { session, ideas, chunks, ideaOfDay } = bundle;
  const [text, setText] = useState('');
  const [meaning, setMeaning] = useState('');
  const [original, setOriginal] = useState('');
  const [sourceId, setSourceId] = useState('');
  /** Chunk que ficou de fora por causa do limite, esperando o usuário escolher qual trocar. */
  const [overflow, setOverflow] = useState<ChunkInput | null>(null);
  const defaultSource = ideaOfDay?.idea.id ?? '';

  const reset = () => {
    setText('');
    setMeaning('');
    setOriginal('');
    setOverflow(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const input: ChunkInput = {
      text,
      meaning,
      originalSentence: original,
      sourceIdeaId: sourceId || defaultSource || null,
    };
    addChunk(session.id, input)
      .then(reset)
      .catch((error: unknown) => {
        if (error instanceof ChunkLimitError) setOverflow(input);
        else attempt(Promise.reject(error));
      });
  };

  return (
    <div className="space-y-5">
      <Notice>
        Escolha no texto de hoje. Prefira expressões reutilizáveis a palavras isoladas. Ex.: <em lang="en">one thing at a time</em>,{' '}
        <em lang="en">in your head</em>, <em lang="en">it turns out that</em>.
      </Notice>

      <div className="flex items-baseline justify-between">
        <Eyebrow>Chunks para aprender</Eyebrow>
        <p className="text-sm text-muted">
          {chunks.length}/{MAX_CHUNKS_PER_DAY}
        </p>
      </div>

      {chunks.map((chunk, i) => (
        <Card key={chunk.id}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-serif text-xl" lang="en">
              {i + 1}. {chunk.text}
            </p>
            <Button small variant="ghost" aria-label={`Remover ${chunk.text}`} onClick={() => attempt(deleteChunk(chunk.id))}>
              Remover
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            <AutoTextArea
              label="Significado"
              value={chunk.meaning}
              onSave={(value) => updateChunk(chunk.id, { meaning: value })}
              rows={1}
            />
            <AutoTextArea
              label="Frase original (contexto no texto)"
              value={chunk.originalSentence}
              onSave={(value) => updateChunk(chunk.id, { originalSentence: value })}
              rows={2}
              lang="en"
            />
          </div>
        </Card>
      ))}

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line p-4">
        <TextInput label="Nova expressão" value={text} onChange={setText} lang="en" autoComplete="off" placeholder="one thing at a time" />
        {text.trim() && looksLikeSingleWord(text) && (
          <Hint>Isto parece uma palavra isolada. Um bloco de duas ou mais palavras costuma ser mais reutilizável.</Hint>
        )}
        <TextInput label="Significado (depois de tentar deduzir)" value={meaning} onChange={setMeaning} autoComplete="off" />
        <TextArea label="Frase original" value={original} onChange={setOriginal} rows={2} lang="en" />
        {ideas.length > 1 && (
          <div>
            <label htmlFor="chunk-source" className="mb-1.5 block text-sm font-medium">
              Texto de origem
            </label>
            <select
              id="chunk-source"
              value={sourceId || defaultSource}
              onChange={(e) => setSourceId(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-line bg-paper px-3"
            >
              {!ideaOfDay && <option value="">Sem texto</option>}
              {ideas.map(({ idea }) => (
                <option key={idea.id} value={idea.id}>
                  {idea.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="secondary" block disabled={!text.trim()}>
          Adicionar chunk
        </Button>
      </form>

      {overflow && (
        <Notice tone="warn">
          <p className="font-medium">Você já selecionou três expressões hoje. Escolha quais realmente merecem entrar na revisão.</p>
          <p className="mt-2">
            Substituir por <em lang="en">{overflow.text}</em>:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {chunks.map((c) => (
              <Button key={c.id} small variant="secondary" onClick={() => attempt(replaceChunk(c.id, overflow).then(reset))}>
                {c.text}
              </Button>
            ))}
            <Button small variant="ghost" onClick={() => setOverflow(null)}>
              Manter as três
            </Button>
          </div>
        </Notice>
      )}
    </div>
  );
}

// ---------- 6. READ ALOUD ----------

/** Ritmo de referência da leitura em voz alta, em palavras por segundo (cerca de 130 por minuto). */
const ALOUD_WORDS_PER_SEC = 2.2;

/** Quanto do parágrafo a transcrição reconheceu, com as palavras que ficaram de fora em destaque. */
function AloudResult({ transcript, paragraph, durationSec }: { transcript: string; paragraph: string; durationSec: number }) {
  const result = checkDictation(transcript, paragraph);
  return (
    <Card>
      <Eyebrow>
        Leitura de {formatDuration(durationSec)} · {Math.round(result.score * 100)}% das palavras reconhecidas
      </Eyebrow>
      {result.missed > 0 ? (
        <>
          <p className="mt-2 font-serif text-lg leading-relaxed break-words" lang="en">
            {result.words.map((word, i) => (
              <span key={i}>
                {i > 0 && ' '}
                {word.hit ? word.text : <mark className="rounded bg-sunken px-0.5 text-danger">{word.text}</mark>}
              </span>
            ))}
          </p>
          <Hint>
            Em destaque, o que a transcrição não reconheceu: pode ser pronúncia, uma palavra pulada ou falha da própria transcrição. Ouça o
            modelo dessas palavras e leia de novo.
          </Hint>
        </>
      ) : (
        <p className="mt-2 text-sm text-good">Todas as palavras foram reconhecidas.</p>
      )}
      <details className="mt-2 text-sm">
        <summary className="min-h-8 cursor-pointer text-xs font-medium text-accent">O que a transcrição ouviu</summary>
        <p className="font-serif text-muted" lang="en">
          {transcript}
        </p>
      </details>
    </Card>
  );
}

export function AloudStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, speaking } = bundle;
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const [playback, setPlayback] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  // Libera a gravação anterior da memória ao trocar ou sair da tela.
  useEffect(
    () => () => {
      if (playback) URL.revokeObjectURL(playback);
    },
    [playback],
  );

  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const cards = ideaOfDay.cards.filter((c) => c.content.trim());
  if (cards.length === 0) return <NeedsText goTo={goTo} />;
  const readings = speaking.filter((s) => s.kind === 'aloud');
  // Por padrão, o primeiro parágrafo ainda não lido em voz alta.
  const card = cards.find((c) => c.id === chosen) ?? cards.find((c) => !readings.some((r) => r.cardId === c.id)) ?? cards[0];
  if (!card) return <NeedsText goTo={goTo} />;
  const transcription = Boolean(settings && canTranscribe(settings.ai));
  const expectedSec = Math.max(5, Math.round(countWords(card.content) / ALOUD_WORDS_PER_SEC));
  const mine = readings.filter((r) => r.cardId === card.id);

  const finish = async (durationSec: number, audio: Blob | null) => {
    const id = await recordSpeaking({
      kind: 'aloud',
      sessionId: session.id,
      ideaId: ideaOfDay.idea.id,
      cardId: card.id,
      date: session.date,
      durationSec,
      targetSec: expectedSec,
    });
    if (!id) return;
    showToast(`Leitura registrada: ${formatDuration(durationSec)}`);
    if (!audio) return;
    await saveRecording(id, audio);
    setPlayback(URL.createObjectURL(audio));
    if (!transcription) return;
    setTranscribing(true);
    try {
      await saveTranscript(id, await transcribeAudio(audio));
    } catch (e) {
      showToast(e instanceof AIError ? e.message : 'Não foi possível transcrever a leitura.', 'error');
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="space-y-6">
      <TextHeading item={ideaOfDay} />
      <div>
        <Prompt>Ouça o modelo e leia em voz alta.</Prompt>
        <Hint>
          Shadowing: ouça o parágrafo, leia junto com o áudio algumas vezes e, por fim, grave a sua leitura sozinho. Imite o ritmo, as
          pausas e a entonação, não só as palavras.
        </Hint>
      </div>

      {cards.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Parágrafo para ler">
          {cards.map((c, i) => {
            const active = c.id === card.id;
            const done = readings.some((r) => r.cardId === c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  stopSpeaking();
                  setChosen(c.id);
                  setPlayback(null);
                }}
                className={`min-h-10 rounded-xl border px-3 text-sm font-medium ${
                  active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                {done && <span aria-hidden="true">✓ </span>}Parágrafo {i + 1}
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <GlossedParagraph text={card.content} className="whitespace-pre-wrap font-serif text-lg leading-loose" />
        <div className="mt-3 space-y-2">
          <ListenButton big text={card.content} label="Ouvir o modelo" />
          <ListenSettings />
        </div>
      </Card>

      <Card>
        <Timer
          record
          minSec={expectedSec}
          maxSec={expectedSec}
          targetPrefix="Em ritmo natural"
          targetLabel={`~${formatDuration(expectedSec)}`}
          onStop={(durationSec, audio) => attempt(finish(durationSec, audio))}
        />
        <p className="mt-2 text-center text-xs text-muted">
          {transcription
            ? 'A leitura é gravada e transcrita; a transcrição mostra as palavras que não foram reconhecidas.'
            : 'A leitura é gravada para você se ouvir e comparar com o modelo. Com Groq em Ajustes, ela também é transcrita e conferida.'}
        </p>
      </Card>

      {playback && (
        <div>
          <p className="mb-1 text-sm font-medium">Ouça a sua leitura e compare com o modelo</p>
          <RecordingPlayer src={playback} />
        </div>
      )}

      {transcribing && (
        <p className="text-sm text-muted" role="status">
          Transcrevendo…
        </p>
      )}

      {mine
        .filter((r) => r.transcript)
        .map((r) => (
          <AloudResult key={r.id} transcript={r.transcript ?? ''} paragraph={card.content} durationSec={r.durationSec} />
        ))}
    </div>
  );
}

// ---------- 7. RETELL ----------

const RETELL_PROMPTS = [
  'Today I read about…',
  'The main idea is…',
  'First… / Then… / Finally…',
  'One interesting point is…',
  'I think this is important because…',
  'In my experience…',
  'For example…',
  'However…',
  'In other words…',
  'From my perspective…',
] as const;

export function RetellStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, chunks } = bundle;
  const settings = useSettings();
  const [playback, setPlayback] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  // Libera a gravação anterior da memória ao trocar ou sair da tela.
  useEffect(
    () => () => {
      if (playback) URL.revokeObjectURL(playback);
    },
    [playback],
  );

  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  // As leituras em voz alta têm a etapa própria; aqui ficam só as falas do retell.
  const speaking = bundle.speaking.filter((s) => s.kind === 'daily');
  const plan = weekPlan(session.cycleWeek);
  const total = speaking.reduce((sum, s) => sum + s.durationSec, 0);
  const transcription = Boolean(settings && canTranscribe(settings.ai));
  const { idea } = ideaOfDay;
  const transcripts = speaking.map((s) => s.transcript ?? '').filter((t) => t.trim());
  const usedCount = chunks.filter((c) => transcripts.some((t) => locateTerm(t, c.text))).length;

  const finish = async (durationSec: number, audio: Blob | null) => {
    const id = await recordSpeaking({
      kind: 'daily',
      sessionId: session.id,
      ideaId: idea.id,
      date: session.date,
      durationSec,
      targetSec: plan.speakingMaxSec,
    });
    if (!id) return;
    showToast(`Fala registrada: ${formatDuration(durationSec)}`);
    if (!audio) return;
    await saveRecording(id, audio);
    setPlayback(URL.createObjectURL(audio));
    if (!transcription) return;
    setTranscribing(true);
    try {
      await saveTranscript(id, await transcribeAudio(audio));
    } catch (e) {
      showToast(e instanceof AIError ? e.message : 'Não foi possível transcrever a fala.', 'error');
    } finally {
      setTranscribing(false);
    }
  };

  const feedbackContext = [
    `Texto recontado: "${idea.title}".`,
    idea.mainIdea && `Ideia principal segundo o aluno: ${idea.mainIdea}`,
    chunks.length > 0 &&
      `Expressões que ele está aprendendo e deveria usar na fala: ${chunks.map((c) => c.text).join('; ')}. No comentário, diga quais ele usou e mostre, com uma frase de exemplo, como encaixar as que faltaram.`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-6">
      <TextHeading item={ideaOfDay} />
      <div>
        <Prompt>Esconda o texto e reconte-o em voz alta.</Prompt>
        <Hint>
          Conte o texto do começo ao fim, com as suas palavras. Fase {session.cycleWeek} de 4: {plan.focus} Não reinicie por causa de erros.
        </Hint>
      </div>

      <StarterChips starters={RETELL_PROMPTS} />

      {chunks.length > 0 && (
        <Card>
          <Eyebrow>Use os seus chunks na fala</Eyebrow>
          <ul className="mt-2 space-y-1">
            {chunks.map((chunk) => {
              const used = transcripts.some((t) => locateTerm(t, chunk.text));
              return (
                <li key={chunk.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-serif text-lg break-words" lang="en">
                    {chunk.text}
                  </span>
                  {chunk.meaning && <span className="text-sm text-muted">— {chunk.meaning}</span>}
                  {transcripts.length > 0 && (
                    <span className={`text-xs font-semibold ${used ? 'text-good' : 'text-muted'}`}>
                      {used ? '✓ usado na fala' : 'ainda não usado'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2">
            <Hint>
              Tente encaixar cada expressão ao recontar o texto.
              {transcripts.length > 0 && ` Você usou ${usedCount} de ${chunks.length} até agora.`}
            </Hint>
          </div>
        </Card>
      )}

      <AutoTextArea
        label="Palavras de apoio (só palavras-chave, não um roteiro)"
        value={session.retellNotes}
        onSave={(retellNotes) => updateSessionNotes(session.id, { retellNotes })}
        rows={2}
        lang="en"
      />

      <Card>
        <Timer
          record
          minSec={plan.speakingMinSec}
          maxSec={plan.speakingMaxSec}
          targetLabel={plan.speakingLabel}
          onStop={(durationSec, audio) => attempt(finish(durationSec, audio))}
        />
        <p className="mt-2 text-center text-xs text-muted">
          {transcription
            ? 'A fala é gravada e transcrita ao terminar. O áudio fica neste navegador, para o fechamento do ciclo.'
            : 'A fala é gravada e fica neste navegador, para você se ouvir. Com Groq em Ajustes, ela também é transcrita.'}
        </p>
      </Card>

      {playback && (
        <div>
          <p className="mb-1 text-sm font-medium">Ouça a sua última fala</p>
          <RecordingPlayer src={playback} />
        </div>
      )}

      {transcribing && (
        <p className="text-sm text-muted" role="status">
          Transcrevendo…
        </p>
      )}

      {speaking.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted" aria-live="polite">
            {speaking.length === 1 ? '1 fala registrada hoje' : `${speaking.length} falas registradas hoje`} · {formatDuration(total)} no
            total.
          </p>
          {speaking
            .filter((s) => s.transcript)
            .map((s) => (
              <Card key={s.id}>
                <Eyebrow>O que você disse · {formatDuration(s.durationSec)}</Eyebrow>
                <p className="mt-2 whitespace-pre-wrap font-serif text-lg leading-relaxed" lang="en">
                  {s.transcript}
                </p>
                <AIFeedbackPanel
                  targetType="retell"
                  targetId={s.id}
                  text={s.transcript ?? ''}
                  context={feedbackContext}
                  kinds={['retell']}
                />
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------- 8. PERSONALIZE ----------

/** Um chunk de dias anteriores, para escrever mais uma frase com ele. */
function ExtraChunk({ chunk }: { chunk: Chunk }) {
  const [sentence, setSentence] = useState('');
  const [saved, setSaved] = useState('');
  const previous = [chunk.userSentence, ...(chunk.extraSentences ?? [])].filter((s) => s.trim());

  const keep = () => {
    const text = sentence.trim();
    if (!text) return;
    attempt(
      addChunkSentence(chunk.id, text).then(() => {
        setSaved(text);
        setSentence('');
      }),
    );
  };

  return (
    <Card>
      <p className="font-serif text-lg break-words" lang="en">
        {chunk.text}
        {chunk.meaning && <span className="font-sans text-sm text-muted"> — {chunk.meaning}</span>}
      </p>
      {previous.length > 0 && (
        <details className="mt-1 text-sm">
          <summary className="min-h-8 cursor-pointer text-xs font-medium text-accent">
            {previous.length === 1 ? 'Ver a frase que já escrevi' : `Ver as ${previous.length} frases que já escrevi`}
          </summary>
          <ul className="space-y-1 font-serif text-muted" lang="en">
            {previous.map((s) => (
              <li key={s} className="break-words">
                “{s}”
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-2 space-y-2">
        <TextArea label="Uma frase nova, sobre outra situação" value={sentence} onChange={setSentence} rows={2} lang="en" />
        <Button small variant="secondary" disabled={!sentence.trim()} onClick={keep}>
          Guardar frase
        </Button>
        {saved && (
          <>
            <p className="text-sm text-good">Frase guardada.</p>
            <AIFeedbackPanel
              targetType="chunkSentence"
              targetId={sentenceTarget(chunk.id, saved, chunk.userSentence)}
              text={saved}
              context={`O aluno está praticando a expressão "${chunk.text}".`}
            />
          </>
        )}
      </div>
    </Card>
  );
}

const EXTRA_BATCH = 3;

/** Depois dos chunks de hoje, mais chunks antigos para continuar treinando, de três em três. */
function MoreChunks({ sessionId }: { sessionId: string }) {
  const [shown, setShown] = useState<Chunk[]>([]);
  const [exhausted, setExhausted] = useState(false);

  const more = async () => {
    const next = await chunksToPractice(
      sessionId,
      EXTRA_BATCH,
      shown.map((c) => c.id),
    );
    setShown([...shown, ...next]);
    setExhausted(next.length < EXTRA_BATCH);
  };

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div>
        <Eyebrow>Treinar com mais chunks</Eyebrow>
        <Hint>Chunks de dias anteriores, começando pelos que você mais esquece nas revisões. É opcional.</Hint>
      </div>
      {shown.map((chunk) => (
        <ExtraChunk key={chunk.id} chunk={chunk} />
      ))}
      {exhausted ? (
        <Hint>{shown.length === 0 ? 'Ainda não há chunks de dias anteriores.' : 'Esses são todos os seus chunks anteriores.'}</Hint>
      ) : (
        <Button variant="secondary" onClick={() => attempt(more())}>
          {shown.length === 0 ? `Trazer ${EXTRA_BATCH} chunks anteriores` : `Mais ${EXTRA_BATCH} chunks`}
        </Button>
      )}
    </div>
  );
}

export function PersonalizeStep({ bundle, goTo }: StepProps) {
  const { session, chunks } = bundle;
  return (
    <div className="space-y-5">
      <div>
        <Prompt>Create your own sentence.</Prompt>
        <Hint>Relacione a frase ao seu trabalho, estudo, rotina ou experiência.</Hint>
      </div>
      {chunks.length === 0 && (
        <EmptyState title="Nenhum chunk selecionado hoje.">
          <Button onClick={() => goTo('mine')}>Escolher chunks</Button>
        </EmptyState>
      )}
      {chunks.map((chunk) => (
        <Card key={chunk.id}>
          <p className="font-serif text-xl uppercase tracking-wide" lang="en">
            {chunk.text}
          </p>
          <div className="mt-3">
            <AutoTextArea
              label="Minha frase"
              value={chunk.userSentence}
              onSave={(userSentence) => updateChunk(chunk.id, { userSentence })}
              rows={2}
              lang="en"
            />
            <AIFeedbackPanel
              targetType="chunkSentence"
              targetId={chunk.id}
              text={chunk.userSentence}
              context={`O aluno está praticando a expressão "${chunk.text}".`}
            />
          </div>
        </Card>
      ))}
      <MoreChunks sessionId={session.id} />
    </div>
  );
}

// ---------- 9. REFLECT ----------

/** Conectores para montar a opinião, agrupados pelo que fazem na frase. */
const REFLECT_CONNECTORS: readonly StarterGroup[] = [
  {
    label: 'Opinar',
    items: [
      'I agree because',
      'I disagree because',
      'I partly agree because',
      'In my opinion,',
      'From my perspective,',
      'It seems to me that',
    ],
  },
  {
    label: 'Contrastar',
    items: ['However,', 'On the other hand,', 'Although', 'Even though', 'Nevertheless,', 'While this is true,'],
  },
  {
    label: 'Explicar',
    items: ['because', 'since', 'That is why', 'As a result,', 'Therefore,', 'This means that'],
  },
  {
    label: 'Exemplificar',
    items: ['For example,', 'For instance,', 'In my experience,', 'A good example is', 'such as'],
  },
  {
    label: 'Condicionar',
    items: ['It depends on', 'If', 'Unless', 'As long as', 'In some cases,'],
  },
  {
    label: 'Acrescentar',
    items: ['Also,', 'In addition,', 'Besides,', 'What is more,', 'Not only … but also'],
  },
  {
    label: 'Concluir',
    items: ['So,', 'In short,', 'Overall,', 'All things considered,', 'To sum up,'],
  },
];

export function ReflectStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, reflection } = bundle;
  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const { idea } = ideaOfDay;
  return (
    <div className="space-y-4">
      <div>
        <Prompt>Do I agree with this text? Why?</Prompt>
        <Hint>Questione as ideias de “{idea.title}”: concorde, discorde ou qualifique.</Hint>
      </div>
      <AutoTextArea
        label="Em português: o que eu penso sobre o texto (rascunho)"
        value={reflection?.opinionPt ?? ''}
        onSave={(opinionPt) => saveReflection(session.id, idea.id, { opinionPt })}
        rows={3}
        placeholder="Organize o raciocínio aqui. Depois escreva em inglês, abaixo."
      />
      <Hint>A orientação da IA (“Como fazer esta etapa?”, no topo) leva este rascunho em conta.</Hint>
      <AutoTextArea
        label="My view"
        value={reflection?.userOpinion ?? ''}
        onSave={(userOpinion) => saveReflection(session.id, idea.id, { userOpinion })}
        rows={5}
        lang="en"
        starterGroups={REFLECT_CONNECTORS}
      />
      <AIFeedbackPanel
        targetType="opinion"
        targetId={idea.id}
        text={reflection?.userOpinion ?? ''}
        context={`Opinião sobre o texto "${idea.title}".`}
      />
    </div>
  );
}

// ---------- 10. SO WHAT? ----------

export function SoWhatStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, reflection } = bundle;
  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const { idea } = ideaOfDay;
  return (
    <div className="space-y-4">
      <div>
        <Prompt>What will I do differently because I learned this?</Prompt>
        <Hint>Information → Reflection → Action. Uma ação concreta, começando por “I’ll…”.</Hint>
      </div>
      <AutoTextArea
        label="Em português: o que vou fazer de diferente (rascunho)"
        value={reflection?.soWhatPt ?? ''}
        onSave={(soWhatPt) => saveReflection(session.id, idea.id, { soWhatPt })}
        rows={2}
        placeholder="Uma ação pequena e concreta. Depois escreva em inglês, abaixo."
      />
      <Hint>A orientação da IA (“Como fazer esta etapa?”, no topo) leva este rascunho em conta.</Hint>
      <AutoTextArea
        label="So what?"
        value={reflection?.soWhat ?? ''}
        onSave={(soWhat) => saveReflection(session.id, idea.id, { soWhat })}
        rows={3}
        lang="en"
        placeholder="I’ll…"
      />
      <AIFeedbackPanel
        targetType="soWhat"
        targetId={idea.id}
        text={reflection?.soWhat ?? ''}
        context={`Ação a partir do texto "${idea.title}".`}
      />
    </div>
  );
}

// ---------- 11. SCHEDULE REVIEW ----------

function inDaysLabel(days: number): string {
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}

export function ScheduleStep({ bundle }: StepProps) {
  const { session, ideaOfDay, chunks, speaking, reflection } = bundle;
  const upcoming = useLiveQuery(() => getUpcoming(session.date, 30), [session.date, chunks.length]);
  const seconds = (kind: 'daily' | 'aloud'): number => speaking.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.durationSec, 0);
  const retellSec = seconds('daily');
  const aloudSec = seconds('aloud');
  const answers = session.listenAnswers ?? [];
  const listenScore = answers.length > 0 ? Math.round((answers.reduce((sum, a) => sum + a.score, 0) / answers.length) * 100) : null;
  const sentences = chunks.filter((c) => c.userSentence.trim()).length;
  const words = countWords([...chunks.map((c) => c.userSentence), reflection?.userOpinion ?? '', reflection?.soWhat ?? ''].join(' '));

  const groups: { skill: string; lines: [string, boolean][] }[] = [
    {
      skill: 'Listening',
      lines: [
        [session.listenGist?.trim() ? 'Gist written after listening' : 'No gist', Boolean(session.listenGist?.trim())],
        [
          listenScore === null
            ? 'No dictation'
            : `Dictation: ${answers.length} ${answers.length === 1 ? 'sentence' : 'sentences'}, ${listenScore}% right`,
          listenScore !== null,
        ],
      ],
    },
    {
      skill: 'Reading',
      lines: [
        [
          ideaOfDay ? `1 text read (${ideaOfDay.cards.length} ${ideaOfDay.cards.length === 1 ? 'paragraph' : 'paragraphs'})` : 'No text',
          ideaOfDay !== null,
        ],
        [ideaOfDay?.idea.mainIdea.trim() ? 'Main idea written' : 'No main idea', Boolean(ideaOfDay?.idea.mainIdea.trim())],
        [`${chunks.length} ${chunks.length === 1 ? 'chunk' : 'chunks'} learned`, chunks.length > 0],
      ],
    },
    {
      skill: 'Speaking',
      lines: [
        [`${formatDuration(aloudSec)} reading aloud`, aloudSec > 0],
        [`${formatDuration(retellSec)} retelling`, retellSec > 0],
      ],
    },
    {
      skill: 'Writing',
      lines: [
        [`${sentences} personal ${sentences === 1 ? 'sentence' : 'sentences'}`, sentences > 0],
        [reflection?.userOpinion.trim() ? '1 reflection' : 'No reflection', Boolean(reflection?.userOpinion.trim())],
        [reflection?.soWhat.trim() ? '1 action' : 'No action', Boolean(reflection?.soWhat.trim())],
        [`${words} words written`, words > 0],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <Eyebrow>{session.status === 'completed' ? 'Today completed' : 'Resumo de hoje'}</Eyebrow>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.skill}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{group.skill}</p>
              <ul className="mt-1 space-y-1 font-serif" lang="en">
                {group.lines.map(([label, done]) => (
                  <li key={label} className={done ? '' : 'text-muted'}>
                    <span aria-hidden="true">{done ? '✓' : '·'}</span> {label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <DaySummary sessionId={session.id} />

      {chunks.length > 0 && (
        <div className="space-y-3">
          <Eyebrow>Chunks de hoje e suas revisões</Eyebrow>
          {chunks.map((chunk) => (
            <Card key={chunk.id}>
              <p className="font-serif text-lg" lang="en">
                {chunk.text}
              </p>
              <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                {scheduler.plan(chunk.createdDate).map((p) => (
                  <li key={p.stage}>
                    <span className="font-semibold text-ink">{p.label}</span> {formatDate(p.date, 'short')}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}

      {upcoming && upcoming.length > 0 && (
        <Card>
          <Eyebrow>Next reviews</Eyebrow>
          <ul className="mt-3 space-y-1.5">
            {upcoming.slice(0, 5).map((u) => (
              <li key={u.date} className="flex justify-between">
                <span>
                  {inDaysLabel(u.inDays)} <span className="text-muted">· {formatDate(u.date, 'short')}</span>
                </span>
                <span className="font-semibold tabular-nums">{u.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
