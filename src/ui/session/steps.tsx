import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useEffect, useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { canTranscribe, transcribeAudio } from '../../ai/feedback';
import { bookKey, NO_BOOK_TITLE } from '../../domain/books';
import { weekPlan } from '../../domain/cycle';
import { formatDate, formatDuration } from '../../domain/dates';
import { looksLikeSingleWord, MAX_CHUNKS_PER_DAY } from '../../domain/session';
import { scheduler } from '../../domain/srs';
import type { Chunk, StepId } from '../../domain/types';
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
  saveReflection,
  saveTranscript,
  type SessionBundle,
  setIdeaOfDay,
  updateChunk,
  updateIdea,
  updateSessionNotes,
} from '../../services/sessions';
import { locateTerm } from '../../domain/exercises';
import { sentenceTarget } from '../../domain/feedback';
import { AIFeedbackPanel } from '../components/AIFeedbackPanel';
import { DaySummary } from '../components/DaySummary';
import { RecordingPlayer } from '../components/Listen';
import { GlossedParagraph } from '../components/Reader';
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
import { attempt, showToast } from '../toast';

export interface StepProps {
  bundle: SessionBundle;
  goTo: (step: StepId) => void;
}

const cardCount = (n: number): string => `${n} ${n === 1 ? 'card' : 'cards'}`;

function NeedsIdeaOfDay({ goTo }: Pick<StepProps, 'goTo'>) {
  return (
    <EmptyState title="Nenhuma Idea of the Day escolhida.">
      <p className="mb-4">Esta etapa aprofunda uma única ideia. Escolha qual merece isso hoje.</p>
      <Button onClick={() => goTo('focus')}>Escolher a ideia</Button>
    </EmptyState>
  );
}

