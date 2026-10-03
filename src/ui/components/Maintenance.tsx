import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { addDays, formatDate, formatDuration, today } from '../../domain/dates';
import { ROUTINE, STEPS } from '../../domain/session';
import type { ISODate } from '../../domain/types';
import {
  deleteRecordingsBefore,
  listWeekSpeaking,
  recordingsUsage,
  resetAll,
  resetWeek,
  type SpokenItem,
  weekContents,
} from '../../services/maintenance';
import { attempt, showToast } from '../toast';
import { ListenSettings, RecordingPlayer } from './Listen';
import { Button, Card, Eyebrow, Hint } from './ui';

// ---------- Resetar uma semana ----------

/** Apaga os estudos de uma semana para refazê-la. Mostra o que será apagado antes de confirmar. */
export function ResetWeek({ weekStart }: { weekStart: ISODate }) {
  const [confirming, setConfirming] = useState(false);
  const contents = useLiveQuery(() => weekContents(weekStart), [weekStart]);
  const empty = !contents || contents.sessions + contents.speaking === 0;

  // Trocar de semana cancela um pedido de confirmação que era da semana anterior.
  useEffect(() => setConfirming(false), [weekStart]);

  if (empty) return null;

  if (!confirming) {
    return (
      <Button small variant="danger" onClick={() => setConfirming(true)}>
        Resetar esta semana
      </Button>
    );
  }
  return (
    <div role="alert" className="rounded-xl bg-sunken p-3 text-sm">
      <p className="font-medium text-danger">
        Apagar a semana de {formatDate(weekStart, 'short')} a {formatDate(addDays(weekStart, 6), 'short')}?
      </p>
      <p className="mt-1">
        Serão apagados {contents.sessions} {contents.sessions === 1 ? 'sessão' : 'sessões'}, {contents.ideas}{' '}
        {contents.ideas === 1 ? 'ideia' : 'ideias'} com seus cards e dicionário, {contents.chunks}{' '}
        {contents.chunks === 1 ? 'chunk' : 'chunks'} com o histórico de revisão, {contents.speaking}{' '}
        {contents.speaking === 1 ? 'fala' : 'falas'}, reflexões e o fechamento da semana. Não dá para desfazer.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          small
          variant="danger"
          onClick={() =>
            attempt(
              resetWeek(weekStart).then(() => {
                setConfirming(false);
                showToast('Semana resetada. Você pode estudá-la de novo.');
              }),
            )
          }
        >
          Apagar a semana
        </Button>
        <Button small variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ---------- Recomeçar do zero e áudios guardados ----------

const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`;
const KEEP_WEEKS = 4;

export function DataSection() {
  const [confirming, setConfirming] = useState(false);
  const usage = useLiveQuery(recordingsUsage, []);

  return (
    <Card>
      <Eyebrow>Dados de estudo</Eyebrow>
      <Hint>
        Para refazer uma semana específica, use “Resetar esta semana” na tela Progress. Aqui você apaga tudo e
        recomeça.
      </Hint>

      <div className="mt-3">
        {confirming ? (
          <div role="alert" className="rounded-xl bg-sunken p-3 text-sm">
            <p className="font-medium text-danger">Apagar todos os estudos?</p>
            <p className="mt-1">
              Sessões, livros, ideias, cards, dicionário, chunks, revisões, falas e estatísticas serão apagados, neste
              navegador e na sua conta. Tema e configuração de IA ficam. Não dá para desfazer; exporte um backup antes,
              se quiser guardar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                small
                variant="danger"
                onClick={() =>
                  attempt(
                    resetAll().then(() => {
                      setConfirming(false);
                      showToast('Tudo apagado. Bom recomeço.');
                    }),
                  )
                }
              >
                Apagar tudo
              </Button>
              <Button small variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button small variant="danger" onClick={() => setConfirming(true)}>
            Recomeçar do zero
          </Button>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-sm font-medium">Áudios das suas falas</p>
        <p className="mt-1 text-sm text-muted">
          {usage && usage.count > 0
            ? `${usage.count} ${usage.count === 1 ? 'gravação' : 'gravações'} neste navegador (${megabytes(usage.bytes)}).`
            : 'Nenhuma gravação neste navegador.'}{' '}
          Os áudios não vão para a nuvem: só podem ser ouvidos no navegador em que foram gravados.
        </p>
        {usage && usage.count > 0 && (
          <div className="mt-2">
            <Button
              small
              variant="secondary"
              onClick={() =>
                attempt(
                  deleteRecordingsBefore(addDays(today(), -7 * KEEP_WEEKS)).then((n) =>
                    showToast(n === 0 ? 'Não há áudios tão antigos.' : `${n} ${n === 1 ? 'áudio apagado' : 'áudios apagados'}.`),
                  ),
                )
              }
            >
              Apagar áudios com mais de {KEEP_WEEKS} semanas
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------- Falas da semana ----------

const KIND_LABEL = { daily: 'Retelling', weekly: 'Fala da semana', book: 'Explicação do livro' } as const;

function SpokenRow({ item }: { item: SpokenItem }) {
  const { speaking, idea, audio } = item;
  const url = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">
        {formatDate(speaking.date, 'weekday').replace('.', '')} {formatDate(speaking.date, 'short')} ·{' '}
        {KIND_LABEL[speaking.kind]} · {formatDuration(speaking.durationSec)}
      </p>
      {idea && <p className="mt-1 font-serif text-lg leading-snug break-words">{idea.title}</p>}
      <div className="mt-2">
        {url ? (
          <RecordingPlayer src={url} showSettings={false} />
        ) : (
          <p className="text-sm text-muted">Áudio não disponível neste navegador.</p>
        )}
      </div>
      {speaking.transcript && (
        <p className="mt-2 border-l-2 border-line pl-3 font-serif break-words whitespace-pre-wrap" lang="en">
          {speaking.transcript}
        </p>
      )}
    </li>
  );
}

/** Todas as falas gravadas na semana, para ouvir de novo e comparar a evolução. */
export function SpokenWeek({ weekStart }: { weekStart: ISODate }) {
  const items = useLiveQuery(() => listWeekSpeaking(weekStart), [weekStart]);
  if (!items) return null;
  if (items.length === 0) return <Hint>Nenhuma fala registrada nesta semana.</Hint>;
  return (
    <div className="space-y-3">
      <Hint>Ouça da primeira para a última: o que ficou mais fluido? Onde você ainda trava?</Hint>
      <ListenSettings />
      <ul className="space-y-3">
        {items.map((item) => (
          <SpokenRow key={item.speaking.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

// ---------- Frequência de cada etapa ----------

export function Routine() {
  return (
    <Card>
      <details>
        <summary className="min-h-8 cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          Rotina: frequência de cada etapa
        </summary>
        <ul className="mt-3 divide-y divide-line text-sm">
          {ROUTINE.map((r) => (
            <li key={r.activity} className="py-2">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{r.activity}</span>
                <span className="text-accent">{r.frequency}</span>
              </p>
              <p className="text-muted">{r.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Dentro da sessão diária</p>
        <ol className="mt-1 grid gap-x-4 text-sm sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex justify-between gap-2 border-b border-line py-1">
              <span>
                {i + 1}. {s.label}
              </span>
              <span className="shrink-0 text-muted">~{s.minutes} min</span>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
