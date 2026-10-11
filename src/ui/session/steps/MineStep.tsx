import { type FormEvent, useState } from 'react';
import { looksLikeSingleWord, MAX_CHUNKS_PER_DAY } from '../../../domain/session';
import { ChunkLimitError } from '../../../services/errors';
import { addChunk, type ChunkInput, deleteChunk, replaceChunk, updateChunk } from '../../../services/sessions';
import { AutoTextArea, Button, Card, Eyebrow, Hint, Notice, TextArea, TextInput } from '../../components/ui';
import { attempt } from '../../toast';
import { type StepProps } from './shared';

// ---------- 5. MINE ----------

export function MineStep({ bundle }: StepProps) {
  const { session, ideas, chunks, ideaOfDay } = bundle;
  const [text, setText] = useState('');
  const [meaning, setMeaning] = useState('');
  const [original, setOriginal] = useState('');
  const [sourceId, setSourceId] = useState('');
  /** Chunk que ficou de fora por causa do limite, esperando o usuário escolher qual trocar. */
  const [overflow, setOverflow] = useState<ChunkInput | null>(null);
  const defaultSource = ideaOfDay?.idea.id ?? '';

  const reset = () => {
    setText('');
    setMeaning('');
    setOriginal('');
    setOverflow(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const input: ChunkInput = {
      text,
      meaning,
      originalSentence: original,
      sourceIdeaId: sourceId || defaultSource || null,
    };
    addChunk(session.id, input)
      .then(reset)
      .catch((error: unknown) => {
        if (error instanceof ChunkLimitError) setOverflow(input);
        else attempt(Promise.reject(error));
      });
  };

  return (
    <div className="space-y-5">
      <Notice>
        Escolha no texto de hoje. Prefira expressões reutilizáveis a palavras isoladas. Ex.: <em lang="en">one thing at a time</em>,{' '}
        <em lang="en">in your head</em>, <em lang="en">it turns out that</em>.
      </Notice>

      <div className="flex items-baseline justify-between">
        <Eyebrow>Chunks para aprender</Eyebrow>
        <p className="text-sm text-muted">
          {chunks.length}/{MAX_CHUNKS_PER_DAY}
        </p>
      </div>

      {chunks.map((chunk, i) => (
        <Card key={chunk.id}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-serif text-xl" lang="en">
              {i + 1}. {chunk.text}
            </p>
            <Button small variant="ghost" aria-label={`Remover ${chunk.text}`} onClick={() => attempt(deleteChunk(chunk.id))}>
              Remover
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            <AutoTextArea
              label="Significado"
              value={chunk.meaning}
              onSave={(value) => updateChunk(chunk.id, { meaning: value })}
              rows={1}
            />
            <AutoTextArea
              label="Frase original (contexto no texto)"
              value={chunk.originalSentence}
              onSave={(value) => updateChunk(chunk.id, { originalSentence: value })}
              rows={2}
              lang="en"
            />
          </div>
        </Card>
      ))}

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line p-4">
        <TextInput label="Nova expressão" value={text} onChange={setText} lang="en" autoComplete="off" placeholder="one thing at a time" />
        {text.trim() && looksLikeSingleWord(text) && (
          <Hint>Isto parece uma palavra isolada. Um bloco de duas ou mais palavras costuma ser mais reutilizável.</Hint>
        )}
        <TextInput label="Significado (depois de tentar deduzir)" value={meaning} onChange={setMeaning} autoComplete="off" />
        <TextArea label="Frase original" value={original} onChange={setOriginal} rows={2} lang="en" />
        {ideas.length > 1 && (
          <div>
            <label htmlFor="chunk-source" className="mb-1.5 block text-sm font-medium">
              Texto de origem
            </label>
            <select
              id="chunk-source"
              value={sourceId || defaultSource}
              onChange={(e) => setSourceId(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-line bg-paper px-3"
            >
              {!ideaOfDay && <option value="">Sem texto</option>}
              {ideas.map(({ idea }) => (
                <option key={idea.id} value={idea.id}>
                  {idea.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="secondary" block disabled={!text.trim()}>
          Adicionar chunk
        </Button>
      </form>

      {overflow && (
        <Notice tone="warn">
          <p className="font-medium">Você já selecionou três expressões hoje. Escolha quais realmente merecem entrar na revisão.</p>
          <p className="mt-2">
            Substituir por <em lang="en">{overflow.text}</em>:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {chunks.map((c) => (
              <Button key={c.id} small variant="secondary" onClick={() => attempt(replaceChunk(c.id, overflow).then(reset))}>
                {c.text}
              </Button>
            ))}
            <Button small variant="ghost" onClick={() => setOverflow(null)}>
              Manter as três
            </Button>
          </div>
        </Notice>
      )}
    </div>
  );
}
