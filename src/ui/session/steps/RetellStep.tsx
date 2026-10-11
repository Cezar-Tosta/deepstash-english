import { useEffect, useState } from 'react';
import { AIError } from '../../../ai/AIProvider';
import { canTranscribe, transcribeAudio } from '../../../ai/feedback';
import { weekPlan } from '../../../domain/cycle';
import { formatDuration } from '../../../domain/dates';
import { locateTerm } from '../../../domain/exercises';
import { fluencyOf } from '../../../domain/fluency';
import { saveRecording } from '../../../services/maintenance';
import { recordSpeaking, saveTranscript, updateSessionNotes } from '../../../services/sessions';
import { AIFeedbackPanel } from '../../components/AIFeedbackPanel';
import { RecordingPlayer } from '../../components/Listen';
import { Timer } from '../../components/Timer';
import { AutoTextArea, Card, Eyebrow, Hint, Prompt, StarterChips } from '../../components/ui';
import { useSettings } from '../../hooks';
import { attempt, showToast } from '../../toast';
import { type StepProps, NeedsText, TextHeading } from './shared';

// ---------- 7. RETELL ----------

/** Ritmo de referência de uma fala natural de quem ainda está aprendendo, em palavras por minuto. */
const COMFORTABLE_WPM = 100;

/** As métricas de fluência de uma fala transcrita, em uma linha. */
function FluencyLine({ transcript, durationSec, chunks }: { transcript: string; durationSec: number; chunks: readonly string[] }) {
  const m = fluencyOf(transcript, durationSec, chunks);
  if (m.words === 0) return null;
  const items = [
    m.wpm !== null && `${m.wpm} palavras/min${m.wpm < COMFORTABLE_WPM ? ' (com prática, chega a 100–130)' : ''}`,
    m.variety !== null && `${Math.round(m.variety * 100)}% de palavras diferentes`,
    `${m.fillers} ${m.fillers === 1 ? 'hesitação' : 'hesitações'} (um, uh, you know…)`,
    chunks.length > 0 && `${m.chunksUsed.length} de ${chunks.length} chunks usados`,
  ].filter(Boolean);
  return <p className="mt-2 text-sm text-muted">{items.join(' · ')}</p>;
}

const RETELL_PROMPTS = [
  'Today I read about…',
  'The main idea is…',
  'First… / Then… / Finally…',
  'One interesting point is…',
  'I think this is important because…',
  'In my experience…',
  'For example…',
  'However…',
  'In other words…',
  'From my perspective…',
] as const;

