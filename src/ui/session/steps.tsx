import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useState } from 'react';
import { weekPlan } from '../../domain/cycle';
import { formatDate, formatDuration } from '../../domain/dates';
import { CARD_GOAL, looksLikeSingleWord, MAX_CHUNKS_PER_DAY } from '../../domain/session';
import { scheduler } from '../../domain/srs';
import type { SourceCard, StepId } from '../../domain/types';
import { ChunkLimitError } from '../../services/errors';
import { getUpcoming } from '../../services/reviews';
import {
  addCard,
  addChunk,
  addVocab,
  type ChunkInput,
  deleteCard,
  deleteChunk,
  deleteVocab,
  recordSpeaking,
  replaceChunk,
  saveReflection,
  type SessionBundle,
  setCardOfDay,
  updateCard,
  updateChunk,
  updateSessionNotes,
} from '../../services/sessions';
import { AIFeedbackPanel } from '../components/AIFeedbackPanel';
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
  TextArea,
  TextInput,
} from '../components/ui';
import { attempt, showToast } from '../toast';

export interface StepProps {
  bundle: SessionBundle;
  goTo: (step: StepId) => void;
}

function NeedsCardOfDay({ goTo }: Pick<StepProps, 'goTo'>) {
  return (
    <EmptyState title="Nenhum Card of the Day escolhido.">
      <p className="mb-4">Esta etapa aprofunda um único card. Escolha qual merece isso hoje.</p>
      <Button onClick={() => goTo('focus')}>Escolher o card</Button>
    </EmptyState>
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

function CardEditor({ card, isCardOfDay }: { card: SourceCard; isCardOfDay: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-lg leading-snug">{card.title}</h3>
        {isCardOfDay && <Badge tone="accent">⭐ Card of the Day</Badge>}
      </div>
      <div className="mt-3">
        <AutoTextArea
          label="What is the main idea?"
          value={card.mainIdea}
          onSave={(mainIdea) => updateCard(card.id, { mainIdea })}
          rows={2}
          lang="en"
          placeholder="Uma frase curta, em inglês simples."
        />
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mt-3 min-h-10 text-sm font-medium text-accent"
      >
        {open ? 'Ocultar detalhes' : 'Texto, tema e observações'}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <AutoTextArea
            label="Texto do card"
            value={card.content}
            onSave={(content) => updateCard(card.id, { content })}
            rows={4}
            lang="en"
            placeholder="Cole aqui o texto do card, se quiser guardá-lo."
          />
          <AutoTextArea
            label="Tema / categoria"
            value={card.category}
            onSave={(category) => updateCard(card.id, { category })}
            rows={1}
          />
          <AutoTextArea
            label="Observações"
            value={card.notes}
            onSave={(notes) => updateCard(card.id, { notes })}
            rows={2}
          />
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Apagar este card?</span>
              <Button small variant="danger" onClick={() => attempt(deleteCard(card.id))}>
                Apagar
              </Button>
              <Button small variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button small variant="danger" onClick={() => setConfirming(true)}>
              Apagar card
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function ReadStep({ bundle }: StepProps) {
  const [title, setTitle] = useState('');
  const { session, cards } = bundle;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    attempt(addCard(session.id, { title }).then(() => setTitle('')));
  };

  return (
    <div className="space-y-4">
      <Notice>
        Leia todos em inglês antes de traduzir. Para cada um, pergunte: <em>“What is the main idea?”</em> Não pare em
        toda palavra desconhecida.
      </Notice>

      <div className="flex items-baseline justify-between">
        <Eyebrow>Cards de hoje</Eyebrow>
        <p className="text-sm text-muted">
          {cards.length}/{CARD_GOAL}
        </p>
      </div>

      {cards.map((card) => (
        <CardEditor key={card.id} card={card} isCardOfDay={card.id === session.cardOfDayId} />
      ))}

      <form onSubmit={submit} className="flex items-end gap-2">
        <TextInput
          className="flex-1"
          label={cards.length === 0 ? 'Título do primeiro card' : 'Título do próximo card'}
          value={title}
          onChange={setTitle}
          lang="en"
          placeholder="Thought Into Action"
          autoComplete="off"
        />
        <Button type="submit" disabled={!title.trim()}>
          Adicionar
        </Button>
      </form>
      {cards.length >= CARD_GOAL ? (
        <Hint>Meta de {CARD_GOAL} cards atingida. Pode seguir.</Hint>
      ) : (
        <Hint>{CARD_GOAL} é uma meta, não uma regra. Siga quando tiver lido o que conseguiu hoje.</Hint>
      )}
    </div>
  );
}

// ---------- 3. CARD OF THE DAY ----------

export function FocusStep({ bundle, goTo }: StepProps) {
  const { session, cards } = bundle;
  if (cards.length === 0) {
    return (
      <EmptyState title="Nenhum card registrado ainda.">
        <Button onClick={() => goTo('read')}>Registrar cards</Button>
      </EmptyState>
    );
  }
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3">
        <Prompt>Qual ideia merece ser aprofundada hoje?</Prompt>
        <Hint>Escolha o card mais útil ou interessante. Só ele recebe o aprofundamento.</Hint>
      </legend>
      {cards.map((card) => {
        const selected = card.id === session.cardOfDayId;
        return (
          <label
            key={card.id}
            className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
              selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
            }`}
          >
            <input
              type="radio"
              name="card-of-day"
              className="mt-1.5 size-4 accent-(--accent)"
              checked={selected}
              onChange={() => attempt(setCardOfDay(session.id, card.id))}
            />
            <span className="flex-1">
              <span className="block font-serif text-lg leading-snug">{card.title}</span>
              {card.mainIdea && <span className="mt-1 block text-sm text-muted">{card.mainIdea}</span>}
              {selected && <span className="mt-2 block text-xs font-semibold tracking-wide text-accent">⭐ CARD OF THE DAY</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

// ---------- 4. CHECK ----------

export function CheckStep({ bundle, goTo }: StepProps) {
  const { session, cardOfDay, vocab } = bundle;
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  if (!cardOfDay) return <NeedsCardOfDay goTo={goTo} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    attempt(
      addVocab(session.id, cardOfDay.id, term, meaning).then(() => {
        setTerm('');
        setMeaning('');
      }),
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>⭐ Card of the Day</Eyebrow>
        <h3 className="mt-1 font-serif text-xl">{cardOfDay.title}</h3>
      </div>

      <div className="space-y-3">
        <Prompt>What is the main idea?</Prompt>
        <AutoTextArea
          label="Ideia principal, em uma frase em inglês"
          hideLabel
          value={cardOfDay.mainIdea}
          onSave={(mainIdea) => updateCard(cardOfDay.id, { mainIdea })}
          rows={3}
          lang="en"
          placeholder="The main idea is that…"
        />
        <AIFeedbackPanel targetType="mainIdea" targetId={cardOfDay.id} text={cardOfDay.mainIdea} context={`Card: ${cardOfDay.title}`} />
      </div>

      <Notice>
        Só agora consulte tradução ou dicionário e compare com a sua primeira interpretação.{' '}
        {weekPlan(session.cycleWeek).translation}
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
          <Hint>Só para entender este card. Não entra na revisão; para isso existem os chunks da próxima etapa.</Hint>
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
  const { session, cards, chunks, cardOfDay } = bundle;
  const [text, setText] = useState('');
  const [meaning, setMeaning] = useState('');
  const [original, setOriginal] = useState('');
  const [sourceId, setSourceId] = useState('');
  /** Chunk que ficou de fora por causa do limite, esperando o usuário escolher qual trocar. */
  const [overflow, setOverflow] = useState<ChunkInput | null>(null);

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
      sourceCardId: sourceId || cardOfDay?.id || null,
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
        Prefira expressões reutilizáveis a palavras isoladas. Ex.: <em lang="en">one thing at a time</em>,{' '}
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
        {cards.length > 1 && (
          <div>
            <label htmlFor="chunk-source" className="mb-1.5 block text-sm font-medium">
              Card de origem
            </label>
            <select
              id="chunk-source"
              value={sourceId || cardOfDay?.id || ''}
              onChange={(e) => setSourceId(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-line bg-paper px-3"
            >
              {!cardOfDay && <option value="">Sem card</option>}
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
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
          <p className="font-medium">
            Você já selecionou três expressões hoje. Escolha quais realmente merecem entrar na revisão.
          </p>
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
  'One interesting point is…',
  'I think this is important because…',
  'In my experience…',
  'For example…',
  'However…',
  'In other words…',
  'From my perspective…',
] as const;

export function RetellStep({ bundle, goTo }: StepProps) {
  const { session, cardOfDay, speaking } = bundle;
  if (!cardOfDay) return <NeedsCardOfDay goTo={goTo} />;
  const plan = weekPlan(session.cycleWeek);
  const total = speaking.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <div className="space-y-6">
      <div>
        <Prompt>Feche o card e explique a ideia em voz alta.</Prompt>
        <Hint>
          Semana {session.cycleWeek}: {plan.focus} Não reinicie por causa de erros.
        </Hint>
      </div>

      <StarterChips starters={RETELL_PROMPTS} />

      <AutoTextArea
        label="Palavras de apoio (só palavras-chave, não um roteiro)"
        value={session.retellNotes}
        onSave={(retellNotes) => updateSessionNotes(session.id, { retellNotes })}
        rows={2}
        lang="en"
      />

      <Card>
        <Timer
          minSec={plan.speakingMinSec}
          maxSec={plan.speakingMaxSec}
          targetLabel={plan.speakingLabel}
          onStop={(durationSec) => {
            if (durationSec < 1) return;
            attempt(
              recordSpeaking({
                kind: 'daily',
                sessionId: session.id,
                cardId: cardOfDay.id,
                date: session.date,
                durationSec,
                targetSec: plan.speakingMaxSec,
              }).then(() => showToast(`Fala registrada: ${formatDuration(durationSec)}`)),
            );
          }}
        />
      </Card>

      {speaking.length > 0 && (
        <p className="text-sm text-muted" aria-live="polite">
          {speaking.length === 1 ? '1 fala registrada hoje' : `${speaking.length} falas registradas hoje`} ·{' '}
          {formatDuration(total)} no total.
        </p>
      )}
    </div>
  );
}

// ---------- 7. PERSONALIZE ----------

export function PersonalizeStep({ bundle, goTo }: StepProps) {
  const { chunks } = bundle;
  if (chunks.length === 0) {
    return (
      <EmptyState title="Nenhum chunk selecionado hoje.">
        <Button onClick={() => goTo('mine')}>Escolher chunks</Button>
      </EmptyState>
    );
  }
  return (
    <div className="space-y-5">
      <div>
        <Prompt>Create your own sentence.</Prompt>
        <Hint>Relacione a frase ao seu trabalho, estudo, rotina ou experiência.</Hint>
      </div>
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
    </div>
  );
}

// ---------- 8. REFLECT ----------

const REFLECT_STARTERS = [
  'I agree because',
  'I disagree because',
  'I partly agree because',
  'However,',
  'It depends on',
  'In my experience,',
] as const;

export function ReflectStep({ bundle, goTo }: StepProps) {
  const { session, cardOfDay, reflection } = bundle;
  if (!cardOfDay) return <NeedsCardOfDay goTo={goTo} />;
  return (
    <div className="space-y-4">
      <div>
        <Prompt>Do I agree with this idea? Why?</Prompt>
        <Hint>Questione a ideia de “{cardOfDay.title}”: concorde, discorde ou qualifique.</Hint>
      </div>
      <AutoTextArea
        label="My view"
        value={reflection?.userOpinion ?? ''}
        onSave={(userOpinion) => saveReflection(session.id, cardOfDay.id, { userOpinion })}
        rows={5}
        lang="en"
        starters={REFLECT_STARTERS}
      />
      <AIFeedbackPanel targetType="opinion" targetId={cardOfDay.id} text={reflection?.userOpinion ?? ''} context={`Opinião sobre o card "${cardOfDay.title}".`} />
    </div>
  );
}

// ---------- 9. SO WHAT? ----------

export function SoWhatStep({ bundle, goTo }: StepProps) {
  const { session, cardOfDay, reflection } = bundle;
  if (!cardOfDay) return <NeedsCardOfDay goTo={goTo} />;
  return (
    <div className="space-y-4">
      <div>
        <Prompt>What will I do differently because I learned this?</Prompt>
        <Hint>Information → Reflection → Action. Uma ação concreta, começando por “I’ll…”.</Hint>
      </div>
      <AutoTextArea
        label="So what?"
        value={reflection?.soWhat ?? ''}
        onSave={(soWhat) => saveReflection(session.id, cardOfDay.id, { soWhat })}
        rows={3}
        lang="en"
        placeholder="I’ll…"
      />
      <AIFeedbackPanel targetType="soWhat" targetId={cardOfDay.id} text={reflection?.soWhat ?? ''} context={`Ação a partir do card "${cardOfDay.title}".`} />
    </div>
  );
}

// ---------- 10. SCHEDULE REVIEW ----------

function inDaysLabel(days: number): string {
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}

export function ScheduleStep({ bundle }: StepProps) {
  const { session, cards, cardOfDay, chunks, speaking, reflection } = bundle;
  const upcoming = useLiveQuery(() => getUpcoming(session.date, 30), [session.date, chunks.length]);
  const speakingSec = speaking.reduce((sum, s) => sum + s.durationSec, 0);

  const lines: [string, boolean][] = [
    [`${cards.length} ${cards.length === 1 ? 'card read' : 'cards read'}`, cards.length > 0],
    [cardOfDay ? '1 Card of the Day' : 'No Card of the Day', cardOfDay !== null],
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
