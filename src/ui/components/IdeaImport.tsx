import { type ChangeEvent, type ClipboardEvent, useState } from 'react';
import { AIError, type ImageInput } from '../../ai/AIProvider';
import { importIdeaFromImages } from '../../ai/coach';
import { isAIConfigured } from '../../ai/feedback';
import { type ImportedIdea, parseIdeaText } from '../../domain/ideaImport';
import { useOnline, useSettings } from '../hooks';
import { Button, Hint, TextArea } from './ui';

const MAX_IMAGES = 8;

function toImageInput(file: File): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const [, base64 = ''] = String(reader.result).split(',');
      resolve({ mediaType: file.type || 'image/png', base64 });
    });
    reader.addEventListener('error', () => reject(new Error('Não foi possível ler a imagem.')));
    reader.readAsDataURL(file);
  });
}

/**
 * Duas formas rápidas de cadastrar uma ideia inteira: colar o texto (a primeira
 * linha é o título, cada bloco é um card) ou mandar screenshots para a IA transcrever.
 * O resultado volta para o formulário, para o usuário conferir antes de salvar.
 */
export function IdeaImport({ onImported }: { onImported: (idea: ImportedIdea) => void }) {
  const settings = useSettings();
  const online = useOnline();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const aiReady = Boolean(settings && isAIConfigured(settings.ai));
  const parsed = parseIdeaText(text);

  const readImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGES);
    if (images.length === 0) return;
    setBusy(true);
    setError('');
    try {
      onImported(await importIdeaFromImages(await Promise.all(images.map(toImageInput))));
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Não foi possível ler as imagens.');
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    void readImages(files);
  };

  // Ctrl+V com um screenshot na área de transferência manda a imagem direto para a IA.
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files];
    if (aiReady && files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault();
      void readImages(files);
    }
  };

  return (
    <div className="space-y-3" onPaste={onPaste}>
      <TextArea
        label="Colar a ideia inteira"
        value={text}
        onChange={setText}
        rows={5}
        lang="en"
        placeholder={'Título da ideia\n\nTexto do card 1\n\nTexto do card 2'}
      />
      <Hint>A primeira linha vira o título; cada bloco separado por uma linha em branco vira um card.</Hint>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          small
          variant="secondary"
          disabled={!parsed.title}
          onClick={() => {
            onImported(parsed);
            setText('');
          }}
        >
          Usar este texto{parsed.cards.length > 0 && ` (${parsed.cards.length} ${parsed.cards.length === 1 ? 'card' : 'cards'})`}
        </Button>
        {aiReady && (
          <label
            className={`inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:bg-sunken ${
              busy || !online ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            {busy ? 'Lendo as imagens…' : 'Ler screenshots com a IA'}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={onPick} disabled={busy || !online} />
          </label>
        )}
      </div>
      {aiReady ? (
        <Hint>
          Screenshots: escolha as imagens ou cole com Ctrl+V (até {MAX_IMAGES}). A IA transcreve título e cards; confira
          antes de salvar.
        </Hint>
      ) : (
        <Hint>Com a IA configurada em Ajustes, também dá para importar a partir de screenshots dos cards.</Hint>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
