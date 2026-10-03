import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, formatDuration } from '../../domain/dates';
import { getCardDetail } from '../../services/library';
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

/** Página própria de um card: tudo o que foi lido, produzido e revisado a partir dele. */
export function CardDetailPage() {
  const { cardId = '' } = useParams();
  const date = useToday();
  const detail = useLiveQuery(() => getCardDetail(cardId), [cardId]);

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
        <EmptyState title="Card não encontrado." />
      </div>
    );
  }

  const { card, session, isCardOfDay, vocab, chunks, speaking, reflection } = detail;
  const speakingSec = speaking.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <article className="space-y-7">
      <header>
        {back}
        <p className="text-sm text-muted">
          {formatDate(card.date, 'long')}
          {card.category && ` · ${card.category}`}
          {session && ` · semana ${session.cycleWeek} do ciclo ${session.cycleNumber}`}
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight">{card.title}</h1>
        {isCardOfDay && <p className="mt-2 text-xs font-semibold tracking-wide text-accent">⭐ CARD OF THE DAY</p>}
      </header>

      {card.content && (
        <Section title="Texto original">
          <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed" lang="en">
            {card.content}
          </p>
        </Section>
      )}

      <Section title="Main idea">
        {card.mainIdea ? <p className="font-serif text-lg" lang="en">{card.mainIdea}</p> : none}
      </Section>

      {isCardOfDay && (
        <>
          <Section title="Vocabulary for comprehension">
            {vocab.length === 0 ? (
              none
            ) : (
              <ul className="space-y-1">
                {vocab.map((v) => (
                  <li key={v.id}>
                    <span className="font-serif" lang="en">{v.term}</span>
                    {v.meaning && <span className="text-muted"> — {v.meaning}</span>}
                  </li>
                ))}
              </ul>
            )}
            {session?.misunderstood && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted">
                <span className="font-semibold">O que entendi errado ou não sabia:</span> {session.misunderstood}
              </p>
            )}
          </Section>

          <Section title="Chunks, my sentences and review history">
            {chunks.length === 0 ? (
              none
            ) : (
              <ul className="space-y-3">
                {chunks.map((item) => (
                  <ChunkItem key={item.chunk.id} item={item} date={date} linkToCard={false} />
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

      {card.notes && (
        <Section title="Observações">
          <p className="whitespace-pre-wrap">{card.notes}</p>
        </Section>
      )}
    </article>
  );
}
