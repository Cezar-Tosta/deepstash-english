import { type ChangeEvent, type ClipboardEvent, useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { readCardFromImage } from '../../ai/coach';
import { isAIConfigured } from '../../ai/feedback';
import type { SourceCard } from '../../domain/types';
import { addCards, deleteCard, type IdeaWithCards, splitIntoCards, updateCard } from '../../services/sessions';
import { useOnline, useSettings } from '../hooks';
import { attempt, showToast } from '../toast';
import { toImageInput } from './IdeaImport';
import { AutoTextArea, Button, Hint, Spinner, TextArea } from './ui';

const paragraphCount = (n: number): string => `${n} ${n === 1 ? 'parágrafo' : 'parágrafos'}`;
const onlyImages = (files: Iterable<File>): File[] => [...files].filter((f) => f.type.startsWith('image/'));
const aiMessage = (e: unknown): string => (e instanceof AIError ? e.message : 'Não foi possível ler a imagem.');

/** Botão que abre a escolha de imagens. Enquanto lê, mostra o ícone de andamento e o que está fazendo. */
function ImageButton({
  label,
  busyLabel,
  multiple,
  disabled,
  onFiles,
}: {
  label: string;
  /** Preenchido enquanto a leitura está em andamento. */
  busyLabel: string | null;
  multiple?: boolean;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = onlyImages(e.target.files ?? []);
    e.target.value = '';
    if (files.length > 0) onFiles(files);
  };
  const busy = busyLabel !== null;
  return (
    <label
      className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:bg-sunken ${
        busy ? 'pointer-events-none' : disabled ? 'pointer-events-none opacity-40' : ''
      }`}
    >
      {busy ? (
        <span className="inline-flex items-center gap-2" role="status">
          <Spinner /> {busyLabel}
        </span>
      ) : (
        label
      )}
      <input type="file" accept="image/*" multiple={multiple} className="sr-only" onChange={pick} disabled={busy || disabled} />
    </label>
  );
}

/** Um parágrafo: texto editável, e a opção de preenchê-lo a partir de uma imagem. */
function CardRow({ card, canRead }: { card: SourceCard; canRead: boolean }) {
  const [reading, setReading] = useState(false);
  const number = card.position + 1;

  const fill = async (file: File) => {
    setReading(true);
    try {
      await updateCard(card.id, await readCardFromImage(await toImageInput(file)));
    } catch (e) {
      showToast(aiMessage(e), 'error');
    } finally {
      setReading(false);
    }
  };

  return (
    <li>
      <AutoTextArea
        label={`Parágrafo ${number}`}
        value={card.content}
        onSave={(content) => updateCard(card.id, content)}
        rows={3}
        lang="en"
        placeholder="Texto do parágrafo."
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {canRead && (
          <ImageButton
            label={card.content.trim() ? 'Substituir pelo texto de uma imagem' : 'Ler de uma imagem'}
            busyLabel={reading ? `Lendo a imagem do parágrafo ${number}…` : null}
            disabled={false}
            onFiles={(files) => files[0] && void fill(files[0])}
          />
        )}
        <Button small variant="ghost" aria-label={`Remover parágrafo ${number}`} onClick={() => attempt(deleteCard(card.id))}>
          Remover parágrafo
        </Button>
      </div>
    </li>
  );
}

/**
 * Os parágrafos do texto, na ordem de leitura. Podem entrar digitados, colados ou
 * lidos de imagens pela IA: cada imagem vira um parágrafo, na ordem escolhida.
 */
export function CardSequence({ item }: { item: IdeaWithCards }) {
  const settings = useSettings();
  const online = useOnline();
  const [pasted, setPasted] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const blocks = splitIntoCards(pasted);
  const canRead = Boolean(settings && isAIConfigured(settings.ai)) && online;

  // Uma imagem por vez: cada parágrafo aparece assim que fica pronto e a ordem é preservada.
  const readAsCards = async (files: File[]) => {
    let failed = 0;
    setProgress({ done: 0, total: files.length });
    for (const [i, file] of files.entries()) {
      try {
        const text = await readCardFromImage(await toImageInput(file));
        await addCards(item.idea.id, [text]);
      } catch (e) {
        failed += 1;
        // Problema de configuração ou de rede vale para todas: não adianta insistir.
        if (i === 0) {
          showToast(aiMessage(e), 'error');
          break;
        }
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setProgress(null);
    if (failed > 0 && files.length > 1) {
      showToast(`${failed} de ${files.length} imagens não puderam ser lidas.`, 'error');
    }
  };

  // Ctrl+V com um screenshot na área de transferência vira um parágrafo novo.
  const onPaste = (e: ClipboardEvent) => {
    const files = onlyImages(e.clipboardData.files);
    if (canRead && files.length > 0 && !progress) {
      e.preventDefault();
      void readAsCards(files);
    }
  };

  return (
    <div className="space-y-3" onPaste={onPaste}>
      {item.cards.length > 0 && (
        <ol className="space-y-3">
          {item.cards.map((card) => (
            <CardRow key={card.id} card={card} canRead={canRead} />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button small variant="secondary" onClick={() => attempt(addCards(item.idea.id, ['']))}>
          + Parágrafo
        </Button>
        {canRead && (
          <ImageButton
            multiple
            label="+ Parágrafos a partir de imagens"
            busyLabel={progress ? `Lendo imagem ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…` : null}
            disabled={false}
            onFiles={(files) => void readAsCards(files)}
          />
        )}
      </div>
      {canRead && <Hint>Cada imagem vira um parágrafo, na ordem escolhida. Também dá para colar um screenshot com Ctrl+V.</Hint>}

      <TextArea
        label="Ou cole mais parágrafos"
        value={pasted}
        onChange={setPasted}
        rows={3}
        lang="en"
        placeholder="Um parágrafo por linha, ou separados por uma linha em branco."
      />
      {blocks.length > 0 && (
        <Button small variant="secondary" onClick={() => attempt(addCards(item.idea.id, blocks).then(() => setPasted('')))}>
          Adicionar {paragraphCount(blocks.length)}
        </Button>
      )}
    </div>
  );
}
