import { useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { analyzeCard } from '../../ai/cardAnalysis';
import type { SourceCard } from '../../domain/types';
import { RichText } from './RichText';
import { Button, Spinner } from './ui';

/**
 * Comentário da estrutura do texto de um card (gramática, ortografia, sintaxe e
 * semântica). É gerado só quando o usuário pede, fica guardado no card e pode ser
 * recolhido ou expandido pela setinha.
 */
export function CardAnalysis({ card, canAsk }: { card: SourceCard; canAsk: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Um comentário que já existia começa recolhido; o que acabou de ser gerado abre.
  const [open, setOpen] = useState(false);
  const analysis = card.analysis ?? '';
  const stale = analysis !== '' && card.analysisOf !== undefined && card.analysisOf !== card.content.trim();
  const panelId = `analysis-${card.id}`;

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      await analyzeCard(card.id);
      setOpen(true);
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Não foi possível comentar o texto.');
    } finally {
      setBusy(false);
    }
  };

  if (!analysis && !canAsk) return null;

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {analysis ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-sunken"
          >
            <span aria-hidden="true" className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`}>
              ▾
            </span>
            {open ? 'Recolher o comentário da estrutura' : 'Ver o comentário da estrutura'}
          </button>
        ) : (
          <Button small variant="secondary" disabled={busy} onClick={() => void generate()}>
            {busy ? (
              <span className="inline-flex items-center gap-2" role="status">
                <Spinner /> Comentando o texto…
              </span>
            ) : (
              'Comentar a estrutura do texto'
            )}
          </Button>
        )}
        {analysis && open && canAsk && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className="inline-flex min-h-9 items-center gap-2 text-xs font-medium text-accent disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2" role="status">
                <Spinner /> Comentando o texto…
              </span>
            ) : (
              'Gerar de novo'
            )}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {analysis && open && (
        <div id={panelId} className="mt-2 rounded-xl border border-line bg-surface p-3" aria-live="polite">
          <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-muted uppercase">
            Estrutura do texto · gramática, ortografia, sintaxe e semântica
          </p>
          {stale && <p className="mb-2 text-xs text-warn">O texto do card mudou depois deste comentário. Gere de novo para atualizar.</p>}
          <RichText text={analysis} className="text-sm" />
        </div>
      )}
    </div>
  );
}
