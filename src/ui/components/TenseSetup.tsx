import { useMemo, useState } from 'react';
import {
  buildTenseTraining,
  hardestVerbs,
  type Question,
  tenseKey,
  tenseNames,
  tenseQuestions,
  verbBases,
} from '../../domain/exercises';
import type { PracticeStat, VerbEntry } from '../../domain/types';
import { Button, Eyebrow, Hint, TextInput } from './ui';

const QUICK = [5, 10, 20] as const;
const DEFAULT_COUNT = 10;

/** Um botão de marcar/desmarcar, usado para verbos e tempos verbais. */
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onChange}
      className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${
        on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

/** Marca ou desmarca um item do conjunto, sem alterar o original. */
function flip(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

interface Props {
  /** Os verbos marcados para estudo nas ideias. */
  verbs: readonly VerbEntry[];
  stats: readonly PracticeStat[];
  onStart: (questions: Question[]) => void;
}

/**
 * Montagem da rodada de tempos verbais: quais verbos, quais tempos e quantas
 * frases. Mostra também os verbos em que o usuário mais erra, com um atalho para
 * treinar só eles.
 */
export function TenseSetup({ verbs, stats, onStart }: Props) {
  const bases = useMemo(() => verbBases(verbs), [verbs]);
  const tenses = useMemo(() => tenseNames(verbs), [verbs]);
  // Guarda o que foi DESmarcado: verbos e tempos novos já entram marcados.
  const [offBases, setOffBases] = useState<ReadonlySet<string>>(new Set());
  const [offTenses, setOffTenses] = useState<ReadonlySet<string>>(new Set());
  const [count, setCount] = useState(String(DEFAULT_COUNT));

  const filter = {
    bases: new Set(bases.filter((b) => !offBases.has(b))),
    tenses: new Set(tenses.map(tenseKey).filter((t) => !offTenses.has(t))),
  };
  const available = tenseQuestions(verbs, filter).length;
  const wanted = Math.min(available, Math.max(1, Number.parseInt(count, 10) || 1));
  const difficult = hardestVerbs(verbs, stats, 5);

  return (
    <div className="mt-3 space-y-4">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>Verbos</Eyebrow>
          <button
            type="button"
            onClick={() => setOffBases(offBases.size === 0 ? new Set(bases) : new Set())}
            className="min-h-8 text-xs font-medium text-accent"
          >
            {offBases.size === 0 ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Verbos para treinar">
          {bases.map((base) => (
            <Toggle key={base} label={`to ${base}`} on={!offBases.has(base)} onChange={() => setOffBases(flip(offBases, base))} />
          ))}
        </div>
      </div>

      <div>
        <Eyebrow>Tempos verbais</Eyebrow>
        <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Tempos verbais para treinar">
          {tenses.map((tense) => (
            <Toggle
              key={tense}
              label={tense}
              on={!offTenses.has(tenseKey(tense))}
              onChange={() => setOffTenses(flip(offTenses, tenseKey(tense)))}
            />
          ))}
        </div>
      </div>

      {available === 0 ? (
        <Hint>Nenhuma frase com essa combinação. Marque ao menos um verbo e um tempo verbal.</Hint>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <TextInput
              className="w-24"
              label="Quantas frases"
              type="number"
              inputMode="numeric"
              min={1}
              max={available}
              value={count}
              onChange={setCount}
            />
            {QUICK.filter((n) => n < available).map((n) => (
              <Button key={n} small variant="secondary" onClick={() => setCount(String(n))}>
                {n}
              </Button>
            ))}
            <Button small variant="secondary" onClick={() => setCount(String(available))}>
              Todas ({available})
            </Button>
          </div>
          <Button onClick={() => onStart(buildTenseTraining(verbs, stats, wanted, { filter }))}>
            Começar com {wanted} {wanted === 1 ? 'frase' : 'frases'}
          </Button>
        </div>
      )}

      <div className="border-t border-line pt-3">
        <Eyebrow>Verbos em que você mais erra</Eyebrow>
        {difficult.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Aparecem aqui depois dos primeiros erros neste exercício.</p>
        ) : (
          <>
            <ul className="mt-1 divide-y divide-line">
              {difficult.map((v) => (
                <li key={v.base} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="font-serif break-words" lang="en">
                    to {v.base}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {v.wrong} {v.wrong === 1 ? 'erro' : 'erros'} · {v.right} {v.right === 1 ? 'acerto' : 'acertos'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <Button
                small
                variant="secondary"
                onClick={() => {
                  const only = { bases: new Set(difficult.map((v) => v.base)) };
                  onStart(buildTenseTraining(verbs, stats, tenseQuestions(verbs, only).length, { filter: only }));
                }}
              >
                Treinar só estes verbos
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
