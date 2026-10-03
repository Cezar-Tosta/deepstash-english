import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { formatDate, formatDuration, nowISO, today } from '../../domain/dates';
import { recordSpeaking } from '../../services/sessions';
import { getBook, saveBookNote } from '../../services/study';
import { AIFeedbackPanel } from '../components/AIFeedbackPanel';
import { Timer } from '../components/Timer';
import { AutoTextArea, Button, Card, EmptyState, Eyebrow, Hint, Prompt } from '../components/ui';
import { attempt, showToast } from '../toast';

/** Um livro: suas ideias na ordem de leitura e o fechamento ao terminar. */
export function BookPage() {
  const key = decodeURIComponent(useParams()['key'] ?? '');
  const detail = useLiveQuery(() => getBook(key), [key]);
  const spoken = useLiveQuery(
    async () => (await db.speaking.toArray()).filter((s) => s.kind === 'book' && s.bookKey === key),
    [key],
  );

  if (detail === undefined) return null;

  const back = (
    <Link to="/knowledge" className="mb-4 flex min-h-10 items-center text-sm font-medium text-accent">
      ← Livros
    </Link>
  );
  if (detail === null) {
    return (
      <div>
        {back}
        <EmptyState title="Livro não encontrado." />
      </div>
    );
  }

  const { book, note, studiedIdeaIds } = detail;
  const finished = Boolean(note?.finishedAt);
  const spokenSec = (spoken ?? []).reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <div className="space-y-8">
      <header>
        {back}
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Livro</p>
        <h1 className="mt-1 font-serif text-3xl leading-tight">{book.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {book.ideas.length} {book.ideas.length === 1 ? 'ideia' : 'ideias'} · {book.cardCount}{' '}
          {book.cardCount === 1 ? 'card' : 'cards'} · {studiedIdeaIds.size > 0 && `${book.ideas.filter((i) => studiedIdeaIds.has(i.id)).length} aprofundadas · `}
          {formatDate(book.firstDate, 'short')} a {formatDate(book.lastDate, 'medium')}
          {finished && ' · concluído'}
        </p>
      </header>

      <section className="space-y-3">
        <Eyebrow>Ideias do livro</Eyebrow>
        <ol className="space-y-3">
          {book.ideas.map((idea, i) => (
            <li key={idea.id}>
              <Link to={`/knowledge/idea/${idea.id}`} className="block rounded-2xl border border-line bg-surface p-5 hover:bg-sunken">
                <p className="text-xs text-muted">
                  Ideia {i + 1} · {formatDate(idea.date, 'medium')}
                  {studiedIdeaIds.has(idea.id) && ' · ⭐ Idea of the Day'}
                </p>
                <p className="mt-1 font-serif text-lg leading-snug">{idea.title}</p>
                {idea.mainIdea && <p className="mt-1 text-sm text-muted">{idea.mainIdea}</p>}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-line pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          Fechamento do livro
        </h2>
        <div>
          <Prompt>Explain this book in two minutes.</Prompt>
          <Hint>Sem reler: qual é a tese do livro e quais ideias a sustentam? Fale como se explicasse a um amigo.</Hint>
        </div>
        <Card>
          <Timer
            minSec={120}
            maxSec={180}
            targetLabel="2–3 minutos sem roteiro"
            onStop={(durationSec) =>
              attempt(
                recordSpeaking({
                  kind: 'book',
                  sessionId: null,
                  ideaId: null,
                  bookKey: key,
                  date: today(),
                  durationSec,
                  targetSec: 180,
                }).then((id) => {
                  if (id) showToast(`Fala registrada: ${formatDuration(durationSec)}`);
                }),
              )
            }
          />
        </Card>
        {spokenSec > 0 && <p className="text-sm text-muted">Tempo explicando este livro: {formatDuration(spokenSec)}.</p>}

        <div>
          <AutoTextArea
            label="What stays with me from this book?"
            value={note?.takeaway ?? ''}
            onSave={(takeaway) => saveBookNote(key, book.title, { takeaway })}
            rows={5}
            lang="en"
            starters={['The main message of this book is', 'The idea I will keep is', 'I changed my mind about', 'I disagree with']}
          />
          <AIFeedbackPanel targetType="bookTakeaway" targetId={key} text={note?.takeaway ?? ''} context={`Resumo pessoal do livro "${book.title}".`} />
        </div>

        <Button
          variant={finished ? 'secondary' : 'primary'}
          onClick={() => attempt(saveBookNote(key, book.title, { finishedAt: finished ? null : nowISO() }))}
        >
          {finished ? 'Livro concluído · reabrir' : 'Marcar livro como concluído'}
        </Button>
      </section>
    </div>
  );
}
