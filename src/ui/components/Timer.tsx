import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../../domain/dates';
import { Button } from './ui';

interface TimerProps {
  /** Faixa-alvo em segundos; iguais quando a meta é um valor só. */
  minSec: number;
  maxSec: number;
  targetLabel: string;
  /** Grava o microfone enquanto o cronômetro corre. Se o acesso for negado, só conta o tempo. */
  record?: boolean | undefined;
  onStop: (durationSec: number, audio: Blob | null) => void;
}

interface Recording {
  recorder: MediaRecorder;
  stream: MediaStream;
  parts: Blob[];
}

async function startRecording(): Promise<Recording | null> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const parts: Blob[] = [];
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) parts.push(e.data);
    });
    recorder.start();
    return { recorder, stream, parts };
  } catch {
    return null;
  }
}

function finishRecording(recording: Recording): Promise<Blob | null> {
  return new Promise((resolve) => {
    recording.recorder.addEventListener('stop', () => {
      for (const track of recording.stream.getTracks()) track.stop();
      resolve(recording.parts.length ? new Blob(recording.parts, { type: recording.recorder.mimeType }) : null);
    });
    recording.recorder.stop();
  });
}

/** Cronômetro crescente. Mede pelo relógio, então continua certo se a aba ficar em segundo plano. */
export function Timer({ minSec, maxSec, targetLabel, record, onStop }: TimerProps) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [micDenied, setMicDenied] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const recordingRef = useRef<Recording | null>(null);

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

  // Se a tela for fechada no meio da fala, solta o microfone.
  useEffect(
    () => () => {
      for (const track of recordingRef.current?.stream.getTracks() ?? []) track.stop();
    },
    [],
  );

  const running = startedAt !== null;
  const reached = elapsed >= minSec;
  const pct = Math.min(100, (elapsed / maxSec) * 100);

  const start = async () => {
    if (record) {
      recordingRef.current = await startRecording();
      setMicDenied(recordingRef.current === null);
    }
    setElapsed(0);
    setStartedAt(Date.now());
  };

  const stop = async () => {
    if (startedAt === null) return;
    const total = (Date.now() - startedAt) / 1000;
    setStartedAt(null);
    setElapsed(0);
    const recording = recordingRef.current;
    recordingRef.current = null;
    onStop(total, recording ? await finishRecording(recording) : null);
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm text-muted">Meta desta fase: {targetLabel}</p>
      <p role="timer" aria-live="off" className={`font-serif text-6xl tabular-nums ${reached && running ? 'text-good' : 'text-ink'}`}>
        {formatDuration(elapsed)}
      </p>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="min-h-5 text-center text-sm text-muted" aria-live="polite">
        {running && record && !micDenied && '● Gravando. '}
        {running && reached ? 'Meta atingida. Continue se ainda tiver o que dizer.' : ''}
        {micDenied && 'Microfone não autorizado: contando só o tempo.'}
      </p>
      {running ? (
        <Button variant="secondary" className="w-full max-w-xs" onClick={() => void stop()}>
          PARAR
        </Button>
      ) : (
        <Button className="w-full max-w-xs" onClick={() => void start()}>
          INICIAR
        </Button>
      )}
    </div>
  );
}
