import { type ReactNode, useState } from 'react';
import type { ComprehensionVocab } from '../../domain/types';
import { deleteVocab } from '../../services/sessions';
import { findEntries } from '../../services/study';
import { attempt, showToast } from '../toast';
import { ListenButton } from './Listen';
import { RichText } from './RichText';
import { Button } from './ui';

/** Excluir do dicionário, sempre em dois passos: pedir e confirmar. */
export function DeleteEntry({ entry }: { entry: ComprehensionVocab }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button small variant="danger" aria-label={`Excluir ${entry.term} do dicionário`} onClick={() => setConfirming(true)}>
        Excluir
      </Button>
    );
  }
  return (
    <span role="alert" className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span>
        Excluir{' '}
        <span className="font-serif" lang="en">
          “{entry.term}”
        </span>{' '}
        do dicionário?
      </span>
      <Button
        small
        variant="danger"
        onClick={() =>
          attempt(
            deleteVocab(entry.id)
              .then(() => findEntries(entry.term))
              .then((rest) =>
                showToast(
                  rest.length > 0
                    ? `Registro excluído. "${entry.term}" continua no dicionário por outra frase.`
                    : `"${entry.term}" excluído. O destaque saiu de todos os textos.`,
                ),
              ),
          )
        }
      >
        Confirmar exclusão
      </Button>
      <Button small variant="ghost" onClick={() => setConfirming(false)}>
        Cancelar
      </Button>
    </span>
  );
}

/** Um termo em uma linha; clicar abre o contexto, a explicação e as ações. */
export function DictionaryRow({ entry, footer }: { entry: ComprehensionVocab; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const words = entry.term.trim().split(/\s+/).length;

  return (
    <li className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full flex-wrap items-baseline gap-x-2 px-3 py-1.5 text-left"
      >
        <span className="font-serif break-words" lang="en">
          {entry.term}
        </span>
        {entry.phonetic && <span className="text-xs text-muted">{entry.phonetic}</span>}
        {entry.meaning && <span className="text-sm text-muted">— {entry.meaning}</span>}
      </button>

      {open && (
        <div className="space-y-2 border-t border-line px-3 py-3 text-sm">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {words > 1 ? `Expressão · ${words} palavras` : 'Palavra'}
            {entry.wordClass && ` · ${entry.wordClass}`}
          </p>
          {entry.context && (
            <p className="font-serif text-base text-muted break-words" lang="en">
              “{entry.context}”
            </p>
          )}
          {entry.explanation && <RichText text={entry.explanation} />}
          <div className="flex flex-wrap items-center gap-3">
            <ListenButton text={entry.context ? `${entry.term}. ${entry.context}` : entry.term} />
            <DeleteEntry entry={entry} />
          </div>
          {footer}
        </div>
      )}
    </li>
  );
}

/** O dicionário de uma ideia: clicar num item mostra o contexto e permite excluí-lo. */
export function IdeaDictionary({ entries }: { entries: readonly ComprehensionVocab[] }) {
  return (
    <ul className="space-y-1.5">
      {entries.map((entry) => (
        <DictionaryRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}
