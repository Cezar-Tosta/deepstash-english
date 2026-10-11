import { useEffect, useState } from 'react';
import { AIError } from '../../../ai/AIProvider';
import { canTranscribe, transcribeAudio } from '../../../ai/feedback';
import { formatDuration } from '../../../domain/dates';
import { checkDictation } from '../../../domain/exercises';
import { countWords } from '../../../domain/session';
import { saveRecording } from '../../../services/maintenance';
import { recordSpeaking, saveTranscript } from '../../../services/sessions';
import { ListenButton, ListenSettings, RecordingPlayer } from '../../components/Listen';
import { GlossedParagraph } from '../../components/Reader';
import { Timer } from '../../components/Timer';
import { Card, Eyebrow, Hint, Prompt } from '../../components/ui';
import { useSettings } from '../../hooks';
import { stopSpeaking } from '../../speech';
import { attempt, showToast } from '../../toast';
import { type StepProps, NeedsText, TextHeading } from './shared';

// ---------- 6. READ ALOUD ----------

/** Ritmo de referência da leitura em voz alta, em palavras por segundo (cerca de 130 por minuto). */
const ALOUD_WORDS_PER_SEC = 2.2;

/** Quanto do parágrafo a transcrição reconheceu, com as palavras que ficaram de fora em destaque. */
function AloudResult({ transcript, paragraph, durationSec }: { transcript: string; paragraph: string; durationSec: number }) {
  const result = checkDictation(transcript, paragraph);
  return (
    <Card>
      <Eyebrow>
        Leitura de {formatDuration(durationSec)} · {Math.round(result.score * 100)}% das palavras reconhecidas
      </Eyebrow>
      {result.missed > 0 ? (
        <>
          <p className="mt-2 font-serif text-lg leading-relaxed break-words" lang="en">
            {result.words.map((word, i) => (
              <span key={i}>
                {i > 0 && ' '}
                {word.hit ? word.text : <mark className="rounded bg-sunken px-0.5 text-danger">{word.text}</mark>}
              </span>
            ))}
          </p>
          <Hint>
            Em destaque, o que a transcrição não reconheceu: pode ser pronúncia, uma palavra pulada ou falha da própria transcrição. Ouça o
            modelo dessas palavras e leia de novo.
          </Hint>
        </>
      ) : (
        <p className="mt-2 text-sm text-good">Todas as palavras foram reconhecidas.</p>
      )}
      <details className="mt-2 text-sm">
        <summary className="min-h-8 cursor-pointer text-xs font-medium text-accent">O que a transcrição ouviu</summary>
        <p className="font-serif text-muted" lang="en">
          {transcript}
        </p>
      </details>
    </Card>
  );
}

export function AloudStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, speaking } = bundle;
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const [playback, setPlayback] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  // Libera a gravação anterior da memória ao trocar ou sair da tela.
  useEffect(
    () => () => {
      if (playback) URL.revokeObjectURL(playback);
    },
    [playback],
  );

  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const cards = ideaOfDay.cards.filter((c) => c.content.trim());
  if (cards.length === 0) return <NeedsText goTo={goTo} />;
  const readings = speaking.filter((s) => s.kind === 'aloud');
  // Por padrão, o primeiro parágrafo ainda não lido em voz alta.
  const card = cards.find((c) => c.id === chosen) ?? cards.find((c) => !readings.some((r) => r.cardId === c.id)) ?? cards[0];
  if (!card) return <NeedsText goTo={goTo} />;
  const transcription = Boolean(settings && canTranscribe(settings.ai));
  const expectedSec = Math.max(5, Math.round(countWords(card.content) / ALOUD_WORDS_PER_SEC));
  const mine = readings.filter((r) => r.cardId === card.id);

  const finish = async (durationSec: number, audio: Blob | null) => {
    const id = await recordSpeaking({
      kind: 'aloud',
      sessionId: session.id,
      ideaId: ideaOfDay.idea.id,
      cardId: card.id,
      date: session.date,
      durationSec,
      targetSec: expectedSec,
    });
    if (!id) return;
    showToast(`Leitura registrada: ${formatDuration(durationSec)}`);
    if (!audio) return;
    await saveRecording(id, audio);
    setPlayback(URL.createObjectURL(audio));
    if (!transcription) return;
    setTranscribing(true);
    try {
      await saveTranscript(id, await transcribeAudio(audio));
    } catch (e) {
      showToast(e instanceof AIError ? e.message : 'Não foi possível transcrever a leitura.', 'error');
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="space-y-6">
      <TextHeading item={ideaOfDay} />
      <div>
        <Prompt>Ouça o modelo e leia em voz alta.</Prompt>
        <Hint>
          Shadowing: ouça o parágrafo, leia junto com o áudio algumas vezes e, por fim, grave a sua leitura sozinho. Imite o ritmo, as
          pausas e a entonação, não só as palavras.
        </Hint>
      </div>

      {cards.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Parágrafo para ler">
          {cards.map((c, i) => {
            const active = c.id === card.id;
            const done = readings.some((r) => r.cardId === c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  stopSpeaking();
                  setChosen(c.id);
                  setPlayback(null);
                }}
                className={`min-h-10 rounded-xl border px-3 text-sm font-medium ${
                  active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                {done && <span aria-hidden="true">✓ </span>}Parágrafo {i + 1}
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <GlossedParagraph text={card.content} className="whitespace-pre-wrap font-serif text-lg leading-loose" />
        <div className="mt-3 space-y-2">
          <ListenButton big text={card.content} label="Ouvir o modelo" />
          <ListenSettings />
        </div>
      </Card>

      <Card>
        <Timer
          record
          minSec={expectedSec}
          maxSec={expectedSec}
          targetPrefix="Em ritmo natural"
          targetLabel={`~${formatDuration(expectedSec)}`}
          onStop={(durationSec, audio) => attempt(finish(durationSec, audio))}
        />
        <p className="mt-2 text-center text-xs text-muted">
          {transcription
            ? 'A leitura é gravada e transcrita; a transcrição mostra as palavras que não foram reconhecidas.'
            : 'A leitura é gravada para você se ouvir e comparar com o modelo. Com Groq em Ajustes, ela também é transcrita e conferida.'}
        </p>
      </Card>

      {playback && (
        <div>
          <p className="mb-1 text-sm font-medium">Ouça a sua leitura e compare com o modelo</p>
          <RecordingPlayer src={playback} />
        </div>
      )}

      {transcribing && (
        <p className="text-sm text-muted" role="status">
          Transcrevendo…
        </p>
      )}

      {mine
        .filter((r) => r.transcript)
        .map((r) => (
          <AloudResult key={r.id} transcript={r.transcript ?? ''} paragraph={card.content} durationSec={r.durationSec} />
        ))}
    </div>
  );
}
