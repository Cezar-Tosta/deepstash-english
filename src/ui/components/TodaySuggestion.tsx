import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import type { ISODate } from '../../domain/types';
import { getCycleInfo } from '../../services/cycles';
import { loadSuggestion } from '../../services/study';
import { Card, Eyebrow } from './ui';

/** O plano do dia: o que fazer agora, em ordem, com o tempo de cada coisa. */
export function TodaySuggestion({ date }: { date: ISODate }) {
  const plan = useLiveQuery(() => loadSuggestion(date), [date]);
  const info = useLiveQuery(() => getCycleInfo(date), [date]);
  if (!plan || !info) return null;
  const total = plan.reduce((sum, s) => sum + s.minutes, 0);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Eyebrow>Sugestão para hoje</Eyebrow>
        {plan.length > 0 && <span className="text-xs font-semibold text-accent">~{total} min no total</span>}
      </div>
      {plan.length === 0 ? (
        <p className="mt-2 text-sm">
          {info.rest
            ? 'Dia de revisão sem revisões agendadas. Descanse; o próximo ciclo começa quando você fizer a próxima sessão.'
            : info.period
              ? 'Tudo em dia. Se quiser ir além, abra uma ideia em Knowledge e releia os cards clicando nas palavras.'
              : 'Nenhum ciclo em andamento e nada pendente. O próximo ciclo de 7 dias começa quando você fizer a próxima sessão.'}
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {plan.map((item, i) => (
            <li key={item.id}>
              <Link to={item.to} className="flex gap-3 py-2.5 hover:bg-sunken">
                <span className="w-5 shrink-0 text-right font-semibold text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-xs text-muted">~{item.minutes} min</span>
                  </span>
                  <span className="block text-sm text-muted">{item.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