export function RetellStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, chunks } = bundle;
  const settings = useSettings();
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
  // As leituras em voz alta têm a etapa própria; aqui ficam só as falas do retell.
  const speaking = bundle.speaking.filter((s) => s.kind === 'daily');
  const plan = weekPlan(session.cycleWeek);
  const total = speaking.reduce((sum, s) => sum + s.durationSec, 0);
  const transcription = Boolean(settings && canTranscribe(settings.ai));
  const { idea } = ideaOfDay;
  const transcripts = speaking.map((s) => s.transcript ?? '').filter((t) => t.trim());
  const usedCount = chunks.filter((c) => transcripts.some((t) => locateTerm(t, c.text))).length;

  const finish = async (durationSec: number, audio: Blob | null) => {
    const id = await recordSpeaking({
      kind: 'daily',
      sessionId: session.id,
      ideaId: idea.id,
      date: session.date,
      durationSec,
      targetSec: plan.speakingMaxSec,
    });
    if (!id) return;
    showToast(`Fala registrada: ${formatDuration(durationSec)}`);
    if (!audio) return;
    await saveRecording(id, audio);
    setPlayback(URL.createObjectURL(audio));
    if (!transcription) return;
    setTranscribing(true);
    try {
      await saveTranscript(id, await transcribeAudio(audio));
    } catch (e) {
      showToast(e instanceof AIError ? e.message : 'Não foi possível transcrever a fala.', 'error');
    } finally {
      setTranscribing(false);
    }
  };

  const feedbackContext = [
    `Texto recontado: "${idea.title}".`,
    idea.mainIdea && `Ideia principal segundo o aluno: ${idea.mainIdea}`,
    chunks.length > 0 &&
      `Expressões que ele está aprendendo e deveria usar na fala: ${chunks.map((c) => c.text).join('; ')}. No comentário, diga quais ele usou e mostre, com uma frase de exemplo, como encaixar as que faltaram.`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-6">
      <TextHeading item={ideaOfDay} />
      <div>
        <Prompt>Esconda o texto e reconte-o em voz alta.</Prompt>
        <Hint>
          Conte o texto do começo ao fim, com as suas palavras. Fase {session.cycleWeek} de 4: {plan.focus} Não reinicie por causa de erros.
        </Hint>
      </div>

      <StarterChips starters={RETELL_PROMPTS} />

      {chunks.length > 0 && (
        <Card>
          <Eyebrow>Use os seus chunks na fala</Eyebrow>
          <ul className="mt-2 space-y-1">
            {chunks.map((chunk) => {
              const used = transcripts.some((t) => locateTerm(t, chunk.text));
              return (
                <li key={chunk.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-serif text-lg break-words" lang="en">
                    {chunk.text}
                  </span>
                  {chunk.meaning && <span className="text-sm text-muted">— {chunk.meaning}</span>}
                  {transcripts.length > 0 && (
                    <span className={`text-xs font-semibold ${used ? 'text-good' : 'text-muted'}`}>
                      {used ? '✓ usado na fala' : 'ainda não usado'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2">
            <Hint>
              Tente encaixar cada expressão ao recontar o texto.
              {transcripts.length > 0 && ` Você usou ${usedCount} de ${chunks.length} até agora.`}
            </Hint>
          </div>
        </Card>
      )}

      <AutoTextArea
        label="Palavras de apoio (só palavras-chave, não um roteiro)"
        value={session.retellNotes}
        onSave={(retellNotes) => updateSessionNotes(session.id, { retellNotes })}
        rows={2}
        lang="en"
      />

      <Card>
        <Timer
          record
          minSec={plan.speakingMinSec}
          maxSec={plan.speakingMaxSec}
          targetLabel={plan.speakingLabel}
          onStop={(durationSec, audio) => attempt(finish(durationSec, audio))}
        />
        <p className="mt-2 text-center text-xs text-muted">
          {transcription
            ? 'A fala é gravada e transcrita ao terminar. O áudio fica neste navegador, para o fechamento do ciclo.'
            : 'A fala é gravada e fica neste navegador, para você se ouvir. Com Groq em Ajustes, ela também é transcrita.'}
        </p>
      </Card>

      {playback && (
        <div>
          <p className="mb-1 text-sm font-medium">Ouça a sua última fala</p>
          <RecordingPlayer src={playback} />
        </div>
      )}

      {transcribing && (
        <p className="text-sm text-muted" role="status">
          Transcrevendo…
        </p>
      )}

      {speaking.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted" aria-live="polite">
            {speaking.length === 1 ? '1 fala registrada hoje' : `${speaking.length} falas registradas hoje`} · {formatDuration(total)} no
            total.
          </p>
          {speaking
            .filter((s) => s.transcript)
            .map((s) => (
              <Card key={s.id}>
                <Eyebrow>O que você disse · {formatDuration(s.durationSec)}</Eyebrow>
                <p className="mt-2 whitespace-pre-wrap font-serif text-lg leading-relaxed" lang="en">
                  {s.transcript}
                </p>
                <FluencyLine transcript={s.transcript ?? ''} durationSec={s.durationSec} chunks={chunks.map((c) => c.text)} />
                <AIFeedbackPanel
                  targetType="retell"
                  targetId={s.id}
                  text={s.transcript ?? ''}
                  context={feedbackContext}
                  kinds={['retell']}
                />
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
