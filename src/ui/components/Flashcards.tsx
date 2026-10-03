import { useEffect, useState } from 'react';
import {
  buildFlashcards,
  type Flashcard,
  type FlashSource,
  pickFlashcards,
  type PracticeMaterial,
} from '../../domain/exercises';
import { stopSpeaking } from '../speech';
import { ListenButton, ListenSettings } from './Listen';
import { Button, Card, EmptyState, Eyebrow, Prompt, Segmented, TextInput } from './ui';

const SOURCES: readonly { value: FlashSource; label: string }[] = [
  { value: 'both', label: 'Palavras e chunks' },
  { value: 'dictionary', label: 'Só palavras do dicionário' },
  { value: 'chunks', label: 'Só chunks' },
];

const QUICK = [5, 10, 20] as const;
const DEFAULT_COUNT = 10;

/** Escolha do que estudar e de quantos flashcards entram na rodada. */
export function FlashcardSetup({ material, onStart }: { material: PracticeMaterial; onStart: (cards: Flashcard[]) => void }) {
  const [source, setSource] = useState<FlashSource>('both');
  const [count, setCount] = useState(String(DEFAULT_COUNT));
  const available = buildFlashcards(material, source);
  const wanted = Math.min(available.length, Math.max(1, Number.parseInt(count, 10) || 1));

  return (
    <Card>
      <Prompt>Flashcards</Prompt>
      <p className="mt-1 text-sm text-muted">
        A expressão em inglês na frente; você tenta lembrar e vira o cartão para conferir.
      </p>
      <div className="mt-4 space-y-4">
        <Segmented label="O que entra nos flashcards" value={source} options={SOURCES} onChange={setSource} />
        {available.length === 0 ? (
          <EmptyState title="Ainda sem material.">
            Adicione palavras ao dicionário pela leitura ou escolha chunks nas sessões, com o significado anotado.
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <TextInput
                className="w-28"
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
            <Button onClick={() => onStart(pickFlashcards(available, wanted))}>
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
    if (!knew && current) setMissed([...missed, current]);
    setFlipped(false);
    setIndex(index + 1);
  };

  if (!current) {
    const knew = deck.length - missed.length;
    return (
      <Card>
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
    <div className="space-y-4">
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
        <p className="my-8 font-serif text-3xl leading-tight" lang="en">
          {current.front}
        </p>
        <ListenButton text={current.front} />

        {flipped ? (
          <div className="mt-6 space-y-3 border-t border-line pt-6" aria-live="polite">
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
          <div className="mt-6">
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
