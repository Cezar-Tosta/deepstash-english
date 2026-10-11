import { useEffect, useRef } from 'react';
import { RATES, setLoop, setRate, setVoice, speak, toggleSpeak, useSpeech, useVoices } from '../speech';

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

/** Nome legível do sotaque de uma voz, pelo código de idioma. */
const ACCENTS: Record<string, string> = {
  'en-us': 'americano',
  'en-gb': 'britânico',
  'en-au': 'australiano',
  'en-ca': 'canadense',
  'en-in': 'indiano',
  'en-ie': 'irlandês',
  'en-nz': 'neozelandês',
  'en-za': 'sul-africano',
};

const accentOf = (lang: string): string => ACCENTS[lang.toLowerCase().replace('_', '-')] ?? lang;

const SAMPLE = 'Most adults need between seven and nine hours of sleep every night.';

/** Escolha da voz da leitura em voz alta, com prévia. A lista depende do navegador e do aparelho. */
export function VoicePicker() {
  const voices = useVoices();
  const { voice } = useSpeech();
  if (!('speechSynthesis' in window)) return <p className="text-sm text-muted">Este navegador não lê texto em voz alta.</p>;
  return (
    <div className="space-y-2">
      <label htmlFor="voice" className="block text-sm font-medium">
        Voz da leitura em voz alta
      </label>
      <select
        id="voice"
        value={voices.some((v) => v.voiceURI === voice) ? voice : ''}
        onChange={(e) => {
          setVoice(e.target.value);
          speak(SAMPLE);
        }}
        className="min-h-12 w-full rounded-xl border border-line bg-paper px-3"
      >
        <option value="">Padrão do navegador (inglês americano)</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name} · {accentOf(v.lang)}
            {v.localService ? '' : ' · online'}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-3">
        <ListenButton big text={SAMPLE} label="Ouvir uma prévia" />
      </div>
      <p className="text-xs text-muted">
        Vale para o LISTEN, o modelo do READ ALOUD, os parágrafos, o dicionário e os exercícios. A escolha fica só neste aparelho, porque
        cada aparelho tem as próprias vozes. Vozes marcadas como online costumam soar mais naturais, mas precisam de internet.
      </p>
    </div>
  );
}

/** Player de uma gravação, obedecendo à mesma velocidade e repetição da leitura em voz alta. */
export function RecordingPlayer({ src, showSettings = true }: { src: string; showSettings?: boolean }) {
  const { rate, loop } = useSpeech();
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, src]);

  return (
    <div className="space-y-2">
      {/* A gravação é a fala do próprio usuário; a transcrição aparece ao lado. */}
      <audio ref={audio} controls loop={loop} src={src} className="w-full" />
      {showSettings && <ListenSettings />}
    </div>
  );
}
