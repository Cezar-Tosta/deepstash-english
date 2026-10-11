import { useState } from 'react';
import type { Chunk } from '../../../domain/types';
import { addChunkSentence, chunksToPractice, updateChunk } from '../../../services/sessions';
import { sentenceTarget } from '../../../domain/feedback';
import { AIFeedbackPanel } from '../../components/AIFeedbackPanel';
import { AutoTextArea, Button, Card, EmptyState, Eyebrow, Hint, Prompt, TextArea } from '../../components/ui';
import { attempt } from '../../toast';
import { type StepProps } from './shared';

// ---------- 8. PERSONALIZE ----------

/** Um chunk de dias anteriores, para escrever mais uma frase com ele. */
function ExtraChunk({ chunk }: { chunk: Chunk }) {
  const [sentence, setSentence] = useState('');
  const [saved, setSaved] = useState('');
  const previous = [chunk.userSentence, ...(chunk.extraSentences ?? [])].filter((s) => s.trim());

  const keep = () => {
    const text = sentence.trim();
    if (!text) return;
    attempt(
      addChunkSentence(chunk.id, text).then(() => {
        setSaved(text);
        setSentence('');
      }),
    );
  };

  return (
    <Card>
      <p className="font-serif text-lg break-words" lang="en">
        {chunk.text}
        {chunk.meaning && <span className="font-sans text-sm text-muted"> — {chunk.meaning}</span>}
      </p>
      {previous.length > 0 && (
        <details className="mt-1 text-sm">
          <summary className="min-h-8 cursor-pointer text-xs font-medium text-accent">
            {previous.length === 1 ? 'Ver a frase que já escrevi' : `Ver as ${previous.length} frases que já escrevi`}
          </summary>
          <ul className="space-y-1 font-serif text-muted" lang="en">
            {previous.map((s) => (
              <li key={s} className="break-words">
                “{s}”
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-2 space-y-2">
        <TextArea label="Uma frase nova, sobre outra situação" value={sentence} onChange={setSentence} rows={2} lang="en" />
        <Button small variant="secondary" disabled={!sentence.trim()} onClick={keep}>
          Guardar frase
        </Button>
        {saved && (
          <>
            <p className="text-sm text-good">Frase guardada.</p>
            <AIFeedbackPanel
              targetType="chunkSentence"
              targetId={sentenceTarget(chunk.id, saved, chunk.userSentence)}
              text={saved}
              context={`O aluno está praticando a expressão "${chunk.text}".`}
            />
          </>
        )}
      </div>
    </Card>
  );
}

const EXTRA_BATCH = 3;

/** Depois dos chunks de hoje, mais chunks antigos para continuar treinando, de três em três. */
function MoreChunks({ sessionId }: { sessionId: string }) {
  const [shown, setShown] = useState<Chunk[]>([]);
  const [exhausted, setExhausted] = useState(false);

  const more = async () => {
    const next = await chunksToPractice(
      sessionId,
      EXTRA_BATCH,
      shown.map((c) => c.id),
    );
    setShown([...shown, ...next]);
    setExhausted(next.length < EXTRA_BATCH);
  };

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div>
        <Eyebrow>Treinar com mais chunks</Eyebrow>
        <Hint>Chunks de dias anteriores, começando pelos que você mais esquece nas revisões. É opcional.</Hint>
      </div>
      {shown.map((chunk) => (
        <ExtraChunk key={chunk.id} chunk={chunk} />
      ))}
      {exhausted ? (
        <Hint>{shown.length === 0 ? 'Ainda não há chunks de dias anteriores.' : 'Esses são todos os seus chunks anteriores.'}</Hint>
      ) : (
        <Button variant="secondary" onClick={() => attempt(more())}>
          {shown.length === 0 ? `Trazer ${EXTRA_BATCH} chunks anteriores` : `Mais ${EXTRA_BATCH} chunks`}
        </Button>
      )}
    </div>
  );
}

export function PersonalizeStep({ bundle, goTo }: StepProps) {
  const { session, chunks } = bundle;
  return (
    <div className="space-y-5">
      <div>
        <Prompt>Create your own sentence.</Prompt>
        <Hint>Relacione a frase ao seu trabalho, estudo, rotina ou experiência.</Hint>
      </div>
      {chunks.length === 0 && (
        <EmptyState title="Nenhum chunk selecionado hoje.">
          <Button onClick={() => goTo('mine')}>Escolher chunks</Button>
        </EmptyState>
      )}
      {chunks.map((chunk) => (
        <Card key={chunk.id}>
          <p className="font-serif text-xl uppercase tracking-wide" lang="en">
            {chunk.text}
          </p>
          <div className="mt-3">
            <AutoTextArea
              label="Minha frase"
              value={chunk.userSentence}
              onSave={(userSentence) => updateChunk(chunk.id, { userSentence })}
              rows={2}
              lang="en"
            />
            <AIFeedbackPanel
              targetType="chunkSentence"
              targetId={chunk.id}
              text={chunk.userSentence}
              context={`O aluno está praticando a expressão "${chunk.text}".`}
            />
          </div>
        </Card>
      ))}
      <MoreChunks sessionId={session.id} />
    </div>
  );
}
