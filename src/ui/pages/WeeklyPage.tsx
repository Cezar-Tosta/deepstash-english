import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDays, formatDate, formatDuration, isISODate, startOfWeek } from '../../domain/dates';
import { countWords } from '../../domain/session';
import { weekStats } from '../../domain/stats';
import type { Chunk } from '../../domain/types';
import { loadStatsInput } from '../../services/library';
import { saveRecording } from '../../services/maintenance';
import { reactivateChunk, retireChunk } from '../../services/reviews';
import { recordSpeaking } from '../../services/sessions';
import {
  finalizeWriting,
  loadWeekBundle,
  saveRecall,
  saveWeeklyReview,
  saveWritingDraft,
  saveWritingRevision,
  TOP_IDEAS,
  type WeekBundle,
  type WeekIdea,
} from '../../services/weekly';
import { AIFeedbackPanel } from '../components/AIFeedbackPanel';
import { SpokenWeek } from '../components/Maintenance';
import { Timer } from '../components/Timer';
import {
  AutoTextArea,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Hint,
  PageTitle,
  Prompt,
  Segmented,
  StarterChips,
} from '../components/ui';
import { useToday } from '../hooks';
import { attempt, showToast } from '../toast';

const WRITING_STARTERS = ['The idea…', 'The main point is…', 'For example…', 'From my perspective…', 'Therefore…'] as const;
const WRITING_MIN = 80;
const WRITING_MAX = 120;

// ---------- 1. Relembrar os Ideas of the Day ----------

function RecallCard({ item, weekStart, saved }: { item: WeekIdea; weekStart: string; saved: string }) {
  const [revealed, setRevealed] = useState(false);
  const { idea, reflection } = item;
  return (
    <Card>
      <p className="text-xs text-muted">{formatDate(idea.date, 'long')}</p>
      <h3 className="mt-1 font-serif text-xl">{idea.title}</h3>
      {idea.bookTitle && <p className="text-sm text-muted">{idea.bookTitle}</p>}
      <div className="mt-3">
        <AutoTextArea
          label="Você consegue lembrar a ideia?"
          value={saved}
          onSave={(text) => saveRecall(weekStart, idea.id, text)}
          rows={2}
          lang="en"
          placeholder="The main idea was…"
        />
      </div>
      {revealed ? (
        <dl className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Main idea</dt>
            <dd className="font-serif text-base" lang="en">{idea.mainIdea || 'Não registrada.'}</dd>
          </div>
          {reflection?.userOpinion && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">My view</dt>
              <dd className="font-serif text-base" lang="en">{reflection.userOpinion}</dd>
            </div>
          )}
          {reflection?.soWhat && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">So what?</dt>
              <dd className="font-serif text-base" lang="en">{reflection.soWhat}</dd>
            </div>
          )}
          <Link to={`/knowledge/idea/${idea.id}`} className="inline-block text-accent underline underline-offset-2">
            Abrir a página da ideia
          </Link>
        </dl>
      ) : (
        <Button small variant="secondary" className="mt-3" onClick={() => setRevealed(true)}>
          Revelar minhas anotações
        </Button>
      )}
    </Card>
  );
}

// ---------- 2. Top 3 ----------

