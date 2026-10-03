import { useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { askCoach, type CoachContext } from '../../ai/coach';
import { isAIConfigured } from '../../ai/feedback';
import { useOnline, useSettings } from '../hooks';
import { Button } from './ui';

/**
 * Orientação da IA para a etapa atual: sugestões e caminhos baseados no objetivo
 * da etapa e no conteúdo em estudo. Só aparece quando o usuário pede.
 */
export function CoachPanel({ context }: { context: CoachContext }) {
  const settings = useSettings();
  const online = useOnline();
  const [advice, setAdvice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!settings || !isAIConfigured(settings.ai)) return null;

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      setAdvice(await askCoach(context));
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Não foi possível obter a orientação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Orientação da IA</p>
        <Button small variant="secondary" disabled={busy || !online} onClick={() => void ask()}>
          {busy ? 'Pensando…' : advice ? 'Pedir de novo' : 'Como fazer esta etapa?'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {advice && (
        <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap" aria-live="polite">
          {advice}
        </p>
      )}
      {!advice && !error && (
        <p className="mt-1 text-xs text-muted">Sugestões para esta etapa com base no que você está lendo. Tente primeiro; peça se travar.</p>
      )}
    </div>
  );
}
