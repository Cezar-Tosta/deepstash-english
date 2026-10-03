import { useEffect, useState } from 'react';
import {
  buildFlashcards,
  type Flashcard,
  type FlashSource,
  pickFlashcards,
  type StudyItem,
} from '../../domain/exercises';
import { recordPractice } from '../../services/maintenance';
import { stopSpeaking } from '../speech';
import { attempt } from '../toast';
import { ListenButton, ListenSettings } from './Listen';
import { Button, Card, EmptyState, Eyebrow, Prompt, Segmented, TextInput } from './ui';

const SOURCES: readonly { value: FlashSource; label: string }[] = [
  { value: 'both', label: 'Palavras e chunks' },
  { value: 'dictionary', label: 'Só palavras' },
  { value: 'chunks', label: 'Só chunks' },
];

const QUICK = [5, 10, 20] as const;
const DEFAULT_COUNT = 10;

/** Escolha do que estudar e de quantos flashcards entram na rodada. */
export function FlashcardSetup({ items, onStart }: { items: readonly StudyItem[]; onStart: (cards: Flashcard[]) => void }) {
  const [source, setSource] = useState<FlashSource>('both');
  const [count, setCount] = useState(String(DEFAULT_COUNT));
  const [hardFirst, setHardFirst] = useState(true);
  const available = buildFlashcards(items, source);
  const wanted = Math.min(available.length, Math.max(1, Number.parseInt(count, 10) || 1));

  const start = () => {
    const difficulty = new Map(items.map((i) => [i.key, i.difficulty]));
    onStart(pickFlashcards(available, wanted, hardFirst ? { difficulty } : {}));
  };

  return (
    <Card>
      <Prompt>Flashcards</Prompt>
      <p className="mt-1 text-sm text-muted">
        A expressão em inglês na frente; você tenta lembrar e vira o cartão para conferir.
      </p>
      <div className="mt-3 space-y-3">
        <Segmented label="O que entra nos flashcards" value={source} options={SOURCES} onChange={setSource} />
        {available.length === 0 ? (
          <EmptyState title="Ainda sem material.">
            Adicione palavras ao dicionário pela leitura ou escolha chunks nas sessões.
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <TextInput
                className="w-24"
                label="Quantos"
                type="number"
                inputMode="numeric"
                min={1}
                max={available.length}
                value={count}
                onChange={setCount}
              />
              {QUICK.filter((n) => n < available.length).map((n) => (
                <Button key={n} small variant="secondary" onClick={() => setCount(String(n))}>
                  {n}
                </Button>
              ))}
              <Button small variant="secondary" onClick={() => setCount(String(available.length))}>
                Todos ({available.length})
              </Button>
            </div>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-(--accent)" checked={hardFirst} onChange={(e) => setHardFirst(e.target.checked)} />
              Priorizar as que mais erro
            </label>
            <Button variant="secondary" onClick={start}>
              Começar com {wanted} {wanted === 1 ? 'flashcard' : 'flashcards'}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

/** Uma rodada: tentar lembrar, virar, dizer se sabia. As que faltaram podem ser repetidas. */
export function FlashcardRound({ cards, onExit }: { cards: Flashcard[]; onExit: () => void }) {
  const [deck, setDeck] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [missed, setMissed] = useState<Flashcard[]>([]);
  const current = deck[index];

  // Sair da rodada no meio de um áudio em loop não deve deixá-lo tocando.
  useEffect(() => stopSpeaking, []);

  const answer = (knew: boolean) => {
    stopSpeaking();
    if (!current) return;
    attempt(recordPractice(current.itemKey, knew));
    if (!knew) setMissed([...missed, current]);
    setFlipped(false);
    setIndex(index + 1);
  };

  if (!current) {
    const knew = deck.length - missed.length;
    return (
      <Card className="mx-auto max-w-2xl">
        <Eyebrow>Rodada concluída</Eyebrow>
        <p className="mt-2 text-xl">
          Você sabia {knew} de {deck.length}.
        </p>
        {missed.length > 0 && (
          <p className="mt-2 font-serif text-muted" lang="en">
            {missed.map((c) => c.front).join(' • ')}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {missed.length > 0 && (
            <Button
              onClick={() => {
                setDeck(missed);
                setMissed([]);
                setIndex(0);
              }}
            >
              Repetir as {missed.length} que faltaram
            </Button>
          )}
          <Button variant="secondary" onClick={onExit}>
            Voltar aos exercícios
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onExit} className="min-h-10 font-medium text-accent">
          ← Exercícios
        </button>
        <span className="text-muted">
          Flashcards · {index + 1} de {deck.length}
        </span>
      </div>

      <Card className="text-center">
        <Eyebrow>{current.source === 'chunks' ? 'Chunk' : 'Dicionário'}</Eyebrow>
        <p className="mt-6 font-serif text-3xl leading-tight break-words" lang="en">
          {current.front}
        </p>
        <p className="mb-4 min-h-6 text-muted">{current.phonetic}</p>
        <ListenButton text={current.front} />

        {flipped ? (
          <div className="mt-5 space-y-3 border-t border-line pt-5" aria-live="polite">
            <p className="text-xl">{current.back || 'Sem significado anotado.'}</p>
            {current.context && (
              <div>
                <p className="font-serif text-lg text-muted" lang="en">
                  “{current.context}”
                </p>
                <ListenButton text={current.context} label="Ouvir a frase" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="secondary" onClick={() => answer(false)}>
                Não sabia
              </Button>
              <Button onClick={() => answer(true)}>Sabia</Button>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <Button block onClick={() => setFlipped(true)}>
              VIRAR
            </Button>
          </div>
        )}
      </Card>

      <ListenSettings />
    </div>
  );
}
