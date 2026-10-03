import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { overdueDays } from '../../domain/chunks';
import { formatDate } from '../../domain/dates';
import { scheduler } from '../../domain/srs';
import type { ISODate, Rating } from '../../domain/types';
import { type DueItem, getDueItems, rateChunk } from '../../services/reviews';
import { attempt } from '../toast';
import { Badge, Button, Card, EmptyState, Eyebrow, Hint, TextArea } from './ui';

const RATINGS: { rating: Rating; label: string; hint: string }[] = [
  { rating: 'AGAIN', label: 'NÃO LEMBREI', hint: 'volta amanhã' },
  { rating: 'HARD', label: 'DIFÍCIL', hint: 'intervalo menor' },
  { rating: 'GOOD', label: 'LEMBREI', hint: 'segue o calendário' },
  { rating: 'EASY', label: 'MUITO FÁCIL', hint: 'intervalo maior' },
];

function ReviewCard({ item, date, remaining }: { item: DueItem; date: ISODate; remaining: number }) {
  const [revealed, setRevealed] = useState(false);
  const [sentence, setSentence] = useState('');
  const { chunk, sourceCard, lastReviewSentence } = item;
  const late = overdueDays(chunk, date);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>
          {scheduler.stageLabel(chunk.stage)} · {remaining} {remaining === 1 ? 'restante' : 'restantes'}
        </Eyebrow>
        {late > 0 && <Badge tone="warn">atrasada {late} {late === 1 ? 'dia' : 'dias'}</Badge>}
      </div>

      <p className="my-8 text-center font-serif text-3xl leading-tight" lang="en">
        {chunk.text}
      </p>

      {!revealed ? (
        <div className="space-y-4">
          <p className="text-center text-muted">Você lembra dessa expressão?</p>
          <TextArea
            label="Crie uma frase usando essa expressão (opcional)"
            value={sentence}
            onChange={setSentence}
            rows={2}
            lang="en"
          />
          <Button block onClick={() => setRevealed(true)}>
            REVELAR
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <dl className="space-y-3 text-sm">
            <Detail label="Significado" value={chunk.meaning} empty="Você não anotou o significado." />
            <Detail label="Frase original" value={chunk.originalSentence} serif />
            <Detail label="Frase que você criou" value={lastReviewSentence || chunk.userSentence} serif />
            {sentence.trim() && <Detail label="Sua frase de agora" value={sentence} serif />}
            <Detail
              label="Card de origem"
              value={sourceCard ? `${sourceCard.title} · ${formatDate(chunk.createdDate, 'medium')}` : ''}
            />
          </dl>
          <div>
            <p className="mb-2 text-sm font-medium">Como foi a recuperação?</p>
            <div className="grid grid-cols-2 gap-2">
              {RATINGS.map(({ rating, label, hint }) => (
                <Button
                  key={rating}
                  variant={rating === 'GOOD' ? 'primary' : 'secondary'}
                  className="flex-col gap-0 py-2"
                  onClick={() => attempt(rateChunk(chunk.id, rating, sentence, date))}
                >
                  <span>{label}</span>
                  <span className="text-xs font-normal opacity-75">{hint}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Detail({ label, value, serif, empty }: { label: string; value: string; serif?: boolean; empty?: string }) {
  if (!value && !empty) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={value ? (serif ? 'font-serif text-base' : 'text-base') : 'text-muted'}>{value || empty}</dd>
    </div>
  );
}

/** Fila de revisões do dia: primeiro o estímulo, só depois a resposta e a avaliação. */
export function ReviewFlow({ date }: { date: ISODate }) {
  const items = useLiveQuery(() => getDueItems(date), [date]);
  if (!items) return null;

  const current = items[0];
  if (!current) {
    return (
      <EmptyState title="Nenhuma revisão pendente.">
        <Hint>As expressões voltam em D1, D3, D7, D14 e D30.</Hint>
      </EmptyState>
    );
  }
  // A key reinicia o cartão (resposta escondida, campo vazio) a cada nova expressão.
  return <ReviewCard key={`${current.chunk.id}-${current.chunk.stage}-${current.chunk.nextReviewDate}`} item={current} date={date} remaining={items.length} />;
}
