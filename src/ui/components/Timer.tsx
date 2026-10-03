import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../../domain/dates';
import { Button } from './ui';

interface TimerProps {
  /** Faixa-alvo em segundos; iguais quando a meta é um valor só. */
  minSec: number;
  maxSec: number;
  targetLabel: string;
  onStop: (durationSec: number) => void;
}

/** Cronômetro crescente. Mede pelo relógio, então continua certo se a aba ficar em segundo plano. */
export function Timer({ minSec, maxSec, targetLabel, onStop }: TimerProps) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed((Date.now() - startedAt) / 1000);
    const id = setInterval(tick, 250);
    // Mantém a tela acesa enquanto o usuário fala; se o navegador negar, só segue sem isso.
    navigator.wakeLock
      ?.request('screen')
      .then((lock) => {
        lockRef.current = lock;
      })
      .catch(() => undefined);
    return () => {
      clearInterval(id);
      void lockRef.current?.release();
      lockRef.current = null;
    };
  }, [startedAt]);

  const running = startedAt !== null;
  const reached = elapsed >= minSec;
  const pct = Math.min(100, (elapsed / maxSec) * 100);

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-muted">Meta desta semana: {targetLabel}</p>
      <p
        role="timer"
        aria-live="off"
        className={`font-serif text-6xl tabular-nums ${reached && running ? 'text-good' : 'text-ink'}`}
      >
        {formatDuration(elapsed)}
      </p>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="min-h-5 text-sm text-muted" aria-live="polite">
        {running && reached ? 'Meta atingida. Continue se ainda tiver o que dizer.' : ''}
      </p>
      {running ? (
        <Button
          variant="secondary"
          className="w-full max-w-xs"
          onClick={() => {
            const total = (Date.now() - startedAt) / 1000;
            setStartedAt(null);
            setElapsed(0);
            onStop(total);
          }}
        >
          PARAR
        </Button>
      ) : (
        <Button
          className="w-full max-w-xs"
          onClick={() => {
            setElapsed(0);
            setStartedAt(Date.now());
          }}
        >
          INICIAR
        </Button>
      )}
    </div>
  );
}
