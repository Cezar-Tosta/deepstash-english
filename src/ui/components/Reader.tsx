import { useLiveQuery } from 'dexie-react-hooks';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AIError } from '../../ai/AIProvider';
import { isAIConfigured, lookupMeaning } from '../../ai/feedback';
import { annotate, extendSelection, type Selection, selectionText, sentenceAround, type Token, tokenize } from '../../domain/reader';
import type { SourceCard } from '../../domain/types';
import { deleteChunk, updateChunk } from '../../services/sessions';
import {
  addToDictionary,
  deleteTerm,
  findChunks,
  findEntries,
  type GlossaryEntry,
  loadGlossary,
  updateDictionaryEntry,
} from '../../services/study';
import { useOnline, useSettings } from '../hooks';
import { attempt, showToast } from '../toast';
import { CardAnalysis } from './CardAnalysis';
import { ListenButton, ListenSettings } from './Listen';
import { InlineRich, RichText } from './RichText';
import { Button, Hint, TextArea, TextInput } from './ui';

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
          <span className="block font-semibold">{sense.meaning || 'Sem tradução anotada'}</span>
          {sense.explanation && (
            <span className="block opacity-90">
              <InlineRich text={sense.explanation} />
            </span>
          )}
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

/** O que já se sabe do termo clicado: uma entrada do dicionário ou um chunk. */
interface Known {
  kind: 'vocab' | 'chunk';
  id: string;
  term: string;
  meaning: string;
  explanation: string;
  phonetic: string;
  wordClass: string;
  /** Frase em que foi registrado. */
  context: string;
  /** Quantos registros o termo tem (um por frase, no dicionário). */
  count: number;
}

