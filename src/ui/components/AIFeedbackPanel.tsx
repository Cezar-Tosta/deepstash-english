import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { FEEDBACK_LABELS, getFeedbackFor, isAIConfigured, requestFeedback } from '../../ai/feedback';
import { type DiffSegment, diffText } from '../../domain/diff';
import type { AIFeedback, FeedbackKind, FeedbackTarget } from '../../domain/types';
import { useOnline, useSettings } from '../hooks';
import { RichText } from './RichText';
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

/**
 * Um texto com os trechos que a correção mexeu em destaque: na versão do usuário, o
 * que saiu aparece riscado; na versão corrigida, o que entrou aparece marcado.
 */
export function Marked({ segments, side }: { segments: readonly DiffSegment[]; side: 'before' | 'after' }) {
  return (
    <>
      {segments.map((segment, i) =>
        !segment.changed ? (
          <span key={i}>{segment.text}</span>
        ) : side === 'before' ? (
          <del key={i} className="rounded bg-sunken px-0.5 text-danger decoration-danger/70">
            {segment.text}
          </del>
        ) : (
          <ins key={i} className="rounded bg-accent-soft px-0.5 font-bold text-ink no-underline">
            {segment.text}
          </ins>
        ),
      )}
    </>
  );
}

/** Um retorno da IA: a versão do usuário, a corrigida e o comentário daquele pedido. */
function FeedbackEntry({ entry, number, current }: { entry: AIFeedback; number: number; current: string }) {
  const diff = diffText(entry.original, entry.corrected);
  return (
    <li className="rounded-lg border border-line p-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs font-semibold text-accent">
        <span>
          {number}. {FEEDBACK_LABELS[entry.kind]}
        </span>
        {entry.original !== current && <span className="font-normal text-muted">sobre uma versão anterior do seu texto</span>}
      </p>
      <dl className="mt-2 space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted">MY VERSION</dt>
          <dd className="font-serif text-base break-words whitespace-pre-wrap" lang="en">
            <Marked segments={diff.before} side="before" />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted">CORRECTED</dt>
          <dd className="font-serif text-base break-words whitespace-pre-wrap" lang="en">
            <Marked segments={diff.after} side="after" />
          </dd>
          {!diff.changed && <dd className="mt-1 text-xs text-muted">Nenhuma correção: a sua frase já estava certa.</dd>}
        </div>
        {entry.moreNatural && (
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted">MORE NATURAL</dt>
            <dd className="font-serif text-base break-words whitespace-pre-wrap" lang="en">
              <Marked segments={diffText(entry.original, entry.moreNatural).after} side="after" />
            </dd>
          </div>
        )}
        {entry.explanation && (
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted">WHY?</dt>
            <dd>
              <RichText text={entry.explanation} />
            </dd>
          </div>
        )}
      </dl>
    </li>
  );
}

/**
 * Retorno opcional da IA sobre algo que o usuário já escreveu. Cada pedido gera uma
 * resposta própria, com os seus comentários; as anteriores continuam na tela. Sem IA
 * configurada, não renderiza nada.
 */
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

  // Do mais antigo para o mais recente: um retorno novo entra no fim, sem mexer nos outros.
  const entries = (history ?? []).toReversed();

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
      {entries.length > 0 && (
        <>
          <ol className="mt-3 space-y-2" aria-live="polite">
            {entries.map((entry, i) => (
              <FeedbackEntry key={entry.id} entry={entry} number={i + 1} current={text.trim()} />
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted">
            Em negrito, o que cada correção mudou; riscado, o que saiu da sua versão. O seu texto continua sendo o que vale.
          </p>
        </>
      )}
    </div>
  );
}
