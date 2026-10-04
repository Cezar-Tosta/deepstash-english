import { type FormEvent, useEffect, useState } from 'react';
import {
  buildDictations,
  checkDictation,
  type Dictation,
  DICTATION_PASS,
  dictationItems,
  type FlashSource,
  locateTerm,
  type StudyItem,
  type TermsPerAudio,
} from '../../domain/exercises';
import { recordPractice } from '../../services/maintenance';
import { speak, stopSpeaking } from '../speech';
import { attempt } from '../toast';
import { ListenButton, ListenSettings } from './Listen';
import { SentenceTranslation } from './SentenceTranslation';
import { Button, Card, EmptyState, Eyebrow, Prompt, Segmented, TextArea, TextInput } from './ui';

const SOURCES: readonly { value: FlashSource; label: string }[] = [
  { value: 'both', label: 'Palavras e chunks' },
  { value: 'dictionary', label: 'Só palavras' },
  { value: 'chunks', label: 'Só chunks' },
];

const PER_AUDIO: readonly { value: `${TermsPerAudio}`; label: string }[] = [
  { value: '1', label: 'Uma' },
  { value: '2', label: 'Duas' },
  { value: '3', label: 'Três' },
];

const DEFAULT_COUNT = 5;
const QUICK = [5, 10] as const;

