import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useState } from 'react';
import { weekPlan } from '../../domain/cycle';
import { formatDate } from '../../domain/dates';
import { CYCLE_DAYS, CYCLE_SESSION_DAYS, type Period, periodDates, periodOf, PHASES } from '../../domain/periods';
import type { ISODate } from '../../domain/types';
import { getCycleInfo, listCycles, removeCycle, restartPhases, startCycle } from '../../services/cycles';
import { errorMessage } from '../../services/errors';
import { attempt, showToast } from '../toast';
import { Button, Card, Collapsible, Eyebrow, Hint, TextInput } from './ui';

const weekday = (date: ISODate): string => formatDate(date, 'weekday').replace('.', '').replace(/^./u, (c) => c.toUpperCase());
const range = (p: Period): string =>
  `${weekday(p.start)} ${formatDate(p.start, 'short')} a ${weekday(p.end)} ${formatDate(p.end, 'short')}`;

function CycleRow({ period, current }: { period: Period; current: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const days = periodDates(period).length;
  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm">
          <span className="text-muted tabular-nums">{period.index + 1}.</span> {range(period)}
          {current && <span className="font-semibold text-accent"> · em andamento</span>}
          {days < CYCLE_DAYS && <span className="text-muted"> · {days} dias (o seguinte começou antes)</span>}
        </p>
        {!confirming && (
          <button
            type="button"
            aria-label={`Remover o ciclo de ${formatDate(period.start, 'short')}`}
            onClick={() => setConfirming(true)}
            className="min-h-8 text-xs font-medium text-muted hover:text-danger"
          >
            Remover
          </button>
        )}
      </div>
      {confirming && (
        <div role="alert" className="mt-1 rounded-lg bg-sunken p-2 text-sm">
          <p>
            Remover este ciclo da lista? Os estudos desses dias não são apagados, mas deixam de aparecer no histórico, que é organizado por
            ciclo.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              small
              variant="danger"
              onClick={() => attempt(removeCycle(period.start).then(() => showToast('Ciclo removido da lista.')))}
            >
              Remover ciclo
            </Button>
            <Button small variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Ciclos de 7 dias: o usuário escolhe em que data cada um começa. Os 5 primeiros dias
 * são de sessão e os 2 últimos, de revisão. O histórico é contado por ciclo; os dias
 * entre um ciclo e outro ficam fora dele.
 */
export function CycleSection({ date }: { date: ISODate }) {
  const cycles = useLiveQuery(listCycles, []);
  const info = useLiveQuery(() => getCycleInfo(date), [date]);
  const [start, setStart] = useState(date);
  const [error, setError] = useState('');
  const [confirmPhases, setConfirmPhases] = useState(false);
  if (!cycles || !info) return null;

  const plan = weekPlan(info.week);
  const starts = cycles.map((c) => c.start);
  const clash = start ? periodOf(starts, start) : null;
  const exists = starts.includes(start);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!start || exists) return;
    setError('');
    startCycle(start)
      .then(() => showToast(`Ciclo iniciado em ${formatDate(start, 'medium')}.`))
      .catch((err: unknown) => setError(errorMessage(err)));
  };

  return (
    <Card>
      <Eyebrow>Ciclos de 7 dias</Eyebrow>
      <p className="mt-2">
        {info.period ? (
          <>
            Ciclo em andamento: {range(info.period)} · dia {info.day} de {CYCLE_DAYS}
            {info.rest && ' (revisão)'}
          </>
        ) : info.reference ? (
          <>Nenhum ciclo em andamento. O último terminou em {formatDate(info.reference.end, 'medium')}.</>
        ) : (
          'Nenhum ciclo ainda. O primeiro começa na sua primeira sessão, ou na data que você escolher abaixo.'
        )}
      </p>
      <div className="mt-1">
        <Hint>
          Cada ciclo tem {CYCLE_SESSION_DAYS} dias de sessão e 2 de revisão, a partir da data de início. O histórico (Progress e fechamento)
          é contado por ciclo: os dias entre o fim de um ciclo e o começo do próximo não entram.
        </Hint>
      </div>

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <TextInput className="min-w-0 flex-1" type="date" label="Início do próximo ciclo" value={start} onChange={setStart} />
        <Button type="submit" variant="secondary" disabled={!start || exists}>
          Iniciar ciclo nesta data
        </Button>
      </form>
      {exists ? (
        <p className="mt-2 text-sm text-muted">Já existe um ciclo começando nesta data.</p>
      ) : (
        clash && (
          <p className="mt-2 text-sm text-warn">
            Esta data cai dentro do ciclo de {formatDate(clash.start, 'short')} a {formatDate(clash.end, 'short')}. Se você iniciar outro
            aqui, aquele passa a terminar na véspera.
          </p>
        )
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {cycles.length > 0 && (
        <Collapsible className="mt-3" title="Ciclos registrados" count={cycles.length}>
          <ul className="divide-y divide-line">
            {cycles.toReversed().map((period) => (
              <CycleRow key={period.start} period={period} current={period.start === info.period?.start} />
            ))}
          </ul>
        </Collapsible>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-sm">
          <span className="font-medium">
            Fase {info.week} de {PHASES}
          </span>{' '}
          <span className="text-muted">
            · {plan.focus} Speaking {plan.speakingLabel}. {plan.translation}
          </span>
        </p>
        <div className="mt-1">
          <Hint>A fase sobe a cada ciclo e volta à 1 depois da 4.</Hint>
        </div>
        <div className="mt-2">
          {confirmPhases ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Voltar para a fase 1 a partir deste ciclo? O histórico é mantido.</span>
              <Button
                small
                onClick={() =>
                  attempt(
                    restartPhases(date).then(() => {
                      setConfirmPhases(false);
                      showToast('Fases reiniciadas. Vale para as próximas sessões.');
                    }),
                  )
                }
              >
                Reiniciar
              </Button>
              <Button small variant="ghost" onClick={() => setConfirmPhases(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button small variant="secondary" onClick={() => setConfirmPhases(true)}>
              Voltar para a fase 1
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
