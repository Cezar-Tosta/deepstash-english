import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, formatDuration } from '../../domain/dates';
import { bookKey } from '../../domain/books';
import { getIdeaDetail } from '../../services/library';
import { getNeighbors } from '../../services/study';
import { FOLLOW_UP_LABEL } from '../components/ActionFollowUp';
import { IdeaDictionary } from '../components/DictionaryItems';
import { IdeaChat } from '../components/IdeaChat';
import { IdeaVerbs } from '../components/IdeaVerbs';
import { Reader } from '../components/Reader';
import { ChunkItem } from '../components/ChunkItem';
import { EmptyState, Eyebrow } from '../components/ui';
import { useToday } from '../hooks';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <Eyebrow>{title}</Eyebrow>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const none = <p className="text-muted">Não registrado.</p>;

/** Página própria de uma ideia: os cards em sequência e tudo o que foi produzido a partir dela. */
export function IdeaDetailPage() {
  const { ideaId = '' } = useParams();
  const date = useToday();
  const detail = useLiveQuery(() => getIdeaDetail(ideaId), [ideaId]);
  const neighbors = useLiveQuery(async () => (detail ? getNeighbors(detail.idea) : null), [detail?.idea.id]);

  if (detail === undefined) return null;

  const back = (
    <Link to="/knowledge" className="mb-4 flex min-h-10 items-center text-sm font-medium text-accent">
      ← My Knowledge
    </Link>
  );
  if (detail === null) {
    return (
      <div>
        {back}
        <EmptyState title="Ideia não encontrada." />
      </div>
    );
  }

  const { idea, cards, session, isIdeaOfDay, vocab, chunks, speaking, reflection } = detail;
  const speakingSec = speaking.reduce((sum, s) => sum + s.durationSec, 0);
  const withText = cards.filter((c) => c.content.trim());

  return (
    <article className="space-y-5">
      <header>
        {back}
        <p className="text-sm text-muted">
          {formatDate(idea.date, 'long')}
          {idea.category && ` · ${idea.category}`}
          {session && ` · semana ${session.cycleWeek} do ciclo ${session.cycleNumber}`}
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight">{idea.title}</h1>
        {idea.bookTitle && (
          <p className="mt-1 text-muted">
            do livro{' '}
            <Link to={`/knowledge/book/${encodeURIComponent(bookKey(idea.bookTitle))}`} className="text-accent underline underline-offset-2">
              {idea.bookTitle}
            </Link>
          </p>
        )}
        {isIdeaOfDay && <p className="mt-2 text-xs font-semibold tracking-wide text-accent">⭐ IDEA OF THE DAY</p>}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section title={`Cards da ideia (${cards.length})`}>
        {withText.length === 0 ? (
          <p className="text-muted">
            {cards.length === 0 ? 'Nenhum card registrado.' : 'O texto dos cards não foi registrado.'}
          </p>
        ) : (
          <Reader ideaId={idea.id} cards={withText} />
        )}
      </Section>

      <div className="space-y-5">
      <Section title="Main idea">
        {idea.mainIdea ? <p className="font-serif text-lg" lang="en">{idea.mainIdea}</p> : none}
      </Section>

      <Section title="Dicionário desta ideia">
        {vocab.length === 0 ? (
          none
        ) : (
          <IdeaDictionary entries={vocab} />
        )}
        {session?.misunderstood && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted">
            <span className="font-semibold">O que entendi errado ou não sabia:</span> {session.misunderstood}
          </p>
        )}
      </Section>

      {isIdeaOfDay && (
        <>

          <Section title="Chunks, my sentences and review history">
            {chunks.length === 0 ? (
              none
            ) : (
              <ul className="space-y-3">
                {chunks.map((item) => (
                  <ChunkItem key={item.chunk.id} item={item} date={date} linkToIdea={false} />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Retell">
            {speaking.length === 0 ? (
              none
            ) : (
              <p>
                {speaking.length} {speaking.length === 1 ? 'fala' : 'falas'} · {formatDuration(speakingSec)} no total
              </p>
            )}
            {speaking
              .filter((s) => s.transcript)
              .map((s) => (
                <p key={s.id} className="mt-2 whitespace-pre-wrap border-l-2 border-line pl-3 font-serif" lang="en">
                  {s.transcript}
                </p>
              ))}
            {session?.retellNotes && (
              <p className="mt-2 whitespace-pre-wrap font-serif text-muted" lang="en">
                {session.retellNotes}
              </p>
            )}
          </Section>

          <Section title="My view">
            {reflection?.userOpinion ? (
              <p className="whitespace-pre-wrap font-serif text-lg" lang="en">{reflection.userOpinion}</p>
            ) : (
              none
            )}
          </Section>

          <Section title="So what?">
            {reflection?.soWhat ? (
              <p className="whitespace-pre-wrap font-serif text-lg" lang="en">{reflection.soWhat}</p>
            ) : (
              none
            )}
          </Section>
        </>
      )}

      {reflection?.followUpStatus && (
        <Section title="Did I do it?">
          <p className="font-medium" lang="en">{FOLLOW_UP_LABEL[reflection.followUpStatus]}</p>
          {reflection.followUp && (
            <p className="mt-1 whitespace-pre-wrap font-serif text-lg" lang="en">{reflection.followUp}</p>
          )}
        </Section>
      )}

      </div>
      </div>

      <IdeaVerbs key={`verbs-${idea.id}`} ideaId={idea.id} hasText={withText.length > 0} />

      <IdeaChat key={idea.id} ideaId={idea.id} />

      {(neighbors?.prev || neighbors?.next) && (
        <nav aria-label="Ideias do mesmo livro" className="flex justify-between gap-3 border-t border-line pt-4 text-sm">
          {neighbors.prev ? (
            <Link to={`/knowledge/idea/${neighbors.prev.id}`} className="text-accent">
              ← {neighbors.prev.title}
            </Link>
          ) : (
            <span />
          )}
          {neighbors.next && (
            <Link to={`/knowledge/idea/${neighbors.next.id}`} className="text-right text-accent">
              {neighbors.next.title} →
            </Link>
          )}
        </nav>
      )}

      {idea.notes && (
        <Section title="Observações">
          <p className="whitespace-pre-wrap">{idea.notes}</p>
        </Section>
      )}
    </article>
  );
}
