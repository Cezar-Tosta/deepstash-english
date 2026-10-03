import { useLiveQuery } from 'dexie-react-hooks';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { isAIConfigured, lookupMeaning } from '../../ai/feedback';
import {
  annotate,
  extendSelection,
  type Selection,
  selectionText,
  sentenceAround,
  type Token,
  tokenize,
} from '../../domain/reader';
import type { SourceCard } from '../../domain/types';
import { addToDictionary, findInDictionary, type GlossaryEntry, loadGlossary } from '../../services/study';
import { useOnline, useSettings } from '../hooks';
import { attempt, showToast } from '../toast';
import { ListenButton, ListenSettings } from './Listen';
import { Button, Hint, TextInput } from './ui';

/** Espera o usuário terminar de escolher a expressão antes de consultar a IA. */
const LOOKUP_DELAY_MS = 600;
const MAX_SENSES = 3;

const UNDERLINE = 'underline decoration-accent decoration-dotted decoration-2 underline-offset-4';

/** Balão com o que já se sabe do termo: tradução, fonética, explicação e a frase de origem. */
function Gloss({ entry }: { entry: GlossaryEntry }) {
  const phonetic = entry.senses.find((s) => s.phonetic)?.phonetic;
  return (
    <span
      role="tooltip"
      className="pointer-events-none fixed inset-x-4 top-4 z-40 hidden rounded-xl md:absolute md:inset-x-auto md:top-full md:left-0 md:z-20 md:mt-1 md:w-72 bg-ink p-3 text-left font-sans text-sm leading-snug font-normal whitespace-normal text-paper no-underline shadow-lg group-focus-within:block group-hover:block"
    >
      <span className="block font-serif text-base">
        {entry.term}
        {phonetic && <span className="ml-2 font-sans text-xs opacity-80">{phonetic}</span>}
      </span>
      {entry.senses.slice(0, MAX_SENSES).map((sense, i) => (
        <span key={i} className="mt-2 block border-t border-paper/20 pt-2">
          <span className="block font-semibold">{sense.meaning}</span>
          {sense.explanation && <span className="block opacity-90">{sense.explanation}</span>}
          {sense.context && (
            <span className="mt-1 block text-xs italic opacity-75" lang="en">
              “{sense.context}”
            </span>
          )}
          <span className="mt-1 block text-[10px] tracking-wide uppercase opacity-60">
            {sense.source === 'chunk' ? 'Chunk' : 'Dicionário'}
          </span>
        </span>
      ))}
      {entry.senses.length > MAX_SENSES && (
        <span className="mt-2 block text-xs opacity-75">+ {entry.senses.length - MAX_SENSES} sentido(s) no dicionário</span>
      )}
    </span>
  );
}

interface GlossedTextProps {
  tokens: readonly Token[];
  glossary: readonly GlossaryEntry[];
  selection?: Selection | null | undefined;
  /** Com `onPick`, cada palavra vira um botão; sem ele, o texto é só leitura. */
  onPick?: ((index: number) => void) | undefined;
}

/**
 * Texto em que as palavras e expressões já conhecidas (dicionário e chunks de
 * qualquer ideia) aparecem sublinhadas, com as informações ao passar o mouse ou focar.
 */
export function GlossedText({ tokens, glossary, selection, onPick }: GlossedTextProps) {
  const annotations = useMemo(() => annotate(tokens, glossary), [tokens, glossary]);

  const word = (token: Token, index: number, underlined: boolean): ReactNode => {
    const selected = Boolean(selection && index >= selection.start && index <= selection.end);
    const look = selected ? 'bg-accent text-accent-ink' : underlined ? UNDERLINE : '';
    if (!onPick) {
      return (
        <span key={index} className={look}>
          {token.text}
        </span>
      );
    }
    return (
      <button
        key={index}
        type="button"
        aria-pressed={selected}
        onClick={() => onPick(index)}
        className={`rounded ${look} ${selected ? '' : 'hover:bg-accent-soft'}`}
      >
        {token.text}
      </button>
    );
  };

  const nodes: ReactNode[] = [];
  let next = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    const annotation = annotations[next];
    if (annotation?.start === i) {
      const inside: ReactNode[] = [];
      for (let k = annotation.start; k <= annotation.end; k += 1) {
        const t = tokens[k];
        if (!t) continue;
        inside.push(
          t.isWord ? (
            word(t, k, true)
          ) : (
            <span key={k} className={UNDERLINE}>
              {t.text}
            </span>
          ),
        );
      }
      nodes.push(
        // tabIndex no modo leitura: o balão também abre pelo teclado.
        <span key={`g${i}`} className="group relative" tabIndex={onPick ? undefined : 0}>
          {inside}
          <Gloss entry={annotation.entry} />
        </span>,
      );
      i = annotation.end;
      next += 1;
    } else {
      nodes.push(token.isWord ? word(token, i, false) : <span key={i}>{token.text}</span>);
    }
  }
  return <>{nodes}</>;
}

