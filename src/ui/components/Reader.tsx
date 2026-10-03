import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { isAIConfigured, lookupMeaning } from '../../ai/feedback';
import { db } from '../../data/db';
import { extendSelection, type Selection, selectionText, sentenceAround, tokenize } from '../../domain/reader';
import type { SourceCard } from '../../domain/types';
import { addToDictionary, findInDictionary } from '../../services/study';
import { useOnline, useSettings } from '../hooks';
import { attempt, showToast } from '../toast';
import { ListenButton, ListenSettings } from './Listen';
import { Button, Hint, TextInput } from './ui';

interface Picked {
  cardId: string;
  selection: Selection;
}

/** Espera o usuário terminar de escolher a expressão antes de consultar a IA. */
const LOOKUP_DELAY_MS = 600;

/**
 * Cards em sequência, com cada palavra clicável. Um clique escolhe a palavra e já
 * traz a tradução no contexto; um segundo clique, em outra palavra do mesmo card,
 * estende até formar a expressão. A tradução vem num campo editável.
 */
export function Reader({ ideaId, cards }: { ideaId: string; cards: readonly SourceCard[] }) {
  const settings = useSettings();
  const online = useOnline();
  const saved = useLiveQuery(() => db.vocab.where('ideaId').equals(ideaId).toArray(), [ideaId]);
  const tokensByCard = useMemo(() => new Map(cards.map((c) => [c.id, tokenize(c.content)])), [cards]);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [meaning, setMeaning] = useState('');
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tokens = picked ? (tokensByCard.get(picked.cardId) ?? []) : [];
  const term = picked ? selectionText(tokens, picked.selection) : '';
  const context = picked ? sentenceAround(tokens, picked.selection) : '';
  const known = new Set((saved ?? []).map((v) => v.term.toLowerCase()));
  const aiReady = Boolean(settings && isAIConfigured(settings.ai));

  const pick = (cardId: string, index: number) => {
    const current = picked?.cardId === cardId ? picked.selection : null;
    const selection = extendSelection(current, index);
    setPicked(selection ? { cardId, selection } : null);
    setMeaning('');
    setExplanation('');
    setError('');
  };

  // A tradução aparece sozinha pouco depois do clique. Se a seleção mudar antes
  // da resposta chegar, a resposta antiga é descartada.
  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        // O que já foi consultado antes sai do dicionário, sem chamar a IA de novo.
        const existing = await findInDictionary(term);
        const result = existing
          ? { meaning: existing.meaning, explanation: existing.explanation ?? '' }
          : aiReady && online
            ? await lookupMeaning(term, context)
            : null;
        if (cancelled || !result) return;
        setMeaning(result.meaning);
        setExplanation(result.explanation);
      } catch (e) {
        if (!cancelled) setError(e instanceof AIError ? e.message : 'Não foi possível buscar a tradução.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setBusy(false);
    };
  }, [term, context, aiReady, online]);

  const save = () => {
    attempt(
      addToDictionary({ ideaId, term, meaning, context, explanation }).then(() => {
        showToast(`"${term}" adicionado ao dicionário.`);
        setPicked(null);
      }),
    );
  };

  return (
    <div>
      <Hint>
        Clique em uma palavra para ver a tradução. Para uma expressão, clique na primeira e depois na última palavra.
      </Hint>
      <div className="mt-2">
        <ListenSettings />
      </div>
      <ol className="mt-3 space-y-4">
        {cards.map((card) => (
          <li key={card.id} className="border-l-2 border-line pl-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">Card {card.position + 1}</p>
              <ListenButton text={card.content} />
            </div>
            <p className="whitespace-pre-wrap font-serif text-lg leading-loose" lang="en">
              {(tokensByCard.get(card.id) ?? []).map((token, index) => {
                if (!token.isWord) return <span key={index}>{token.text}</span>;
                const selected =
                  picked?.cardId === card.id && index >= picked.selection.start && index <= picked.selection.end;
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pick(card.id, index)}
                    className={`rounded ${
                      selected
                        ? 'bg-accent text-accent-ink'
                        : known.has(token.text.toLowerCase())
                          ? 'underline decoration-dotted underline-offset-4 hover:bg-accent-soft'
                          : 'hover:bg-accent-soft'
                    }`}
                  >
                    {token.text}
                  </button>
                );
              })}
            </p>
          </li>
        ))}
      </ol>

      {picked && term && (
        <div className="sticky bottom-20 z-30 mt-4 rounded-2xl border border-accent bg-surface p-4 shadow-lg md:bottom-4" role="region" aria-label="Tradução">
          <div className="flex items-start justify-between gap-3">
            <p className="font-serif text-xl" lang="en">
              {term}
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <ListenButton text={term} />
              <Button small variant="ghost" onClick={() => setPicked(null)}>
                Fechar
              </Button>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted" lang="en">
            “{context}”
          </p>

          <div className="mt-3 space-y-3">
            <TextInput
              label="Tradução em português (pode editar)"
              value={meaning}
              onChange={setMeaning}
              autoComplete="off"
              placeholder={
                busy
                  ? 'Buscando a tradução…'
                  : aiReady
                    ? 'Tradução'
                    : 'Sem IA configurada: escreva você a tradução'
              }
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {explanation && <p className="text-sm leading-relaxed">{explanation}</p>}
            <Button small variant="secondary" disabled={!meaning.trim()} onClick={save}>
              Adicionar ao dicionário
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
