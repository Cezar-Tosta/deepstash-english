import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import {
  consolidateFeedback,
  deleteFeedbackFor,
  FEEDBACK_LABELS,
  getFeedbackFor,
  isAIConfigured,
  requestFeedback,
} from '../../ai/feedback';
import { type DiffSegment, diffText } from '../../domain/diff';
import type { FeedbackKind, FeedbackTarget } from '../../domain/types';
import { useOnline, useSettings } from '../hooks';
import { attempt } from '../toast';
import { RichText } from './RichText';
import { Button, Spinner } from './ui';

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

/** O nome curto de cada pedido, usado para identificar o comentário dele. */
const COMMENT_LABEL: Record<FeedbackKind, string> = {
  grammar: 'Grammar',
  improve: 'Improved',
  natural: 'More natural',
  retell: 'Retelling',
};

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

/** Uma versão do texto devolvida pela IA, com o que mudou em relação à do usuário em destaque. */
function Version({ title, original, text }: { title: string; original: string; text: string }) {
  const diff = diffText(original, text);
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted">{title}</dt>
      <dd className="font-serif text-base break-words whitespace-pre-wrap" lang="en">
        <Marked segments={diff.after} side="after" />
      </dd>
      {!diff.changed && <dd className="text-xs text-muted">Igual à sua versão: nada a mudar.</dd>}
    </div>
  );
}

/**
 * Retorno opcional da IA sobre algo que o usuário já escreveu. O retorno é um bloco só,
 * em ordem fixa: a versão do usuário e, conforme os botões acionados, CORRECTED, IMPROVED
 * e MORE NATURAL, cada um uma única vez, seguidos dos comentários de cada pedido. Clicar
 * de novo num botão refaz só aquela parte. Sem IA configurada, não renderiza nada.
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

  const result = consolidateFeedback(history ?? []);
  // A versão do usuário é comparada com a primeira versão devolvida, na ordem em que aparecem.
  const reference = result ? (result.corrected ?? result.improved ?? result.natural) : undefined;

  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Retorno da IA (opcional)</p>
        {result && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setError('');
              attempt(deleteFeedbackFor(targetType, targetId));
            }}
            className="min-h-8 text-xs font-medium text-muted hover:text-danger disabled:opacity-50"
          >
            Excluir retorno
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {kinds.map((kind) => (
          <Button key={kind} small variant="secondary" disabled={busy !== null || !online} onClick={() => void ask(kind)}>
            {busy === kind ? (
              <span className="inline-flex items-center gap-2" role="status">
                <Spinner /> Analisando…
              </span>
            ) : (
              <>
                {result?.kinds.includes(kind) && <span aria-hidden="true">✓ </span>}
                {FEEDBACK_LABELS[kind]}
              </>
            )}
          </Button>
        ))}
      </div>
      {!online && <p className="mt-2 text-sm text-muted">Sem conexão. O retorno da IA volta quando você estiver online.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {result && (
        <dl className="mt-3 space-y-3 text-sm" aria-live="polite">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted">MY VERSION</dt>
            <dd className="font-serif text-base break-words whitespace-pre-wrap" lang="en">
              {reference === undefined ? result.original : <Marked segments={diffText(result.original, reference).before} side="before" />}
            </dd>
            {result.original !== text.trim() && (
              <dd className="text-xs text-warn">Você mudou o texto depois deste retorno. Clique em um dos botões para refazê-lo.</dd>
            )}
          </div>
          {result.corrected !== undefined && <Version title="CORRECTED" original={result.original} text={result.corrected} />}
          {result.improved !== undefined && <Version title="IMPROVED" original={result.original} text={result.improved} />}
          {result.natural !== undefined && <Version title="MORE NATURAL" original={result.original} text={result.natural} />}
          {result.comments.length > 0 && (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted">COMMENTS</dt>
              <dd>
                <ul className="mt-1 space-y-1">
                  {result.comments.map((comment) => (
                    <li key={comment.kind} className="flex flex-col gap-x-2 sm:flex-row sm:items-baseline">
                      {result.comments.length > 1 && (
                        <span className="shrink-0 text-xs font-semibold text-accent sm:w-24">{COMMENT_LABEL[comment.kind]}</span>
                      )}
                      <RichText text={comment.text} className="min-w-0" />
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
