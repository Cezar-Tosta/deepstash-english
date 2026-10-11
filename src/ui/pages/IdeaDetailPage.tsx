import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, formatDuration } from '../../domain/dates';
import { bookKey } from '../../domain/books';
import { getIdeaDetail } from '../../services/library';
import { getNeighbors } from '../../services/study';
import { FOLLOW_UP_LABEL } from '../components/ActionFollowUp';
import { Correction } from '../components/Correction';
import { IdeaDictionary } from '../components/DictionaryItems';
import { IdeaChat } from '../components/IdeaChat';
import { IdeaVerbs } from '../components/IdeaVerbs';
import { Reader } from '../components/Reader';
import { ChunkItem } from '../components/ChunkItem';
import { Collapsible, EmptyState, Eyebrow } from '../components/ui';
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

/** Página própria de um texto: os parágrafos em sequência e tudo o que foi produzido a partir dele. */
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
        <EmptyState title="Texto não encontrado." />
      </div>
    );
  }

  const { idea, cards, session, isIdeaOfDay, vocab, chunks, speaking, reflection } = detail;
  const retells = speaking.filter((s) => s.kind === 'daily');
  const aloud = speaking.filter((s) => s.kind === 'aloud');
  const speakingSec = retells.reduce((sum, s) => sum + s.durationSec, 0);
  const aloudSec = aloud.reduce((sum, s) => sum + s.durationSec, 0);
  const withText = cards.filter((c) => c.content.trim());
  const transcripts = retells.filter((s) => s.transcript);

  return (
    <article className="space-y-5">
      <header>
        {back}
        <p className="text-sm text-muted">
          {formatDate(idea.date, 'long')}
          {idea.category && ` · ${idea.category}`}
          {session && ` · fase ${session.cycleWeek} de 4`}
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight">{idea.title}</h1>
        {idea.bookTitle && (
          <p className="mt-1 text-muted">
            fonte:{' '}
            <Link
              to={`/knowledge/book/${encodeURIComponent(bookKey(idea.bookTitle))}`}
              className="text-accent underline underline-offset-2"
            >
              {idea.bookTitle}
            </Link>
          </p>
        )}
        {isIdeaOfDay && <p className="mt-2 text-xs font-semibold tracking-wide text-accent">ESTUDADO EM SESSÃO</p>}
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title={`Texto · ${cards.length} ${cards.length === 1 ? 'parágrafo' : 'parágrafos'}`}>
          {withText.length === 0 ? (
            <p className="text-muted">Nenhum parágrafo registrado.</p>
          ) : (
            <Reader ideaId={idea.id} cards={withText} />
          )}
        </Section>

        <div className="space-y-5">
          <Section title="Main idea">
            {idea.mainIdea ? (
              <>
                <p className="font-serif text-lg" lang="en">
                  {idea.mainIdea}
                </p>
                <Correction targetType="mainIdea" targetId={idea.id} text={idea.mainIdea} context={`Texto: ${idea.title}`} withComment />
              </>
            ) : (
              none
            )}
          </Section>

          <Collapsible title="Dicionário deste texto" count={vocab.length} defaultOpen>
            {vocab.length === 0 ? none : <IdeaDictionary entries={vocab} />}
            {session?.misunderstood && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted">
                <span className="font-semibold">O que entendi errado ou não sabia:</span> {session.misunderstood}
              </p>
            )}
          </Collapsible>

          {isIdeaOfDay && (
            <>
              <Collapsible title="Chunks, my sentences and review history" count={chunks.length} defaultOpen>
                {chunks.length === 0 ? (
                  none
                ) : (
                  <ul className="space-y-1.5">
                    {chunks.map((item) => (
                      <ChunkItem key={item.chunk.id} item={item} date={date} linkToIdea={false} />
                    ))}
                  </ul>
                )}
              </Collapsible>

              <Collapsible
                title="Retell"
                summary={
                  retells.length === 0
                    ? 'Não registrado.'
                    : `${retells.length} ${retells.length === 1 ? 'fala' : 'falas'} · ${formatDuration(speakingSec)} no total`
                }
              >
                {transcripts.length === 0 && !session?.retellNotes && <p className="text-sm text-muted">Sem transcrição nem anotações.</p>}
                {transcripts.map((s) => (
                  <div key={s.id} className="mb-3">
                    <p className="whitespace-pre-wrap border-l-2 border-line pl-3 font-serif" lang="en">
                      {s.transcript}
                    </p>
                    <Correction
                      targetType="retell"
                      targetId={s.id}
                      text={s.transcript ?? ''}
                      context={`Texto recontado: "${idea.title}".`}
                      withComment
                    />
                  </div>
                ))}
                {session?.retellNotes && (
                  <p className="whitespace-pre-wrap font-serif text-muted" lang="en">
                    {session.retellNotes}
                  </p>
                )}
              </Collapsible>

              {aloud.length > 0 && (
                <Section title="Read aloud">
                  <p className="text-sm text-muted">
                    {aloud.length} {aloud.length === 1 ? 'leitura' : 'leituras'} em voz alta · {formatDuration(aloudSec)} no total
                  </p>
                </Section>
              )}

              {session?.listenGist && (
                <Section title="Listening">
                  <p className="whitespace-pre-wrap text-sm">{session.listenGist}</p>
                </Section>
              )}

              <Section title="My view">
                {reflection?.userOpinion ? (
                  <>
                    <p className="whitespace-pre-wrap font-serif text-lg" lang="en">
                      {reflection.userOpinion}
                    </p>
                    <Correction
                      targetType="opinion"
                      targetId={idea.id}
                      text={reflection.userOpinion}
                      context={`Opinião sobre o texto "${idea.title}".`}
                      withComment
                    />
                  </>
                ) : (
                  none
                )}
              </Section>

              <Section title="So what?">
                {reflection?.soWhat ? (
                  <>
                    <p className="whitespace-pre-wrap font-serif text-lg" lang="en">
                      {reflection.soWhat}
                    </p>
                    <Correction
                      targetType="soWhat"
                      targetId={idea.id}
                      text={reflection.soWhat}
                      context={`Ação a partir do texto "${idea.title}".`}
                      withComment
                    />
                  </>
                ) : (
                  none
                )}
              </Section>
            </>
          )}

          {reflection?.followUpStatus && (
            <Section title="Did I do it?">
              <p className="font-medium" lang="en">
                {FOLLOW_UP_LABEL[reflection.followUpStatus]}
              </p>
              {reflection.followUp && (
                <p className="mt-1 whitespace-pre-wrap font-serif text-lg" lang="en">
                  {reflection.followUp}
                </p>
              )}
            </Section>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <IdeaVerbs key={`verbs-${idea.id}`} ideaId={idea.id} hasText={withText.length > 0} />
        <IdeaChat key={idea.id} ideaId={idea.id} />
      </div>

      {(neighbors?.prev || neighbors?.next) && (
        <nav aria-label="Textos da mesma fonte" className="flex justify-between gap-3 border-t border-line pt-4 text-sm">
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
