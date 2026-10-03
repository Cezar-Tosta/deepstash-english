import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ChunkFilter } from '../../domain/chunks';
import { formatDate } from '../../domain/dates';
import { searchChunks, searchIdeas } from '../../services/library';
import { listBooks, searchDictionary } from '../../services/study';
import { ChunkItem } from '../components/ChunkItem';
import { DeleteEntry } from '../components/DictionaryItems';
import { RichText } from '../components/RichText';
import { ListenButton, ListenSettings } from '../components/Listen';
import { EmptyState, PageTitle, Segmented, TextInput } from '../components/ui';
import { useToday } from '../hooks';

type Tab = 'books' | 'ideas' | 'english' | 'dictionary';

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'books', label: 'Livros' },
  { value: 'ideas', label: 'Ideias' },
  { value: 'english', label: 'My English' },
  { value: 'dictionary', label: 'Dicionário' },
];

const SEARCH: Record<Tab, string> = {
  books: 'Pesquisar livro…',
  ideas: 'Título, livro, tema, palavra dos cards, chunk ou data…',
  english: 'Pesquisar expressão…',
  dictionary: 'Pesquisar palavra ou significado…',
};

const FILTERS: readonly { value: ChunkFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'due', label: 'Due' },
  { value: 'learned', label: 'Learned' },
  { value: 'difficult', label: 'Difficult' },
];

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Livro → ideias → cards: a entrada principal da biblioteca. */
function BookList({ query }: { query: string }) {
  const books = useLiveQuery(listBooks, []);
  const q = query.trim().toLowerCase();
  const shown = books?.filter((b) => !q || b.title.toLowerCase().includes(q));

  return (
    <div className="space-y-3">
      {shown?.length === 0 && (
        <EmptyState title={q ? 'Nenhum livro encontrado.' : 'Nenhum livro ainda.'}>
          {!q && 'Os livros aparecem aqui conforme você registra as ideias lidas em cada sessão.'}
        </EmptyState>
      )}
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {shown?.map((book) => (
          <li key={book.key}>
            <Link
              to={`/knowledge/book/${encodeURIComponent(book.key)}`}
              className="block rounded-2xl border border-line bg-surface p-4 hover:bg-sunken"
            >
              <p className="font-serif text-xl leading-snug">{book.title}</p>
              <p className="mt-1 text-sm text-muted">
                {count(book.ideas.length, 'ideia', 'ideias')} · {count(book.cardCount, 'card', 'cards')} ·{' '}
                {book.firstDate === book.lastDate
                  ? formatDate(book.firstDate, 'medium')
                  : `${formatDate(book.firstDate, 'short')} a ${formatDate(book.lastDate, 'medium')}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdeaList({ query }: { query: string }) {
  const [onlyIdeaOfDay, setOnlyIdeaOfDay] = useState(false);
  const items = useLiveQuery(() => searchIdeas(query, onlyIdeaOfDay), [query, onlyIdeaOfDay]);

  return (
    <div className="space-y-4">
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-(--accent)"
          checked={onlyIdeaOfDay}
          onChange={(e) => setOnlyIdeaOfDay(e.target.checked)}
        />
        Mostrar só as Ideas of the Day
      </label>
      {items?.length === 0 && (
        <EmptyState title={query ? 'Nada encontrado.' : 'Nenhuma ideia ainda.'}>
          {query ? 'Tente outra palavra, livro, tema ou data.' : 'As ideias registradas nas sessões aparecem aqui.'}
        </EmptyState>
      )}
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {items?.map(({ idea, isIdeaOfDay, cardCount, chunks }) => (
          <li key={idea.id}>
            <Link to={`/knowledge/idea/${idea.id}`} className="block rounded-2xl border border-line bg-surface p-4 hover:bg-sunken">
              <p className="text-xs text-muted">
                {formatDate(idea.date, 'medium')}
                {idea.bookTitle && ` · ${idea.bookTitle}`}
                {` · ${count(cardCount, 'card', 'cards')}`}
                {isIdeaOfDay && ' · ⭐ Idea of the Day'}
              </p>
              <p className="mt-1 font-serif text-lg leading-snug">{idea.title}</p>
              {idea.mainIdea && <p className="mt-1 text-sm text-muted">{idea.mainIdea}</p>}
              {chunks.length > 0 && (
                <p className="mt-2 font-serif text-sm" lang="en">
                  {chunks.join(' • ')}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChunkList({ query }: { query: string }) {
  const date = useToday();
  const [filter, setFilter] = useState<ChunkFilter>('all');
  const items = useLiveQuery(() => searchChunks(query, filter, date), [query, filter, date]);

  return (
    <div className="space-y-4">
      <Segmented label="Filtrar chunks" value={filter} options={FILTERS} onChange={setFilter} />
      {items?.length === 0 && (
        <EmptyState title={query || filter !== 'all' ? 'Nada encontrado.' : 'Nenhuma expressão ainda.'}>
          {query || filter !== 'all' ? 'Mude o filtro ou a busca.' : 'Os chunks que você escolher nas sessões aparecem aqui.'}
        </EmptyState>
      )}
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {items?.map((item) => (
          <ChunkItem key={item.chunk.id} item={item} date={date} />
        ))}
      </ul>
    </div>
  );
}

function DictionaryList({ query }: { query: string }) {
  const items = useLiveQuery(() => searchDictionary(query), [query]);
  return (
    <div className="space-y-3">
      {items?.length === 0 && (
        <EmptyState title={query ? 'Nada encontrado.' : 'Seu dicionário está vazio.'}>
          {!query && 'Abra uma ideia, clique numa palavra do card e adicione o significado.'}
        </EmptyState>
      )}
      {items && items.length > 0 && <ListenSettings />}
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {items?.map(({ entry, idea }) => (
          <li key={entry.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <p>
                <span className="font-serif text-lg" lang="en">
                  {entry.term}
                </span>
                {entry.phonetic && <span className="ml-2 text-xs text-muted">{entry.phonetic}</span>}
                {entry.meaning && <span className="text-muted"> — {entry.meaning}</span>}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <ListenButton text={entry.context ? `${entry.term}. ${entry.context}` : entry.term} />
                <DeleteEntry entry={entry} />
              </div>
            </div>
            {entry.context && (
              <p className="mt-1 font-serif text-muted" lang="en">
                “{entry.context}”
              </p>
            )}
            {entry.explanation && <RichText text={entry.explanation} className="mt-1 text-sm" />}
            {idea && (
              <p className="mt-2 text-xs text-muted">
                <Link to={`/knowledge/idea/${idea.id}`} className="underline underline-offset-2">
                  {idea.title}
                </Link>
                {idea.bookTitle && ` · ${idea.bookTitle}`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = TABS.some((t) => t.value === requested) ? (requested as Tab) : 'books';
  const [query, setQuery] = useState('');

  return (
    <div className="space-y-3">
      <PageTitle eyebrow="Knowledge" title="Biblioteca" />
      <Segmented
        label="Biblioteca"
        value={tab}
        options={TABS}
        onChange={(next) => {
          setQuery('');
          setParams(next === 'books' ? {} : { tab: next }, { replace: true });
        }}
      />
      <TextInput type="search" label={SEARCH[tab]} hideLabel placeholder={SEARCH[tab]} value={query} onChange={setQuery} />
      {tab === 'books' && <BookList query={query} />}
      {tab === 'ideas' && <IdeaList query={query} />}
      {tab === 'english' && <ChunkList query={query} />}
      {tab === 'dictionary' && <DictionaryList query={query} />}
    </div>
  );
}
