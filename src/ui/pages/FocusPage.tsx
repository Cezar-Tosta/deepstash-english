import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AIError } from '../../ai/AIProvider';
import { isAIConfigured } from '../../ai/feedback';
import { generateFocusPlan } from '../../ai/focus';
import { formatDate } from '../../domain/dates';
import { isFocusEmpty, loadFocusData } from '../../services/focus';
import { CorrectionLine } from '../components/Correction';
import { RichText } from '../components/RichText';
import { Button, Card, Collapsible, EmptyState, Eyebrow, Hint, PageTitle, Spinner } from '../components/ui';
import { useOnline, useSettings } from '../hooks';

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Pontos críticos: os assuntos em que o usuário mais erra, juntando todos os ciclos.
 * A base são as correções da IA em cada texto; entram também os erros nos exercícios
 * e os chunks esquecidos nas revisões.
 */
export function FocusPage() {
  const settings = useSettings();
  const online = useOnline();
  const data = useLiveQuery(loadFocusData, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!data || !settings) return null;

  const aiReady = isAIConfigured(settings.ai);
  const plan = settings.studyFocus;
  const newer = plan ? data.corrections.length - plan.corrections : 0;

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      await generateFocusPlan();
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Não foi possível gerar o plano.');
    } finally {
      setBusy(false);
    }
  };

  if (isFocusEmpty(data)) {
    return (
      <div className="space-y-4">
        <PageTitle eyebrow="Focus" title="Pontos críticos">
          Os assuntos em que você mais erra, com base em todos os ciclos.
        </PageTitle>
        <EmptyState title="Ainda não há o que analisar.">
          Peça o retorno da IA nos textos que você escreve (CHECK, PERSONALIZE, REFLECT, SO WHAT) e faça os exercícios. As correções e os
          erros aparecem aqui, agrupados por ciclo.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <PageTitle eyebrow="Focus" title="Pontos críticos">
        Os assuntos em que você mais erra, com base em {count(data.corrections.length, 'correção', 'correções')} de{' '}
        {count(data.cycles.filter((c) => c.period).length, 'ciclo', 'ciclos')}, nos erros dos exercícios e nas revisões.
      </PageTitle>

      <div className="min-w-0 space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>Assuntos mais críticos · plano de estudo</Eyebrow>
            {aiReady && (
              <Button small variant="secondary" disabled={busy || !online} onClick={() => void generate()}>
                {busy ? (
                  <span className="inline-flex items-center gap-2" role="status">
                    <Spinner /> Analisando o histórico…
                  </span>
                ) : plan ? (
                  'Gerar de novo'
                ) : (
                  'Gerar o plano com a IA'
                )}
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          {plan ? (
            <div className="mt-2" aria-live="polite">
              <RichText text={plan.text} className="text-sm" />
              <p className="mt-2 text-xs text-muted">
                Gerado em {formatDate(plan.at.slice(0, 10), 'medium')}, com {count(plan.corrections, 'correção', 'correções')}.
                {newer > 0 && ` Há ${count(newer, 'correção nova', 'correções novas')} desde então: gere de novo para atualizar.`}
              </p>
            </div>
          ) : (
            <div className="mt-2">
              <Hint>
                {aiReady
                  ? 'A IA agrupa as correções por assunto (concordância, tempos verbais, preposições…), ordena pelo que mais se repete e propõe um mini-exercício para cada um.'
                  : 'Com a IA configurada em Settings, as correções abaixo viram um plano por assunto. Sem ela, use as listas para rever seus erros.'}
              </Hint>
            </div>
          )}
        </Card>

        <div className="space-y-2">
          <Eyebrow>Correções por ciclo</Eyebrow>
          {data.cycles.map((cycle, i) => (
            <Collapsible
              key={cycle.period?.start ?? 'none'}
              title={
                cycle.period
                  ? `Ciclo ${cycle.period.index + 1} · ${formatDate(cycle.period.start, 'short')} a ${formatDate(cycle.period.end, 'short')}`
                  : 'Entre ciclos'
              }
              count={cycle.corrections.length}
              defaultOpen={i === 0}
            >
              <ul className="divide-y divide-line text-sm">
                {cycle.corrections.map((c) => (
                  <CorrectionLine key={c.key} correction={c} />
                ))}
              </ul>
            </Collapsible>
          ))}
          {data.corrections.length === 0 && <Hint>Nenhuma correção da IA registrada ainda.</Hint>}
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        {data.hardTerms.length + data.hardVerbs.length > 0 && (
          <Card>
            <Eyebrow>Onde você mais erra nos exercícios</Eyebrow>
            <ul className="mt-2 divide-y divide-line text-sm">
              {data.hardTerms.map((t) => (
                <li key={t.term} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="min-w-0">
                    <span className="font-serif break-words" lang="en">
                      {t.term}
                    </span>
                    {t.meaning && <span className="text-muted"> — {t.meaning}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {count(t.wrong, 'erro', 'erros')} · {count(t.right, 'acerto', 'acertos')}
                  </span>
                </li>
              ))}
              {data.hardVerbs.map((v) => (
                <li key={`verb-${v.base}`} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="font-serif break-words" lang="en">
                    to {v.base} <span className="font-sans text-xs text-muted">(tempos verbais)</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {count(v.wrong, 'erro', 'erros')} · {count(v.right, 'acerto', 'acertos')}
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/practice" className="mt-2 inline-flex min-h-8 items-center text-sm font-medium text-accent">
              Treinar agora →
            </Link>
          </Card>
        )}

        {data.forgotten.length > 0 && (
          <Card>
            <Eyebrow>Chunks mais esquecidos nas revisões</Eyebrow>
            <ul className="mt-2 divide-y divide-line text-sm">
              {data.forgotten.map((c) => (
                <li key={c.text} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="min-w-0">
                    <span className="font-serif break-words" lang="en">
                      {c.text}
                    </span>
                    {c.meaning && <span className="text-muted"> — {c.meaning}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{count(c.missed, 'vez', 'vezes')}</span>
                </li>
              ))}
            </ul>
            <Link to="/knowledge?tab=english" className="mt-2 inline-flex min-h-8 items-center text-sm font-medium text-accent">
              Abrir My English →
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