/** Escolha do ditado: de onde vêm os termos, quantos por áudio e quantos ditados. */
export function DictationSetup({ items, onStart }: { items: readonly StudyItem[]; onStart: (round: Dictation[]) => void }) {
  const [source, setSource] = useState<FlashSource>('both');
  const [perAudio, setPerAudio] = useState<TermsPerAudio>(1);
  const [count, setCount] = useState(String(DEFAULT_COUNT));
  const usable = dictationItems(items, source).length;
  const possible = Math.ceil(usable / perAudio);
  const wanted = Math.min(possible, Math.max(1, Number.parseInt(count, 10) || 1));

  return (
    <Card>
      <Prompt>Ditado</Prompt>
      <p className="mt-1 text-sm text-muted">
        Você ouve a frase em que a palavra ou o chunk aparece e escreve o que ouviu. Só as palavras contam: maiúsculas e pontuação não
        entram na correção. Escolha quantos termos entram em cada áudio: com dois ou três, as frases são ditas em sequência.
      </p>
      <div className="mt-3 space-y-3">
        <Segmented label="O que entra no ditado" value={source} options={SOURCES} onChange={setSource} />
        {usable === 0 ? (
          <EmptyState title="Ainda sem material.">
            O ditado usa frases curtas em que o termo aparece. Adicione palavras ao dicionário ou chunks com a frase original.
          </EmptyState>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-sm font-medium">Palavras ou chunks por áudio</p>
              <Segmented
                label="Palavras ou chunks por áudio"
                value={String(perAudio) as `${TermsPerAudio}`}
                options={PER_AUDIO}
                onChange={(next) => setPerAudio(Number(next) as TermsPerAudio)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <TextInput
                className="w-24"
                label="Número de ditados"
                type="number"
                inputMode="numeric"
                min={1}
                max={possible}
                value={count}
                onChange={setCount}
              />
              {QUICK.filter((n) => n < possible).map((n) => (
                <Button key={n} small variant="secondary" onClick={() => setCount(String(n))}>
                  {n}
                </Button>
              ))}
              <Button small variant="secondary" onClick={() => setCount(String(possible))}>
                Todos ({possible})
              </Button>
            </div>
            <Button variant="secondary" onClick={() => onStart(buildDictations(items, { source, perAudio, count: wanted }))}>
              Começar com {wanted} {wanted === 1 ? 'ditado' : 'ditados'}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

/** A frase com o termo em negrito. */
function WithTerm({ sentence, term }: { sentence: string; term: string }) {
  const parts = locateTerm(sentence, term);
  if (!parts) return <>{sentence}</>;
  return (
    <>
      {parts.before}
      <strong>{parts.match}</strong>
      {parts.after}
    </>
  );
}

function DictationCard({ dictation, onNext }: { dictation: Dictation; onNext: (correct: boolean) => void }) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const result = checkDictation(answer, dictation.full);
  const correct = result.score >= DICTATION_PASS;
  const terms = dictation.parts.length;

  // O ditado começa falando o áudio inteiro.
  useEffect(() => {
    speak(dictation.full);
  }, [dictation.full]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || checked) return;
    stopSpeaking();
    setChecked(true);
  };

  return (
    <Card>
      <Eyebrow>
        Ouça e escreva · {terms} {terms === 1 ? 'frase' : 'frases'}
      </Eyebrow>
      <div className="mt-3">
        <ListenButton big text={dictation.full} label="Ouvir de novo" />
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <TextArea
          label={terms === 1 ? 'A frase que você ouviu' : `As ${terms} frases que você ouviu`}
          value={answer}
          onChange={setAnswer}
          rows={Math.max(2, terms)}
          lang="en"
          readOnly={checked}
        />
        {!checked && (
          <Button type="submit" block disabled={!answer.trim()}>
            Conferir
          </Button>
        )}
      </form>

      {checked && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className={`font-medium ${correct ? 'text-good' : 'text-danger'}`}>{Math.round(result.score * 100)}% das palavras certas</p>
          {result.missed > 0 && (
            <p className="font-serif text-lg break-words" lang="en" aria-label="O que foi dito, com o que faltou em destaque">
              {result.words.map((word, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  {word.hit ? word.text : <mark className="rounded bg-sunken px-0.5 text-danger">{word.text}</mark>}
                </span>
              ))}
            </p>
          )}
          {result.missed > 0 && (
            <p className="text-xs text-muted">
              Em destaque,{' '}
              {result.missed === 1
                ? 'a palavra que faltou ou saiu diferente'
                : `as ${result.missed} palavras que faltaram ou saíram diferentes`}
              .
            </p>
          )}
          <ul className="space-y-2">
            {dictation.parts.map((part) => (
              <li key={part.itemKey} className="border-l-2 border-line pl-3">
                <p className="font-serif text-lg break-words" lang="en">
                  <WithTerm sentence={part.shown} term={part.term} />
                </p>
                <SentenceTranslation sentence={part.sentence} />
                <p className="text-sm text-muted break-words">
                  <span className="font-serif text-ink" lang="en">
                    {part.term}
                  </span>
                  {part.meaning && ` — ${part.meaning}`}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={() => onNext(correct)}>Continuar</Button>
            <ListenButton text={dictation.full} label="Ouvir de novo" />
          </div>
        </div>
      )}
    </Card>
  );
}

/** Uma rodada de ditados, com a velocidade e o loop do áudio sempre à mão. */
export function DictationRound({ round, onExit }: { round: Dictation[]; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState(0);
  const current = round[index];

  // Sair da rodada no meio de um áudio em loop não deve deixá-lo tocando.
  useEffect(() => stopSpeaking, []);

  const next = (correct: boolean) => {
    stopSpeaking();
    if (!current) return;
    // O resultado do ditado vale para cada termo que estava nele.
    for (const part of current.parts) attempt(recordPractice(part.itemKey, correct));
    if (correct) setRight(right + 1);
    setIndex(index + 1);
  };

  if (!current) {
    return (
      <Card className="mx-auto max-w-2xl">
        <Eyebrow>Ditado concluído</Eyebrow>
        <p className="mt-2 text-xl">
          {right} de {round.length} com pelo menos {Math.round(DICTATION_PASS * 100)}% das palavras certas.
        </p>
        {right < round.length && (
          <p className="mt-1 text-sm text-muted">Os termos dos ditados que você errou ganharam prioridade nos próximos.</p>
        )}
        <div className="mt-4">
          <Button onClick={onExit}>Voltar aos exercícios</Button>
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
          Ditado · {index + 1} de {round.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(index / round.length) * 100}%` }} />
      </div>
      <ListenSettings />
      <DictationCard key={current.id} dictation={current} onNext={next} />
    </div>
  );
}
