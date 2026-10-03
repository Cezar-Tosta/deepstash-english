import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate } from '../../domain/dates';
import { getUpcoming } from '../../services/reviews';
import { ReviewFlow } from '../components/ReviewFlow';
import { Card, Eyebrow, PageTitle } from '../components/ui';
import { useToday } from '../hooks';

export function ReviewPage() {
  const date = useToday();
  const upcoming = useLiveQuery(() => getUpcoming(date, 30), [date]);

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Review" title="Revisões de hoje">
        Primeiro tente lembrar. A resposta só aparece depois.
      </PageTitle>

      <ReviewFlow date={date} />

      {upcoming && upcoming.length > 0 && (
        <Card>
          <Eyebrow>Próximas revisões</Eyebrow>
          <ul className="mt-3 divide-y divide-line">
            {upcoming.slice(0, 8).map((u) => (
              <li key={u.date} className="flex justify-between py-2">
                <span>
                  {u.inDays === 1 ? 'Amanhã' : `Em ${u.inDays} dias`}
                  <span className="text-muted"> · {formatDate(u.date, 'short')}</span>
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