/** Um texto só para leitura, com os termos conhecidos sublinhados. */
export function GlossedParagraph({ text, className }: { text: string; className?: string }) {
  const glossary = useLiveQuery(loadGlossary, []);
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <p className={className} lang="en">
      <GlossedText tokens={tokens} glossary={glossary ?? []} />
    </p>
  );
}

interface Picked {
  cardId: string;
  selection: Selection;
}

/**
 * Cards em sequência, com cada palavra clicável. Um clique escolhe a palavra e já
 * traz tradução e fonética no contexto; um segundo clique, em outra palavra do
 * mesmo card, estende até formar a expressão. A tradução vem num campo editável.
 */
export function Reader({ ideaId, cards }: { ideaId: string; cards: readonly SourceCard[] }) {
  const settings = useSettings();
  const online = useOnline();
  const glossary = useLiveQuery(loadGlossary, []);
  const tokensByCard = useMemo(() => new Map(cards.map((c) => [c.id, tokenize(c.content)])), [cards]);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [meaning, setMeaning] = useState('');
  const [explanation, setExplanation] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tokens = picked ? (tokensByCard.get(picked.cardId) ?? []) : [];
  const term = picked ? selectionText(tokens, picked.selection) : '';
  const context = picked ? sentenceAround(tokens, picked.selection) : '';
  const aiReady = Boolean(settings && isAIConfigured(settings.ai));
  const wordCount = picked ? tokens.slice(picked.selection.start, picked.selection.end + 1).filter((t) => t.isWord).length : 0;

  const pick = (cardId: string, index: number) => {
    const current = picked?.cardId === cardId ? picked.selection : null;
    const selection = extendSelection(current, index);
    setPicked(selection ? { cardId, selection } : null);
    setMeaning('');
    setExplanation('');
    setPhonetic('');
    setError('');
  };

  // A análise aparece sozinha pouco depois do clique. Se a seleção mudar antes da
  // resposta chegar, a resposta antiga é descartada.
  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        // Só reaproveita o que foi salvo para esta mesma frase: em outro contexto
        // o sentido pode ser outro, então a análise é refeita.
        const existing = await findInDictionary(term, context);
        const result = existing
          ? { meaning: existing.meaning, explanation: existing.explanation ?? '', phonetic: existing.phonetic ?? '' }
          : aiReady && online
            ? await lookupMeaning(term, context)
            : null;
        if (cancelled || !result) return;
        setMeaning(result.meaning);
        setExplanation(result.explanation);
        setPhonetic(result.phonetic);
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
      addToDictionary({ ideaId, term, meaning, context, explanation, phonetic }).then(() => {
        showToast(`"${term}" adicionado ao dicionário.`);
        setPicked(null);
      }),
    );
  };

  return (
    <div>
      <Hint>
        Clique em uma palavra para ver tradução e pronúncia. Para uma expressão, clique na primeira e depois na última
        palavra. O que já está no dicionário ou nos chunks aparece sublinhado: passe o mouse para ver.
      </Hint>
      <div className="mt-2">
        <ListenSettings />
      </div>
      <ol className="mt-3 space-y-3">
        {cards.map((card) => (
          <li key={card.id} className="border-l-2 border-line pl-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">Card {card.position + 1}</p>
              <ListenButton text={card.content} />
            </div>
            <p className="whitespace-pre-wrap font-serif text-lg leading-loose" lang="en">
              <GlossedText
                tokens={tokensByCard.get(card.id) ?? []}
                glossary={glossary ?? []}
                selection={picked?.cardId === card.id ? picked.selection : null}
                onPick={(index) => pick(card.id, index)}
              />
            </p>
          </li>
        ))}
      </ol>

      {picked && term && (
        <div className="sticky bottom-20 z-30 mt-4 rounded-2xl border border-accent bg-surface p-4 shadow-lg md:bottom-4" role="region" aria-label="Tradução">
          <div className="flex items-start justify-between gap-3">
            <p className="font-serif text-xl" lang="en">
              {term}
              {phonetic && <span className="ml-3 font-sans text-sm text-muted">{phonetic}</span>}
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <ListenButton text={term} />
              <Button small variant="ghost" onClick={() => setPicked(null)}>
                Fechar
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs font-semibold tracking-wide text-accent uppercase">
            {wordCount > 1 ? `Expressão · ${wordCount} palavras, analisadas em conjunto` : 'Palavra'}
          </p>
          <p className="mt-1 text-sm text-muted" lang="en">
            “{context}”
          </p>

          <div className="mt-3 space-y-3">
            <TextInput
              label={wordCount > 1 ? 'Tradução da expressão (pode editar)' : 'Tradução em português (pode editar)'}
              value={meaning}
              onChange={setMeaning}
              autoComplete="off"
              placeholder={
                busy ? 'Analisando no contexto…' : aiReady ? 'Tradução' : 'Sem IA configurada: escreva você a tradução'
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
