import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, formatDate, formatDuration, isWeekend, startOfWeek } from '../../domain/dates';
import { MAX_CHUNKS_PER_DAY, SESSION_DAYS_PER_WEEK } from '../../domain/session';
import { totals, weeklyHistory, type WeekStats, weekStats } from '../../domain/stats';
import { loadStatsInput } from '../../services/library';
import { BarChart, type BarDatum } from '../components/BarChart';
import { ResetWeek } from '../components/Maintenance';
import { Button, Card, Eyebrow, PageTitle } from '../components/ui';
import { useToday } from '../hooks';

const HISTORY_WEEKS = 8;
const minutes = (sec: number): number => Math.round(sec / 60);
const percent = (rate: number | null): string => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

function Tile({ label, value, goal }: { label: string; value: string; goal?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
        {goal && <span className="text-base font-normal text-muted">/{goal}</span>}
      </p>
    </div>
  );
}

function series(history: WeekStats[], pick: (w: WeekStats) => number, unit: string): BarDatum[] {
  return history.map((w) => {
    const value = pick(w);
    const display = unit ? `${value} ${unit}` : String(value);
    return {
      label: formatDate(w.weekStart, 'short'),
      value,
      display,
      description: `Semana de ${formatDate(w.weekStart, 'medium')}: ${display}`,
    };
  });
}

export function ProgressPage() {
  const date = useToday();
  const thisWeek = startOfWeek(date);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const input = useLiveQuery(loadStatsInput, []);
  if (!input) return null;

  const week = weekStats(input, weekStart);
  const history = weeklyHistory(input, thisWeek, HISTORY_WEEKS);
  const all = totals(input);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <PageTitle eyebrow="Progress" title="Sua semana">
        A meta é consistência, não perfeição.
      </PageTitle>

      <div className="col-span-full flex items-center justify-between gap-2">
        <Button small variant="secondary" aria-label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ←
        </Button>
        <p className="text-sm font-medium">
          {formatDate(weekStart, 'short')} a {formatDate(addDays(weekStart, 6), 'short')}
          {weekStart === thisWeek && ' · esta semana'}
        </p>
        <Button small variant="secondary" aria-label="Próxima semana" disabled={weekStart >= thisWeek} onClick={() => setWeekStart(addDays(weekStart, 7))}>
          →
        </Button>
      </div>

      <div className="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Ideas read" value={String(week.ideasRead)} />
        <Tile label="Ideas studied" value={String(week.ideasStudied)} goal={String(SESSION_DAYS_PER_WEEK)} />
        <Tile label="Chunks" value={String(week.chunksCreated)} goal={String(MAX_CHUNKS_PER_DAY * SESSION_DAYS_PER_WEEK)} />
        <Tile label="Reviews" value={String(week.reviewsDone)} />
        <Tile label="Speaking (min:s)" value={formatDuration(week.speakingSec)} />
        <Tile label="Session days" value={String(week.sessionDays)} goal={String(SESSION_DAYS_PER_WEEK)} />
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Controle da semana</Eyebrow>
          <Link to={`/weekly/${weekStart}`} className="text-sm font-medium text-accent">
            Weekly review →
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {week.days.map((d) => (
            <li key={d.date} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium capitalize">
                  {formatDate(d.date, 'weekday').replace('.', '')}{' '}
                  <span className="font-normal text-muted">{formatDate(d.date, 'short')}</span>
                </p>
                <p className="text-sm text-muted">
                  {d.studied
                    ? [
                        d.ideas > 0 && `${d.ideas} ${d.ideas === 1 ? 'ideia' : 'ideias'}`,
                        d.cards > 0 && `${d.cards} ${d.cards === 1 ? 'card' : 'cards'}`,
                        d.speakingSec > 0 && formatDuration(d.speakingSec),
                        d.reviews > 0 && `${d.reviews} rev.`,
                        d.sessionCompleted && '✓',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : d.date > date
                      ? ''
                      : isWeekend(d.date)
                        ? 'só revisões'
                        : 'sem estudo'}
                </p>
              </div>
              {d.ideaOfDayTitle && <p className="font-serif text-sm">⭐ {d.ideaOfDayTitle}</p>}
              {d.chunks.length > 0 && (
                <p className="font-serif text-sm text-muted" lang="en">
                  {d.chunks.join(' • ')}
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-line pt-3">
          <ResetWeek weekStart={weekStart} />
        </div>
      </Card>

      <Card>
        <Eyebrow>Desde o início</Eyebrow>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {(
            [
              ['Ideias lidas', all.ideasRead],
              ['Cards lidos', all.cardsRead],
              ['Ideias aprofundadas', all.ideasStudied],
              ['Chunks criados', all.chunksCreated],
              ['Chunks aprendidos', all.chunksLearned],
              ['Revisões concluídas', all.reviewsDone],
              ['Taxa de recuperação', percent(all.recallRate)],
              ['Tempo de speaking (min:s)', formatDuration(all.speakingSec)],
              ['Dias estudados', all.studyDays],
              ['Semanas completas', all.completeWeeks],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="col-span-full space-y-3">
        <Eyebrow>Evolução · últimas {HISTORY_WEEKS} semanas</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <BarChart title="Ideias lidas por semana" data={series(history, (w) => w.ideasRead, '')} />
          <BarChart title="Chunks novos por semana" data={series(history, (w) => w.chunksCreated, '')} />
          <BarChart title="Revisões concluídas por semana" data={series(history, (w) => w.reviewsDone, '')} />
          <BarChart title="Minutos de speaking por semana" data={series(history, (w) => minutes(w.speakingSec), 'min')} />
          <BarChart title="Dias estudados por semana" data={series(history, (w) => w.studyDays, '')} />
        </div>
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="min-h-8 cursor-pointer text-sm font-medium">Ver como tabela</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1 text-left font-medium">Semana</th>
                  <th scope="col" className="px-2 font-medium">Ideias</th>
                  <th scope="col" className="px-2 font-medium">Chunks</th>
                  <th scope="col" className="px-2 font-medium">Revisões</th>
                  <th scope="col" className="px-2 font-medium">Speaking</th>
                  <th scope="col" className="pl-2 font-medium">Dias</th>
                </tr>
              </thead>
              <tbody>
                {history.map((w) => (
                  <tr key={w.weekStart} className="border-t border-line">
                    <th scope="row" className="py-1.5 text-left font-normal">{formatDate(w.weekStart, 'short')}</th>
                    <td className="px-2">{w.ideasRead}</td>
                    <td className="px-2">{w.chunksCreated}</td>
                    <td className="px-2">{w.reviewsDone}</td>
                    <td className="px-2">{minutes(w.speakingSec)} min</td>
                    <td className="pl-2">{w.studyDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

    </div>
  );
}