const sameText = (a: string | undefined, b: string): boolean => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Cards em sequência, com cada palavra clicável. Um clique escolhe a palavra; um
 * segundo clique, em outra palavra do mesmo card, estende até formar a expressão.
 *
 * Se o termo já está no dicionário ou é um chunk, o painel mostra o que foi salvo,
 * com Editar e Excluir. Excluir tira o termo de todos os textos em que ele aparecia
 * destacado. Se o termo é novo, o painel traz tradução e fonética no contexto.
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
  const [wordClass, setWordClass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** `view`: mostra o que está salvo. `edit`: altera o que está salvo. `new`: analisa nesta frase. */
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const tokens = picked ? (tokensByCard.get(picked.cardId) ?? []) : [];
  const term = picked ? selectionText(tokens, picked.selection) : '';
  const context = picked ? sentenceAround(tokens, picked.selection) : '';
  const aiReady = Boolean(settings && isAIConfigured(settings.ai));
  const wordCount = picked ? tokens.slice(picked.selection.start, picked.selection.end + 1).filter((t) => t.isWord).length : 0;

  // O dicionário tem preferência (e, nele, a entrada desta mesma frase); depois os chunks.
  const found = useLiveQuery(
    async () => (term ? { entries: await findEntries(term), chunks: await findChunks(term) } : { entries: [], chunks: [] }),
    [term],
  );
  const entry = found?.entries.find((e) => sameText(e.context, context)) ?? found?.entries[0];
  const chunk = found?.chunks[0];
  const known: Known | null = entry
    ? {
        kind: 'vocab',
        id: entry.id,
        term: entry.term,
        meaning: entry.meaning,
        explanation: entry.explanation ?? '',
        phonetic: entry.phonetic ?? '',
        wordClass: entry.wordClass ?? '',
        context: entry.context ?? '',
        count: found?.entries.length ?? 1,
      }
    : chunk
      ? {
          kind: 'chunk',
          id: chunk.id,
          term: chunk.text,
          meaning: chunk.meaning,
          explanation: '',
          phonetic: '',
          wordClass: '',
          context: chunk.originalSentence,
          count: 1,
        }
      : null;
  const showKnown = known !== null && mode !== 'new';
  const otherSentence = known !== null && known.context !== '' && !sameText(known.context, context);
  // Só consulta a IA quando não há nada salvo, ou quando o usuário pede a análise nesta frase.
  const needsLookup = term !== '' && found !== undefined && (known === null || mode === 'new');

  const pick = (cardId: string, index: number) => {
    const current = picked?.cardId === cardId ? picked.selection : null;
    const selection = extendSelection(current, index);
    setPicked(selection ? { cardId, selection } : null);
    setMeaning('');
    setExplanation('');
    setPhonetic('');
    setWordClass('');
    setError('');
    setMode('view');
    setConfirmingDelete(false);
  };

  // A análise aparece sozinha pouco depois do clique. Se a seleção mudar antes da
  // resposta chegar, a resposta antiga é descartada.
  useEffect(() => {
    if (!needsLookup || !aiReady || !online) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const result = await lookupMeaning(term, context);
        if (cancelled) return;
        setMeaning(result.meaning);
        setExplanation(result.explanation);
        setPhonetic(result.phonetic);
        setWordClass(result.wordClass);
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
  }, [needsLookup, term, context, aiReady, online]);

  const add = () => {
    attempt(
      addToDictionary({ ideaId, term, meaning, context, explanation, phonetic, wordClass }).then(() => {
        showToast(`"${term}" adicionado ao dicionário.`);
        setMode('view');
      }),
    );
  };

  const startEdit = () => {
    if (!known) return;
    setMeaning(known.meaning);
    setExplanation(known.explanation);
    setMode('edit');
    setConfirmingDelete(false);
  };

  const saveEdit = () => {
    if (!known) return;
    const saving =
      known.kind === 'chunk'
        ? updateChunk(known.id, { meaning: meaning.trim() })
        : updateDictionaryEntry(known.id, { meaning, explanation });
    attempt(
      saving.then(() => {
        showToast(known.kind === 'chunk' ? 'Chunk atualizado.' : 'Entrada atualizada.');
        setMode('view');
      }),
    );
  };

  // Excluir vale para o termo inteiro: ele deixa de aparecer destacado em todos os textos.
  const remove = () => {
    if (!known) return;
    const removing = known.kind === 'chunk' ? deleteChunk(known.id) : deleteTerm(known.term);
    attempt(
      Promise.resolve(removing).then(() => {
        showToast(`"${known.term}" excluído. O destaque saiu de todos os textos.`);
        setConfirmingDelete(false);
        setPicked(null);
      }),
    );
  };

  return (
    <div>
      <Hint>
        Clique em uma palavra para ver tradução e pronúncia. Para uma expressão, clique na primeira e depois na última palavra. O que está
        no seu dicionário ou nos seus chunks aparece sublinhado em todos os textos, de qualquer livro: passe o mouse para ver, clique para
        editar ou excluir.
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
            <CardAnalysis card={card} canAsk={aiReady && online} />
          </li>
        ))}
      </ol>

      {picked && term && (
        <div
          className="sticky bottom-20 z-30 mt-4 rounded-2xl border border-accent bg-surface p-4 shadow-lg md:bottom-4"
          role="region"
          aria-label="Tradução"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-serif text-xl break-words" lang="en">
              {term}
              {(showKnown ? known.phonetic : phonetic) && (
                <span className="ml-3 font-sans text-sm text-muted">{showKnown ? known.phonetic : phonetic}</span>
              )}
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
            {(showKnown ? known.wordClass : wordClass) && ` · ${showKnown ? known.wordClass : wordClass}`}
            {showKnown && (known.kind === 'chunk' ? ' · chunk seu' : ' · no dicionário')}
          </p>
          <p className="mt-1 text-sm text-muted" lang="en">
            “{context}”
          </p>

          {showKnown && mode === 'view' && (
            <div className="mt-3 space-y-3">
              <p className="text-lg">{known.meaning || 'Sem tradução anotada.'}</p>
              {known.explanation && <RichText text={known.explanation} className="text-sm" />}
              {otherSentence && (
                <p className="text-xs text-muted">
                  Registrado em outra frase: <span lang="en">“{known.context}”</span>
                </p>
              )}
              {confirmingDelete ? (
                <div role="alert" className="space-y-2 text-sm">
                  <p>
                    Excluir{' '}
                    <span className="font-serif" lang="en">
                      “{known.term}”
                    </span>
                    {known.kind === 'chunk'
                      ? ' dos seus chunks? O histórico de revisões dele também é apagado.'
                      : known.count > 1
                        ? ` do dicionário? Os ${known.count} registros deste termo serão apagados.`
                        : ' do dicionário?'}{' '}
                    O destaque some de todos os textos.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button small variant="danger" onClick={remove}>
                      Confirmar exclusão
                    </Button>
                    <Button small variant="ghost" onClick={() => setConfirmingDelete(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button small variant="secondary" onClick={startEdit}>
                    Editar
                  </Button>
                  <Button small variant="danger" onClick={() => setConfirmingDelete(true)}>
                    Excluir
                  </Button>
                  {otherSentence && aiReady && (
                    <Button
                      small
                      variant="ghost"
                      onClick={() => {
                        setMeaning('');
                        setExplanation('');
                        setPhonetic('');
                        setMode('new');
                      }}
                    >
                      Analisar nesta frase
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {showKnown && mode === 'edit' && (
            <div className="mt-3 space-y-3">
              <TextInput label="Tradução em português" value={meaning} onChange={setMeaning} autoComplete="off" />
              {known.kind === 'vocab' && <TextArea label="Explicação" value={explanation} onChange={setExplanation} rows={2} />}
              <div className="flex flex-wrap gap-2">
                <Button small disabled={!meaning.trim()} onClick={saveEdit}>
                  Salvar
                </Button>
                <Button small variant="ghost" onClick={() => setMode('view')}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {!showKnown && (
            <div className="mt-3 space-y-3">
              <TextInput
                label={wordCount > 1 ? 'Tradução da expressão (pode editar)' : 'Tradução em português (pode editar)'}
                value={meaning}
                onChange={setMeaning}
                autoComplete="off"
                placeholder={busy ? 'Analisando no contexto…' : aiReady ? 'Tradução' : 'Sem IA configurada: escreva você a tradução'}
              />
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              {explanation && <RichText text={explanation} className="text-sm" />}
              <div className="flex flex-wrap gap-2">
                <Button small variant="secondary" disabled={!meaning.trim()} onClick={add}>
                  Adicionar ao dicionário
                </Button>
                {known && (
                  <Button small variant="ghost" onClick={() => setMode('view')}>
                    Voltar ao que está salvo
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
