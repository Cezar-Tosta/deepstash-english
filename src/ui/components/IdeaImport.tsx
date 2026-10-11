import { type ChangeEvent, type ClipboardEvent, useState } from 'react';
import { AIError, type ImageInput } from '../../ai/AIProvider';
import { importIdeaFromImages } from '../../ai/coach';
import { isAIConfigured } from '../../ai/feedback';
import type { ImportedIdea } from '../../domain/ideaImport';
import { useOnline, useSettings } from '../hooks';
import { Hint, Spinner } from './ui';

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

export { toImageInput };

/**
 * Lê fotos ou screenshots do texto com a IA: título e parágrafos voltam para o
 * formulário, para o usuário conferir antes de salvar.
 */
export function IdeaImport({ onImported }: { onImported: (idea: ImportedIdea) => void }) {
  const settings = useSettings();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const aiReady = Boolean(settings && isAIConfigured(settings.ai));

  const readImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setBusy(true);
    setProgress(`0 de ${images.length}`);
    setError('');
    try {
      const inputs = await Promise.all(images.map(toImageInput));
      onImported(await importIdeaFromImages(inputs, (done, total) => setProgress(`${done} de ${total}`)));
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

  if (!aiReady) return <Hint>Com a IA configurada em Ajustes, também dá para trazer o texto de fotos ou screenshots.</Hint>;

  return (
    <div className="space-y-2" onPaste={onPaste}>
      <label
        className={`inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:bg-sunken ${
          busy ? 'pointer-events-none' : !online ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        {busy ? (
          <span className="inline-flex items-center gap-2" role="status">
            <Spinner /> Lendo as imagens… {progress}
          </span>
        ) : (
          'Ler o texto de fotos ou screenshots'
        )}
        <input type="file" accept="image/*" multiple className="sr-only" onChange={onPick} disabled={busy || !online} />
      </label>
      <Hint>Escolha as imagens, quantas forem, ou cole com Ctrl+V. A IA transcreve título e parágrafos; confira antes de salvar.</Hint>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