/** Cabeçalho da ideia em aprofundamento, com o livro de onde ela vem. */
function IdeaHeading({ item }: { item: IdeaWithCards }) {
  return (
    <div>
      <Eyebrow>⭐ Idea of the Day</Eyebrow>
      <h3 className="mt-1 font-serif text-xl">{item.idea.title}</h3>
      <p className="text-sm text-muted">{[item.idea.bookTitle, cardCount(item.cards.length)].filter(Boolean).join(' · ')}</p>
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

// ---------- 2. READ ----------

function IdeaEditor({ item, isIdeaOfDay }: { item: IdeaWithCards; isIdeaOfDay: boolean }) {
  const [open, setOpen] = useState<'cards' | 'details' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { idea, cards } = item;
  const toggle = (panel: 'cards' | 'details') => setOpen(open === panel ? null : panel);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-serif text-lg leading-snug">{idea.title}</h4>
        </div>
        {isIdeaOfDay && <Badge tone="accent">⭐ Idea of the Day</Badge>}
      </div>
      <div className="mt-3">
        <AutoTextArea
          label="What is the main idea?"
          value={idea.mainIdea}
          onSave={(mainIdea) => updateIdea(idea.id, { mainIdea })}
          rows={2}
          lang="en"
          placeholder="Uma frase curta, em inglês simples."
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5">
        <button
          type="button"
          aria-expanded={open === 'cards'}
          onClick={() => toggle('cards')}
          className="min-h-10 text-sm font-medium text-accent"
        >
          Cards da ideia ({cards.length})
        </button>
        <button
          type="button"
          aria-expanded={open === 'details'}
          onClick={() => toggle('details')}
          className="min-h-10 text-sm font-medium text-accent"
        >
          Livro, tema e observações
        </button>
      </div>

      {open === 'cards' && (
        <div className="mt-2">
          <CardSequence item={item} />
        </div>
      )}

      {open === 'details' && (
        <div className="mt-2 space-y-3">
          <AutoTextArea label="Livro" value={idea.bookTitle} onSave={(bookTitle) => updateIdea(idea.id, { bookTitle })} rows={1} />
          <AutoTextArea label="Tema / categoria" value={idea.category} onSave={(category) => updateIdea(idea.id, { category })} rows={1} />
          <AutoTextArea label="Observações" value={idea.notes} onSave={(notes) => updateIdea(idea.id, { notes })} rows={2} />
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Apagar esta ideia e os cards dela?</span>
              <Button small variant="danger" onClick={() => attempt(deleteIdea(idea.id))}>
                Apagar
              </Button>
              <Button small variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button small variant="danger" onClick={() => setConfirming(true)}>
              Apagar ideia
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function ReadStep({ bundle }: StepProps) {
  const { session, ideas } = bundle;
  const [title, setTitle] = useState('');
  const [book, setBook] = useState<string | null>(null);
  /** Cards trazidos pela importação, esperando o usuário confirmar a ideia. */
  const [cards, setCards] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const remembered = useLiveQuery(lastBookTitle, [ideas.length]);

  // Sugere o livro da última ideia registrada, até o usuário digitar outro.
  useEffect(() => {
    if (book === null && remembered !== undefined) setBook(remembered);
  }, [book, remembered]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    attempt(
      addIdea(session.id, { title, bookTitle: book ?? '', cards }).then(() => {
        setTitle('');
        setCards([]);
      }),
    );
  };

  const totalCards = ideas.reduce((sum, i) => sum + i.cards.length, 0);

  return (
    <div className="space-y-4">
      <Notice>
        Cada livro tem várias ideias, e cada ideia é uma sequência de cards, lida como uma história. Leia tudo em inglês antes de traduzir
        e, ao fim de cada ideia, pergunte: <em>“What is the main idea?”</em> Não pare em toda palavra desconhecida.
      </Notice>

      <div className="flex items-baseline justify-between">
        <Eyebrow>Ideias de hoje</Eyebrow>
        <p className="text-sm text-muted">
          {ideas.length} {ideas.length === 1 ? 'ideia' : 'ideias'}
          {totalCards > 0 && ` · ${cardCount(totalCards)}`}
        </p>
      </div>

      {ideas.map((item, i) => {
        const previous = ideas[i - 1];
        const newBook = !previous || bookKey(previous.idea.bookTitle) !== bookKey(item.idea.bookTitle);
        return (
          <div key={item.idea.id} className="space-y-2">
            {newBook && (
              <h3 className="pt-2 text-sm font-semibold">
                <span className="text-muted">Livro · </span>
                {item.idea.bookTitle || NO_BOOK_TITLE}
              </h3>
            )}
            <IdeaEditor item={item} isIdeaOfDay={item.idea.id === session.ideaOfDayId} />
          </div>
        );
      })}

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line p-4">
        <TextInput label="Livro" value={book ?? ''} onChange={setBook} autoComplete="off" placeholder="Atomic Habits" />
        <TextInput
          label={ideas.length === 0 ? 'Título da primeira ideia' : 'Título da próxima ideia'}
          value={title}
          onChange={setTitle}
          lang="en"
          placeholder="Thought Into Action"
          autoComplete="off"
        />
        {cards.length > 0 && (
          <div className="rounded-xl bg-accent-soft px-3 py-2 text-sm">
            <p className="font-medium">{cardCount(cards.length)} prontos para entrar com esta ideia</p>
            <ol className="mt-1 list-inside list-decimal space-y-1 text-muted">
              {cards.map((c, i) => (
                <li key={i} className="break-words">
                  {c.length > 90 ? `${c.slice(0, 90)}…` : c}
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setCards([])} className="mt-1 min-h-8 text-sm font-medium text-accent">
              Descartar os cards importados
            </button>
          </div>
        )}
        <Button type="submit" variant="secondary" block disabled={!title.trim()}>
          Adicionar ideia{cards.length > 0 && ` com ${cardCount(cards.length)}`}
        </Button>
        <button
          type="button"
          aria-expanded={importing}
          onClick={() => setImporting(!importing)}
          className="min-h-10 text-sm font-medium text-accent"
        >
          {importing ? 'Fechar importação' : 'Importar a ideia inteira (texto colado ou screenshots)'}
        </button>
        {importing && (
          <IdeaImport
            onImported={(idea) => {
              if (idea.title) setTitle(idea.title);
              setCards(idea.cards);
              setImporting(false);
            }}
          />
        )}
      </form>
      <Hint>Registre quantas ideias você leu hoje; não há número certo. O texto dos cards é opcional.</Hint>
    </div>
  );
}

// ---------- 3. IDEA OF THE DAY ----------

export function FocusStep({ bundle, goTo }: StepProps) {
  const { session, ideas } = bundle;
  if (ideas.length === 0) {
    return (
      <EmptyState title="Nenhuma ideia registrada ainda.">
        <Button onClick={() => goTo('read')}>Registrar ideias</Button>
      </EmptyState>
    );
  }
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3">
        <Prompt>Qual ideia merece ser aprofundada hoje?</Prompt>
        <Hint>Escolha a mais útil ou interessante. Só ela recebe o aprofundamento, com todos os seus cards.</Hint>
      </legend>
      {ideas.map(({ idea, cards }) => {
        const selected = idea.id === session.ideaOfDayId;
        return (
          <label
            key={idea.id}
            className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
              selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
            }`}
          >
            <input
              type="radio"
              name="idea-of-day"
              className="mt-1.5 size-4 accent-(--accent)"
              checked={selected}
              onChange={() => attempt(setIdeaOfDay(session.id, idea.id))}
            />
            <span className="flex-1">
              <span className="block font-serif text-lg leading-snug">{idea.title}</span>
              <span className="block text-xs text-muted">{[idea.bookTitle, cardCount(cards.length)].filter(Boolean).join(' · ')}</span>
              {idea.mainIdea && <span className="mt-1 block text-sm text-muted">{idea.mainIdea}</span>}
              {selected && <span className="mt-2 block text-xs font-semibold tracking-wide text-accent">⭐ IDEA OF THE DAY</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

// ---------- 4. CHECK ----------

export function CheckStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, vocab } = bundle;
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  if (!ideaOfDay) return <NeedsIdeaOfDay goTo={goTo} />;
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
      <IdeaHeading item={ideaOfDay} />

      <div className="space-y-3">
        <Prompt>What is the main idea?</Prompt>
        <Hint>Uma frase que resuma a história inteira dos cards, não só o primeiro.</Hint>
        <AutoTextArea
          label="Ideia principal, em uma frase em inglês"
          hideLabel
          value={idea.mainIdea}
          onSave={(mainIdea) => updateIdea(idea.id, { mainIdea })}
          rows={3}
          lang="en"
          placeholder="The main idea is that…"
        />
        <AIFeedbackPanel targetType="mainIdea" targetId={idea.id} text={idea.mainIdea} context={`Ideia: ${idea.title}`} />
      </div>

      {withText.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="min-h-8 cursor-pointer text-sm font-medium">Reler os cards depois de tentar ({withText.length})</summary>
          <ol className="mt-3 space-y-3">
            {withText.map((card) => (
              <li key={card.id} className="border-l-2 border-line pl-3">
                <p className="text-xs font-semibold text-muted">Card {card.position + 1}</p>
                <GlossedParagraph text={card.content} className="whitespace-pre-wrap font-serif leading-loose" />
              </li>
            ))}
          </ol>
        </details>
      )}

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
          <Hint>Só para entender esta ideia. Não entra na revisão; para isso existem os chunks da próxima etapa.</Hint>
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
        Escolha no conjunto das ideias lidas hoje. Prefira expressões reutilizáveis a palavras isoladas. Ex.:{' '}
        <em lang="en">one thing at a time</em>, <em lang="en">in your head</em>, <em lang="en">it turns out that</em>.
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
              label="Frase original (contexto no card)"
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
              Ideia de origem
            </label>
            <select
              id="chunk-source"
              value={sourceId || defaultSource}
              onChange={(e) => setSourceId(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-line bg-paper px-3"
            >
              {!ideaOfDay && <option value="">Sem ideia</option>}
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

// ---------- 6. RETELL ----------

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
  const { session, ideaOfDay, speaking, chunks } = bundle;
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

  if (!ideaOfDay) return <NeedsIdeaOfDay goTo={goTo} />;
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
    `Ideia recontada: "${idea.title}".`,
    idea.mainIdea && `Ideia principal segundo o aluno: ${idea.mainIdea}`,
    chunks.length > 0 &&
      `Expressões que ele está aprendendo e deveria usar na fala: ${chunks.map((c) => c.text).join('; ')}. No comentário, diga quais ele usou e mostre, com uma frase de exemplo, como encaixar as que faltaram.`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-6">
      <IdeaHeading item={ideaOfDay} />
      <div>
        <Prompt>Feche o Deepstash e reconte a ideia em voz alta.</Prompt>
        <Hint>
          Conte a história dos cards do começo ao fim, com as suas palavras. Fase {session.cycleWeek} de 4: {plan.focus} Não reinicie por
          causa de erros.
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
              Tente encaixar cada expressão ao recontar a ideia.
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

// ---------- 7. PERSONALIZE ----------

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

// ---------- 8. REFLECT ----------

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
  if (!ideaOfDay) return <NeedsIdeaOfDay goTo={goTo} />;
  const { idea } = ideaOfDay;
  return (
    <div className="space-y-4">
      <div>
        <Prompt>Do I agree with this idea? Why?</Prompt>
        <Hint>Questione a ideia de “{idea.title}”: concorde, discorde ou qualifique.</Hint>
      </div>
      <AutoTextArea
        label="Em português: o que eu penso sobre essa ideia (rascunho)"
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
        context={`Opinião sobre a ideia "${idea.title}".`}
      />
    </div>
  );
}

// ---------- 9. SO WHAT? ----------

export function SoWhatStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, reflection } = bundle;
  if (!ideaOfDay) return <NeedsIdeaOfDay goTo={goTo} />;
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
        context={`Ação a partir da ideia "${idea.title}".`}
      />
    </div>
  );
}

// ---------- 10. SCHEDULE REVIEW ----------

function inDaysLabel(days: number): string {
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}

export function ScheduleStep({ bundle }: StepProps) {
  const { session, ideas, ideaOfDay, chunks, speaking, reflection } = bundle;
  const upcoming = useLiveQuery(() => getUpcoming(session.date, 30), [session.date, chunks.length]);
  const speakingSec = speaking.reduce((sum, s) => sum + s.durationSec, 0);
  const totalCards = ideas.reduce((sum, i) => sum + i.cards.length, 0);

  const lines: [string, boolean][] = [
    [
      `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} read${totalCards > 0 ? ` (${cardCount(totalCards)})` : ''}`,
      ideas.length > 0,
    ],
    [ideaOfDay ? '1 Idea of the Day' : 'No Idea of the Day', ideaOfDay !== null],
    [`${chunks.length} ${chunks.length === 1 ? 'chunk' : 'chunks'} learned`, chunks.length > 0],
    [`${formatDuration(speakingSec)} speaking`, speakingSec > 0],
    [reflection?.userOpinion.trim() ? '1 reflection' : 'No reflection', Boolean(reflection?.userOpinion.trim())],
    [reflection?.soWhat.trim() ? '1 action' : 'No action', Boolean(reflection?.soWhat.trim())],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <Eyebrow>{session.status === 'completed' ? 'Today completed' : 'Resumo de hoje'}</Eyebrow>
        <ul className="mt-3 space-y-1.5 font-serif text-lg" lang="en">
          {lines.map(([label, done]) => (
            <li key={label} className={done ? '' : 'text-muted'}>
              <span aria-hidden="true">{done ? '✓' : '·'}</span> {label}
            </li>
          ))}
        </ul>
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
