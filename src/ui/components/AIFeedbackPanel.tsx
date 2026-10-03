import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { FEEDBACK_LABELS, getFeedbackFor, isAIConfigured, requestFeedback } from '../../ai/feedback';
import type { FeedbackKind, FeedbackTarget } from '../../domain/types';
import { useOnline, useSettings } from '../hooks';
import { Button } from './ui';

interface Props {
  targetType: FeedbackTarget;
  targetId: string;
  /** O texto já salvo do usuário. A IA só aparece depois da tentativa. */
  text: string;
  context?: string | undefined;
  /** Ações oferecidas. Por padrão, as três de correção de texto escrito. */
  kinds?: readonly FeedbackKind[] | undefined;
}

const WRITING_KINDS: readonly FeedbackKind[] = ['grammar', 'improve', 'natural'];

/** Retorno opcional da IA sobre algo que o usuário já escreveu. Sem IA configurada, não renderiza nada. */
export function AIFeedbackPanel({ targetType, targetId, text, context = '', kinds = WRITING_KINDS }: Props) {
  const settings = useSettings();
  const online = useOnline();
  const history = useLiveQuery(() => getFeedbackFor(targetType, targetId), [targetType, targetId]);
  const [busy, setBusy] = useState<FeedbackKind | null>(null);
  const [error, setError] = useState('');

  if (!settings || !isAIConfigured(settings.ai) || !text.trim()) return null;

  const ask = async (kind: FeedbackKind) => {
    setBusy(kind);
    setError('');
    try {
      await requestFeedback({ kind, targetType, targetId, text, context });
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Falha inesperada ao consultar a IA.');
    } finally {
      setBusy(null);
    }
  };

  const latest = history?.[0];

  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Retorno da IA (opcional)</p>
      <div className="flex flex-wrap gap-2">
        {kinds.map((kind) => (
          <Button key={kind} small variant="secondary" disabled={busy !== null || !online} onClick={() => void ask(kind)}>
            {busy === kind ? 'Analisando…' : FEEDBACK_LABELS[kind]}
          </Button>
        ))}
      </div>
      {!online && <p className="mt-2 text-sm text-muted">Sem conexão. O retorno da IA volta quando você estiver online.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {latest && (
        <dl className="mt-3 space-y-3 text-sm" aria-live="polite">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted">MY VERSION</dt>
            <dd className="font-serif text-base">{latest.original}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted">CORRECTED</dt>
            <dd className="font-serif text-base">{latest.corrected}</dd>
          </div>
          {latest.explanation && (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted">WHY?</dt>
              <dd className="leading-relaxed">{latest.explanation}</dd>
            </div>
          )}
          {latest.moreNatural && (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted">MORE NATURAL</dt>
              <dd className="font-serif text-base">{latest.moreNatural}</dd>
            </div>
          )}
          {latest.original !== text.trim() && (
            <p className="text-muted">Você mudou o texto depois deste retorno. Sua versão continua sendo a que vale.</p>
          )}
        </dl>
      )}
    </div>
  );
}
