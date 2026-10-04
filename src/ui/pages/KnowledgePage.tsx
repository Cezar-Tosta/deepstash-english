import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ChunkFilter } from '../../domain/chunks';
import { formatDate } from '../../domain/dates';
import { searchChunks, searchIdeas } from '../../services/library';
import { listBooks, searchDictionary } from '../../services/study';
import { ChunkItem } from '../components/ChunkItem';
import { DictionaryRow } from '../components/DictionaryItems';
import { ListenSettings } from '../components/Listen';
import { Collapsible, EmptyState, PageTitle, Segmented, TextInput, useShowMore } from '../components/ui';
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

/** Quantos itens de uma lista longa aparecem de cada vez. */
const PAGE = 60;

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
      <ul className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {shown?.map((book) => (
          <li key={book.key}>
            <Link
              to={`/knowledge/book/${encodeURIComponent(book.key)}`}
              className="block rounded-xl border border-line bg-surface px-3 py-2.5 hover:bg-sunken"
            >
              <p className="font-serif text-lg leading-snug break-words">{book.title}</p>
              <p className="mt-0.5 text-xs text-muted">
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

const NO_BOOK = 'Sem livro';

/** As ideias agrupadas por livro: cada livro é uma seção que abre e fecha. */
function IdeaList({ query }: { query: string }) {
  const [onlyIdeaOfDay, setOnlyIdeaOfDay] = useState(false);
  const items = useLiveQuery(() => searchIdeas(query, onlyIdeaOfDay), [query, onlyIdeaOfDay]);
  const searching = query.trim() !== '';

  const groups = new Map<string, NonNullable<typeof items>>();
  for (const item of items ?? []) {
    const book = item.idea.bookTitle.trim() || NO_BOOK;
    groups.set(book, [...(groups.get(book) ?? []), item]);
  }

  return (
    <div className="space-y-3">
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
      <div className="grid grid-cols-1 items-start gap-2 lg:grid-cols-2">
        {[...groups].map(([book, ideas], i) => (
          // Na busca, tudo abre; fora dela, só o livro mais recente.
          <Collapsible key={`${book}-${searching}`} title={book} count={ideas.length} defaultOpen={searching || i === 0}>
            <ul className="-mx-2 divide-y divide-line">
              {ideas.map(({ idea, isIdeaOfDay, cardCount, chunks }) => (
                <li key={idea.id}>
                  <Link
                    to={`/knowledge/idea/${idea.id}`}
                    className="flex min-h-10 items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-sunken"
                  >
                    <span className="min-w-0">
                      <span className="font-serif leading-snug break-words">
                        {isIdeaOfDay && <span title="Idea of the Day">⭐ </span>}
                        {idea.title}
                      </span>
                      {chunks.length > 0 && (
                        <span className="block truncate font-serif text-xs text-muted" lang="en">
                          {chunks.join(' • ')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {formatDate(idea.date, 'short')} · {count(cardCount, 'card', 'cards')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

function ChunkList({ query }: { query: string }) {
  const date = useToday();
  const [filter, setFilter] = useState<ChunkFilter>('all');
  const items = useLiveQuery(() => searchChunks(query, filter, date), [query, filter, date]);
  const [shown, more] = useShowMore(items ?? [], PAGE);

  return (
    <div className="space-y-3">
      <Segmented label="Filtrar chunks" value={filter} options={FILTERS} onChange={setFilter} />
      {items?.length === 0 && (
        <EmptyState title={query || filter !== 'all' ? 'Nada encontrado.' : 'Nenhuma expressão ainda.'}>
          {query || filter !== 'all' ? 'Mude o filtro ou a busca.' : 'Os chunks que você escolher nas sessões aparecem aqui.'}
        </EmptyState>
      )}
      {items && items.length > 0 && (
        <p className="text-xs text-muted">
          {count(items.length, 'expressão', 'expressões')}. Clique em uma para ver frases, revisões e ações.
        </p>
      )}
      <ul className="grid grid-cols-1 items-start gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((item) => (
          <ChunkItem key={item.chunk.id} item={item} date={date} />
        ))}
      </ul>
      {more}
    </div>
  );
}

function DictionaryList({ query }: { query: string }) {
  const items = useLiveQuery(() => searchDictionary(query), [query]);
  const [shown, more] = useShowMore(items ?? [], PAGE);
  return (
    <div className="space-y-3">
      {items?.length === 0 && (
        <EmptyState title={query ? 'Nada encontrado.' : 'Seu dicionário está vazio.'}>
          {!query && 'Abra uma ideia, clique numa palavra do card e adicione o significado.'}
        </EmptyState>
      )}
      {items && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-xs text-muted">
            {count(items.length, 'termo', 'termos')}, em ordem alfabética. Clique em um para ver a frase, a explicação e excluir.
          </p>
          <ListenSettings />
        </div>
      )}
      <ul className="grid grid-cols-1 items-start gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map(({ entry, idea }) => (
          <DictionaryRow
            key={entry.id}
            entry={entry}
            footer={
              idea && (
                <p className="text-xs text-muted">
                  <Link to={`/knowledge/idea/${idea.id}`} className="underline underline-offset-2">
                    {idea.title}
                  </Link>
                  {idea.bookTitle && ` · ${idea.bookTitle}`}
                </p>
              )
            }
          />
        ))}
      </ul>
      {more}
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
