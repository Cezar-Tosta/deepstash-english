import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { formatDate } from '../../domain/dates';
import { CYCLE_SESSION_DAYS, type Period, periodDates } from '../../domain/periods';
import { cycleDayNames } from '../../domain/session';
import type { ISODate } from '../../domain/types';

/** Os dias do ciclo em andamento, com a data de cada um: quais são de sessão, quais de revisão e onde está hoje. */
export function CycleStrip({ period, date }: { period: Period; date: ISODate }) {
  const done = useLiveQuery(
    async () => new Set((await db.sessions.where('date').between(period.start, period.end, true, true).toArray()).map((s) => s.date)),
    [period.start, period.end],
  );
  const days = periodDates(period);
  const names = cycleDayNames(days);

  return (
    <section aria-label="Dias do ciclo" className="col-span-full rounded-2xl border border-line bg-surface p-3">
      <ol className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day, i) => {
          const rest = i >= CYCLE_SESSION_DAYS;
          const current = day === date;
          return (
            <li
              key={day}
              aria-current={current ? 'date' : undefined}
              className={`min-w-0 overflow-hidden rounded-lg border px-0.5 py-1.5 text-center sm:px-1 ${
                current ? 'border-accent bg-accent-soft' : rest ? 'border-line bg-sunken' : 'border-line'
              }`}
            >
              <span className="block text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                <span className="hidden sm:inline">Dia </span>
                {i + 1}
              </span>
              <span
                className={`block text-xs whitespace-nowrap capitalize sm:text-sm ${current ? 'font-semibold text-accent' : 'font-medium'}`}
              >
                {formatDate(day, 'weekday').replace('.', '')}
              </span>
              <span className="block text-xs whitespace-nowrap text-muted tabular-nums">
                <span className="sm:hidden">{day.slice(8)}</span>
                <span className="hidden sm:inline">{formatDate(day, 'short')}</span>
              </span>
              <span className="block text-[10px] whitespace-nowrap text-muted">
                <span className="hidden sm:inline">{rest ? 'revisão' : 'sessão'}</span>
                <span className="sm:hidden" title={rest ? 'revisão' : 'sessão'}>
                  {rest ? 'rev.' : 'ses.'}
                </span>
                {done?.has(day) && <span className="text-good"> ✓</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted">
        Sessão nos dias 1 a {Math.min(CYCLE_SESSION_DAYS, days.length)}
        {names.session && ` (${names.session})`}
        {names.rest && ` · só revisão nos dias 6 e 7 (${names.rest})`}
        {names.closing && ` · fechamento no dia 5 (${names.closing})`}.
      </p>
    </section>
  );
}
