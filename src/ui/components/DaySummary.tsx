import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AIError } from '../../ai/AIProvider';
import { isAIConfigured } from '../../ai/feedback';
import { generateStudySummary } from '../../ai/summary';
import { db } from '../../data/db';
import { isDigestEmpty, loadDayDigest } from '../../services/digest';
import { useOnline, useSettings } from '../hooks';
import { CorrectionLine } from './Correction';
import { RichText } from './RichText';
import { Button, Collapsible, Eyebrow, Hint, Spinner } from './ui';

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * "O que estudar": o resumo do dia, montado a partir dos retornos da IA, das
 * correções e dos exercícios. Os dados aparecem sempre; com a IA configurada, ela
 * escreve um resumo por cima deles.
 */
export function DaySummary({ sessionId }: { sessionId: string }) {
  const settings = useSettings();
  const online = useOnline();
  const digest = useLiveQuery(() => loadDayDigest(sessionId), [sessionId]);
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!digest || !session || !settings) return null;
  const empty = isDigestEmpty(digest);
  const aiReady = isAIConfigured(settings.ai);
  const summary = session.studySummary ?? '';

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      await generateStudySummary(sessionId);
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Não foi possível gerar o resumo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>O que estudar · resumo do dia</Eyebrow>
        {aiReady && !empty && (
          <Button small variant="secondary" disabled={busy || !online} onClick={() => void generate()}>
            {busy ? (
              <span className="inline-flex items-center gap-2" role="status">
                <Spinner /> Gerando o resumo…
              </span>
            ) : summary ? (
              'Gerar de novo'
            ) : (
              'Gerar resumo com a IA'
            )}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {empty ? (
        <p className="mt-2 text-sm text-muted">
          Nada a reforçar por enquanto: nenhuma correção nos retornos da IA, nenhum erro nos exercícios e nenhuma revisão esquecida hoje.
          {digest.cleanFeedback > 0 && ` ${count(digest.cleanFeedback, 'retorno da IA veio', 'retornos da IA vieram')} sem correção.`}
        </p>
      ) : (
        <>
          {summary ? (
            <div className="mt-2" aria-live="polite">
              <RichText text={summary} className="text-sm" />
            </div>
          ) : (
            <div className="mt-2">
              <Hint>
                {aiReady
                  ? 'O resumo é gerado ao finalizar a sessão, ou agora pelo botão. Abaixo, os dados em que ele se baseia.'
                  : 'Com a IA configurada em Settings, estes dados viram um resumo escrito. Sem ela, use as listas abaixo.'}
              </Hint>
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 items-start gap-2 lg:grid-cols-2">
            {digest.corrections.length > 0 && (
              <Collapsible title="Correções de hoje" count={digest.corrections.length} defaultOpen={!summary} className="lg:col-span-2">
                <ul className="divide-y divide-line text-sm">
                  {digest.corrections.map((c) => (
                    <CorrectionLine key={c.key} correction={c} />
                  ))}
                </ul>
              </Collapsible>
            )}

            {digest.hardTerms.length + digest.hardVerbs.length > 0 && (
              <Collapsible title="Onde você mais erra nos exercícios" count={digest.hardTerms.length + digest.hardVerbs.length} defaultOpen>
                <ul className="divide-y divide-line text-sm">
                  {digest.hardTerms.map((t) => (
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
                  {digest.hardVerbs.map((v) => (
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
              </Collapsible>
            )}

            {digest.forgotten.length + digest.unusedChunks.length > 0 && (
              <Collapsible title="Chunks para reforçar" count={digest.forgotten.length + digest.unusedChunks.length} defaultOpen>
                <ul className="divide-y divide-line text-sm">
                  {digest.forgotten.map((c) => (
                    <li key={`f-${c.text}`} className="py-1">
                      <span className="font-serif break-words" lang="en">
                        {c.text}
                      </span>
                      {c.meaning && <span className="text-muted"> — {c.meaning}</span>}
                      <span className="block text-xs text-muted">não lembrado na revisão de hoje</span>
                    </li>
                  ))}
                  {digest.unusedChunks.map((text) => (
                    <li key={`u-${text}`} className="py-1">
                      <span className="font-serif break-words" lang="en">
                        {text}
                      </span>
                      <span className="block text-xs text-muted">não usado ao recontar a ideia</span>
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
          </div>
        </>
      )}
    </section>
  );
}