function TopIdeas({ bundle }: { bundle: WeekBundle }) {
  const { review, ideas, weekStart } = bundle;
  const toggle = (ideaId: string) => {
    const selected = review.topIdeaIds.includes(ideaId);
    if (!selected && review.topIdeaIds.length >= TOP_IDEAS) {
      showToast(`Você já escolheu ${TOP_IDEAS}. Desmarque uma para trocar.`);
      return;
    }
    const topIdeaIds = selected ? review.topIdeaIds.filter((id) => id !== ideaId) : [...review.topIdeaIds, ideaId];
    attempt(saveWeeklyReview(weekStart, { topIdeaIds }));
  };

  return (
    <fieldset className="space-y-2">
      <legend className="mb-3">
        <Prompt>Escolha as 3 melhores ideias da semana.</Prompt>
        <Hint>Depois, explique cada uma em voz alta, em inglês.</Hint>
      </legend>
      {ideas.map(({ idea }) => {
        const position = review.topIdeaIds.indexOf(idea.id);
        return (
          <label
            key={idea.id}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2 ${
              position >= 0 ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
            }`}
          >
            <input type="checkbox" className="size-5 accent-(--accent)" checked={position >= 0} onChange={() => toggle(idea.id)} />
            <span className="flex-1 font-serif text-lg">{idea.title}</span>
            {position >= 0 && <span className="text-sm font-semibold text-accent">Top {position + 1}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

// ---------- 3. Vocabulário que ficou ----------

function VocabularyCheck({ chunks, date }: { chunks: Chunk[]; date: string }) {
  if (chunks.length === 0) return <Hint>Nenhum chunk novo nesta semana.</Hint>;
  return (
    <ul className="space-y-2">
      {chunks.map((chunk) => {
        const spontaneous = chunk.status === 'retired' || chunk.status === 'learned';
        return (
          <li key={chunk.id} className="rounded-2xl border border-line bg-surface p-4">
            <p className="font-serif text-lg" lang="en">{chunk.text}</p>
            <div className="mt-2">
              <Segmented
                label={`Situação de ${chunk.text}`}
                value={spontaneous ? 'yes' : 'no'}
                options={[
                  { value: 'no', label: 'Ainda exige revisão' },
                  { value: 'yes', label: 'Já uso espontaneamente' },
                ]}
                onChange={(next) => {
                  if (next === 'yes' && !spontaneous) attempt(retireChunk(chunk.id));
                  if (next === 'no' && spontaneous) attempt(reactivateChunk(chunk.id, date));
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- 4. Speaking semanal ----------

function WeeklySpeaking({ bundle, date }: { bundle: WeekBundle; date: string }) {
  const { review, ideas, weekStart, speaking } = bundle;
  const options = ideas.filter(({ idea }) => review.topIdeaIds.length === 0 || review.topIdeaIds.includes(idea.id));
  const total = speaking.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <div className="space-y-4">
      <div>
        <Prompt>Escolha uma das melhores ideias e fale sem ler.</Prompt>
        <Hint>Compare a fluidez e a capacidade de continuar apesar dos erros.</Hint>
      </div>
      <div>
        <label htmlFor="weekly-topic" className="mb-1.5 block text-sm font-medium">
          Tema escolhido
        </label>
        <select
          id="weekly-topic"
          value={review.speakingIdeaId ?? ''}
          onChange={(e) => attempt(saveWeeklyReview(weekStart, { speakingIdeaId: e.target.value || null }))}
          className="min-h-12 w-full rounded-xl border border-line bg-paper px-3"
        >
          <option value="">Escolha…</option>
          {options.map(({ idea }) => (
            <option key={idea.id} value={idea.id}>
              {idea.title}
            </option>
          ))}
        </select>
      </div>
      <Card>
        <Timer
          minSec={120}
          maxSec={180}
          record
          targetLabel="2–3 minutos sem roteiro"
          onStop={(durationSec, audio) =>
            attempt(
              recordSpeaking({
                kind: 'weekly',
                sessionId: null,
                ideaId: review.speakingIdeaId,
                // Dentro da semana revisada, para a fala contar no balanço dela.
                date: date >= weekStart && date <= addDays(weekStart, 6) ? date : addDays(weekStart, 6),
                durationSec,
                targetSec: 180,
              }).then((id) => (id && audio ? saveRecording(id, audio) : undefined)),
            )
          }
        />
      </Card>
      {total > 0 && <p className="text-sm text-muted">Tempo sem roteiro nesta semana: {formatDuration(total)}.</p>}
      <AutoTextArea label="O que consegui fazer bem" value={review.wentWell} onSave={(wentWell) => saveWeeklyReview(weekStart, { wentWell })} rows={2} />
      <AutoTextArea label="Dificuldade principal" value={review.difficulty} onSave={(difficulty) => saveWeeklyReview(weekStart, { difficulty })} rows={2} />
    </div>
  );
}

// ---------- 5. Weekly writing ----------

function WeeklyWriting({ bundle }: { bundle: WeekBundle }) {
  const { writing, weekStart, ideas } = bundle;
  const [revising, setRevising] = useState(false);
  const text = writing?.text ?? '';
  const words = countWords(text);
  const finalized = Boolean(writing?.finalizedAt);

  return (
    <div className="space-y-4">
      <div>
        <Prompt>Write 80–120 words about one idea from this week.</Prompt>
        <Hint>Escreva a primeira versão de uma vez. A revisão vem depois, não durante.</Hint>
      </div>

      <div>
        <label htmlFor="writing-topic" className="mb-1.5 block text-sm font-medium">
          Ideia escolhida
        </label>
        <select
          id="writing-topic"
          value={writing?.ideaId ?? ''}
          disabled={finalized}
          onChange={(e) => attempt(saveWritingDraft(weekStart, { ideaId: e.target.value || null }))}
          className="min-h-12 w-full rounded-xl border border-line bg-paper px-3 disabled:opacity-60"
        >
          <option value="">Escolha…</option>
          {ideas.map(({ idea }) => (
            <option key={idea.id} value={idea.id}>
              {idea.title}
            </option>
          ))}
        </select>
      </div>

      {!finalized ? (
        <>
          <AutoTextArea
            label="Meu texto"
            value={text}
            onSave={(next) => saveWritingDraft(weekStart, { text: next })}
            rows={9}
            lang="en"
            starters={WRITING_STARTERS}
          />
          <p className="text-sm text-muted" aria-live="polite">
            {words} {words === 1 ? 'palavra' : 'palavras'} salvas · meta {WRITING_MIN}–{WRITING_MAX}
          </p>
          <Button block disabled={!text.trim()} onClick={() => attempt(finalizeWriting(weekStart))}>
            FINALIZAR TEXTO
          </Button>
        </>
      ) : (
        <>
          <StarterChips starters={WRITING_STARTERS} />
          <Card>
            <Eyebrow>Primeira versão · {words} palavras</Eyebrow>
            <p className="mt-2 whitespace-pre-wrap font-serif text-lg leading-relaxed" lang="en">
              {text}
            </p>
          </Card>
          {revising ? (
            <AutoTextArea
              label="Versão revisada (a primeira versão continua guardada)"
              value={writing?.revisedText ?? ''}
              onSave={(revisedText) => saveWritingRevision(weekStart, revisedText)}
              rows={9}
              lang="en"
            />
          ) : (
            <Button block variant="secondary" onClick={() => setRevising(true)}>
              REVISAR
            </Button>
          )}
          {writing && <AIFeedbackPanel targetType="writing" targetId={writing.id} text={text} context="Texto curto semanal de 80 a 120 palavras." />}
        </>
      )}
    </div>
  );
}

// ---------- 6. Balanço ----------

function Balance({ bundle }: { bundle: WeekBundle }) {
  const input = useLiveQuery(loadStatsInput, []);
  if (!input) return null;
  const stats = weekStats(input, bundle.weekStart);
  const rows: [string, string][] = [
    ['Dias estudados', `${stats.studyDays} / 7`],
    ['Ideias lidas', `${stats.ideasRead} (${stats.cardsRead} cards)`],
    ['Ideias aprofundadas', `${stats.ideasStudied} / 7`],
    ['Chunks novos', `${stats.chunksCreated} / 21`],
    ['Tempo total de speaking', `${Math.round(stats.speakingSec / 60)} min`],
  ];
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-3">
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-2 text-sm font-medium">Nota de consistência (1–5)</p>
        <Segmented
          label="Nota de consistência"
          value={String(bundle.review.consistency ?? '')}
          options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))}
          onChange={(n) => attempt(saveWeeklyReview(bundle.weekStart, { consistency: Number(n) }))}
        />
      </div>
      <Hint>O indicador principal é quanto conteúdo você consegue compreender e explicar diretamente em inglês.</Hint>
    </div>
  );
}

function Part({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-line pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {number}. {title}
      </h2>
      {children}
    </section>
  );
}

/** Fechamento da semana: relembrar, escolher o Top 3, falar e escrever. */
export function WeeklyPage() {
  const date = useToday();
  const params = useParams();
  const weekStart = isISODate(params['weekStart']) ? startOfWeek(params['weekStart']) : startOfWeek(date);
  const bundle = useLiveQuery(() => loadWeekBundle(weekStart), [weekStart]);
  if (!bundle) return null;

  const done = Boolean(bundle.review.completedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link to="/progress" className="mb-2 flex min-h-10 items-center text-sm font-medium text-accent">
          ← Progress
        </Link>
        <PageTitle eyebrow="Weekly review" title="Fechamento da semana">
          {formatDate(weekStart, 'short')} a {formatDate(addDays(weekStart, 6), 'short')}
        </PageTitle>
      </div>

      {bundle.ideas.length === 0 ? (
        <EmptyState title="Nenhuma Idea of the Day nesta semana.">
          O fechamento usa as ideias que você aprofundou nas sessões diárias.
        </EmptyState>
      ) : (
        <>
          <Part number={1} title="As Ideas of the Day">
            <Hint>Sem reler primeiro, tente lembrar o ponto central de cada ideia. Depois confira.</Hint>
            {bundle.ideas.map((item) => (
              <RecallCard key={item.idea.id} item={item} weekStart={weekStart} saved={bundle.review.recalls[item.idea.id] ?? ''} />
            ))}
          </Part>
          <Part number={2} title="Top 3 ideas">
            <TopIdeas bundle={bundle} />
          </Part>
          <Part number={3} title="Vocabulário que ficou">
            <Hint>Não mantenha um item em revisão só para completar o calendário.</Hint>
            <VocabularyCheck chunks={bundle.chunks} date={date} />
          </Part>
          <Part number={4} title="Minhas falas da semana">
            <SpokenWeek weekStart={weekStart} />
          </Part>
          <Part number={5} title="Speaking semanal">
            <WeeklySpeaking bundle={bundle} date={date} />
          </Part>
          <Part number={6} title="Weekly writing (opcional)">
            <WeeklyWriting bundle={bundle} />
          </Part>
          <Part number={7} title="Balanço">
            <Balance bundle={bundle} />
          </Part>
          <Button
            block
            variant={done ? 'secondary' : 'primary'}
            onClick={() =>
              attempt(
                saveWeeklyReview(weekStart, { completedAt: done ? null : new Date().toISOString() }).then(() =>
                  showToast(done ? 'Fechamento reaberto.' : 'Semana fechada.'),
                ),
              )
            }
          >
            {done ? 'Semana fechada · reabrir' : 'CONCLUIR FECHAMENTO'}
          </Button>
        </>
      )}
    </div>
  );
}
