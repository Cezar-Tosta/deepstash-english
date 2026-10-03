import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ChunkFilter } from '../../domain/chunks';
import { formatDate } from '../../domain/dates';
import { searchCards, searchChunks } from '../../services/library';
import { ChunkItem } from '../components/ChunkItem';
import { EmptyState, PageTitle, Segmented, TextInput } from '../components/ui';
import { useToday } from '../hooks';

type Tab = 'knowledge' | 'english';

const TABS = [
  { value: 'knowledge', label: 'My Knowledge' },
  { value: 'english', label: 'My English' },
] as const;

const FILTERS: readonly { value: ChunkFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'due', label: 'Due' },
  { value: 'learned', label: 'Learned' },
  { value: 'difficult', label: 'Difficult' },
];

function CardList({ query }: { query: string }) {
  const [onlyCardOfDay, setOnlyCardOfDay] = useState(true);
  const items = useLiveQuery(() => searchCards(query, onlyCardOfDay), [query, onlyCardOfDay]);

  return (
    <div className="space-y-4">
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-(--accent)"
          checked={onlyCardOfDay}
          onChange={(e) => setOnlyCardOfDay(e.target.checked)}
        />
        Mostrar só os Cards of the Day
      </label>
      {items?.length === 0 && (
        <EmptyState title={query ? 'Nada encontrado.' : 'Sua biblioteca ainda está vazia.'}>
          {query ? 'Tente outra palavra, tema ou data.' : 'Os cards aprofundados aparecem aqui depois da primeira sessão.'}
        </EmptyState>
      )}
      <ul className="space-y-3">
        {items?.map(({ card, isCardOfDay, chunks }) => (
          <li key={card.id}>
            <Link to={`/knowledge/card/${card.id}`} className="block rounded-2xl border border-line bg-surface p-5 hover:bg-sunken">
              <p className="text-xs text-muted">
                {formatDate(card.date, 'medium')}
                {card.category && ` · ${card.category}`}
                {isCardOfDay && ' · ⭐ Card of the Day'}
              </p>
              <p className="mt-1 font-serif text-lg leading-snug">{card.title}</p>
              {card.mainIdea && <p className="mt-1 text-sm text-muted">{card.mainIdea}</p>}
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
      <ul className="space-y-3">
        {items?.map((item) => (
          <ChunkItem key={item.chunk.id} item={item} date={date} />
        ))}
      </ul>
    </div>
  );
}

export function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'english' ? 'english' : 'knowledge';
  const [query, setQuery] = useState('');

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Knowledge" title={tab === 'english' ? 'My English' : 'My Knowledge'} />
      <Segmented
        label="Biblioteca"
        value={tab}
        options={TABS}
        onChange={(next) => setParams(next === 'english' ? { tab: 'english' } : {}, { replace: true })}
      />
      <TextInput
        type="search"
        label={tab === 'english' ? 'Pesquisar expressão' : 'Pesquisar por título, tema, palavra, chunk ou data'}
        hideLabel
        placeholder={tab === 'english' ? 'Pesquisar expressão…' : 'Título, tema, palavra, chunk ou data…'}
        value={query}
        onChange={setQuery}
      />
      {tab === 'english' ? <ChunkList query={query} /> : <CardList query={query} />}
    </div>
  );
}
