import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { getFeedbackFor, isAIConfigured, requestFeedback } from '../../ai/feedback';
import { inlineDiff } from '../../domain/diff';
import { bestCorrection, consolidateFeedback } from '../../domain/feedback';
import type { FeedbackTarget } from '../../domain/types';
import { useOnline, useSettings } from '../hooks';
import { RichText } from './RichText';
import { Spinner } from './ui';

/** Original e correção numa linha só: o que saiu aparece riscado e o que entrou, em negrito, no mesmo lugar. */
export function InlineCorrection({ original, corrected }: { original: string; corrected: string }) {
  return (
    <>
      {inlineDiff(original, corrected).map((part, i) =>
        part.kind === 'same' ? (
          <span key={i}>{part.text}</span>
        ) : part.kind === 'removed' ? (
          <del key={i} className="rounded bg-sunken px-0.5 text-danger decoration-danger/70">
            {part.text}
          </del>
        ) : (
          <ins key={i} className="rounded bg-accent-soft px-0.5 font-bold text-ink no-underline">
            {part.text}
          </ins>
        ),
      )}
    </>
  );
}

interface Props {
  targetType: FeedbackTarget;
  targetId: string;
  /** O texto do usuário. A correção só aparece se for sobre exatamente este texto. */
  text: string;
  context?: string | undefined;
  /** Mostra também o comentário curto da correção. */
  withComment?: boolean | undefined;
}

/**
 * A correção de um texto do usuário, logo abaixo dele: mostra a que já foi gerada ou,
 * com a IA disponível, oferece gerar. Não repete o texto quando não há nada a corrigir.
 */
export function Correction({ targetType, targetId, text, context = '', withComment }: Props) {
  const settings = useSettings();
  const online = useOnline();
  const history = useLiveQuery(() => getFeedbackFor(targetType, targetId), [targetType, targetId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const original = text.trim();
  if (!original || !history || !settings) return null;

  const feedback = consolidateFeedback(history);
  const current = feedback && feedback.original === original ? feedback : null;
  const canAsk = isAIConfigured(settings.ai) && online;

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      await requestFeedback({ kind: targetType === 'retell' ? 'retell' : 'grammar', targetType, targetId, text: original, context });
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Não foi possível gerar a correção.');
    } finally {
      setBusy(false);
    }
  };

  if (!current) {
    if (!canAsk) return null;
    return (
      <div className="mt-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="inline-flex min-h-8 items-center gap-2 text-xs font-medium text-accent disabled:opacity-60"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2" role="status">
              <Spinner /> Corrigindo…
            </span>
          ) : (
            'Gerar correção'
          )}
        </button>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const corrected = bestCorrection(current);
  const comment = current.comments[0]?.text;
  return (
    <div className="mt-1 border-l-2 border-accent/40 pl-3 text-sm" data-correction>
      <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">Correção</p>
      {corrected === original ? (
        <p className="text-good">✓ Sem correções.</p>
      ) : (
        <p className="font-serif text-base break-words whitespace-pre-wrap" lang="en">
          <InlineCorrection original={original} corrected={corrected} />
        </p>
      )}
      {withComment && comment && <RichText text={comment} className="text-xs text-muted" />}
    </div>
  );
}

/** Uma correção em uma linha: o que saiu riscado, o que entrou em negrito, e o comentário curto. */
export function CorrectionLine({ correction }: { correction: { original: string; corrected: string; comment: string } }) {
  return (
    <li className="py-1.5">
      <p className="font-serif break-words" lang="en">
        <InlineCorrection original={correction.original} corrected={correction.corrected} />
      </p>
      {correction.comment && <RichText text={correction.comment} className="text-xs text-muted" />}
    </li>
  );
}
