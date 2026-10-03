import { useEffect, useRef } from 'react';
import { RATES, setLoop, setRate, toggleSpeak, useSpeech } from '../speech';

/** Botão que lê o texto em voz alta; clicar de novo para. */
export function ListenButton({ text, label = 'Ouvir', big }: { text: string; label?: string; big?: boolean }) {
  const { playing } = useSpeech();
  const active = playing === text;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => toggleSpeak(text)}
      className={
        big
          ? 'inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 font-semibold hover:bg-sunken'
          : 'min-h-8 text-xs font-medium text-accent'
      }
    >
      {active ? '■ Parar' : `▶ ${label}`}
    </button>
  );
}

/** Velocidade e repetição. Valem para toda leitura em voz alta e para as gravações. */
export function ListenSettings() {
  const { rate, loop } = useSpeech();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" role="group" aria-label="Opções de áudio">
      <span className="flex items-center gap-1">
        <span className="text-muted">Velocidade</span>
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === rate}
            onClick={() => setRate(r)}
            className={`min-h-8 rounded-full border px-2.5 text-xs font-medium ${
              r === rate ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'
            }`}
          >
            {r}×
          </button>
        ))}
      </span>
      <label className="flex min-h-8 cursor-pointer items-center gap-2">
        <input type="checkbox" className="size-4 accent-(--accent)" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
        Repetir em loop
      </label>
    </div>
  );
}

/** Player de uma gravação, obedecendo à mesma velocidade e repetição da leitura em voz alta. */
export function RecordingPlayer({ src }: { src: string }) {
  const { rate, loop } = useSpeech();
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, src]);

  return (
    <div className="space-y-2">
      {/* A gravação é a fala do próprio usuário; a transcrição aparece ao lado. */}
      <audio ref={audio} controls loop={loop} src={src} className="w-full" />
      <ListenSettings />
    </div>
  );
}
