import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  buildTraining,
  dictationScore,
  type Flashcard,
  hardest,
  isCorrect,
  type Question,
  questionsFor,
  requeue,
  studyItems,
} from '../../domain/exercises';
import { recordPractice } from '../../services/maintenance';
import { loadPracticeMaterial } from '../../services/study';
import { FlashcardRound, FlashcardSetup } from '../components/Flashcards';
import { ListenButton, ListenSettings } from '../components/Listen';
import { Button, Card, EmptyState, Eyebrow, PageTitle, Prompt, TextArea, TextInput } from '../components/ui';
import { speak, stopSpeaking } from '../speech';
import { attempt } from '../toast';

const SIZES = [5, 10, 15] as const;
const DICTATION_PASS = 0.9;
/** Quantas vezes a mesma pergunta pode voltar numa rodada depois de errada. */
const MAX_RETRIES = 2;

const KIND_LABEL = {
  recall: 'Como se diz em inglês?',
  gap: 'Complete a frase',
  dictation: 'Ouça e escreva',
} as const;

function QuestionCard({ question, retry, onNext }: { question: Question; retry: boolean; onNext: (correct: boolean) => void }) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const { kind } = question;
  const score = kind === 'dictation' ? dictationScore(answer, question.answer) : 0;
  const correct = kind === 'dictation' ? score >= DICTATION_PASS : isCorrect(answer, question.answer);

  // O ditado começa falando; não há texto na tela para ler antes.
  useEffect(() => {
    if (kind === 'dictation') speak(question.answer);
  }, [kind, question.answer]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || checked) return;
    stopSpeaking();
    setChecked(true);
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{KIND_LABEL[kind]}</Eyebrow>
        {retry && <span className="text-xs font-semibold text-warn">de novo</span>}
      </div>

      {kind === 'recall' && <p className="mt-2 text-xl break-words">{question.hint}</p>}
      {kind === 'gap' && (
        <p className="mt-2 font-serif text-xl leading-relaxed break-words" lang="en">
          {question.prompt}
        </p>
      )}
      {kind === 'dictation' && (
        <div className="mt-2 space-y-3">
          <ListenButton big text={question.answer} label="Ouvir de novo" />
          <ListenSettings />
        </div>
      )}

      <form onSubmit={submit} className="mt-4 space-y-3">
        {kind === 'dictation' ? (
          <TextArea label="Sua resposta" value={answer} onChange={setAnswer} rows={2} lang="en" readOnly={checked} />
        ) : (
          <TextInput label="Sua resposta" value={answer} onChange={setAnswer} lang="en" autoComplete="off" autoCapitalize="off" readOnly={checked} />
        )}
        {!checked && (
          <Button type="submit" block disabled={!answer.trim()}>
            Conferir
          </Button>
        )}
      </form>

      {checked && (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p className={`font-medium ${correct ? 'text-good' : 'text-danger'}`}>
            {kind === 'dictation'
              ? `${Math.round(score * 100)}% das palavras certas`
              : correct
                ? 'Certo.'
                : 'Ainda não. Ela volta daqui a pouco.'}
          </p>
          <p className="break-words">
            <span className="text-sm text-muted">Resposta: </span>
            <span className="font-serif text-lg" lang="en">
              {question.answer}
            </span>
            {question.phonetic && <span className="ml-2 text-sm text-muted">{question.phonetic}</span>}
          </p>
          {question.full && question.full !== question.answer && (
            <p className="font-serif text-muted break-words" lang="en">
              “{question.full}”
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={() => onNext(correct)}>Continuar</Button>
            <ListenButton text={question.full || question.answer} />
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Treino adaptativo: os termos mais difíceis primeiro, uma forma de pergunta por
 * termo, e o que foi errado volta algumas perguntas adiante até sair certo.
 */
function Training({ questions, onExit }: { questions: Question[]; onExit: () => void }) {
  const [queue, setQueue] = useState(questions);
  const [index, setIndex] = useState(0);
  const [retries, setRetries] = useState<Record<string, number>>({});
  const [firstTry, setFirstTry] = useState({ right: 0, wrong: 0 });
  const current = queue[index];

  // Sair da rodada no meio de um áudio em loop não deve deixá-lo tocando.
  useEffect(() => stopSpeaking, []);

  const next = (correct: boolean) => {
    stopSpeaking();
    if (!current) return;
    const used = retries[current.id] ?? 0;
    attempt(recordPractice(current.itemKey, correct));
    if (used === 0) {
      setFirstTry(correct ? { ...firstTry, right: firstTry.right + 1 } : { ...firstTry, wrong: firstTry.wrong + 1 });
    }
    if (!correct && used < MAX_RETRIES) {
      setRetries({ ...retries, [current.id]: used + 1 });
      setQueue(requeue(queue, index));
    }
    setIndex(index + 1);
  };

  if (!current) {
    return (
      <Card className="mx-auto max-w-2xl">
        <Eyebrow>Treino concluído</Eyebrow>
        <p className="mt-2 text-xl">
          {firstTry.right} de {questions.length} certas na primeira tentativa.
        </p>
        {firstTry.wrong > 0 && (
          <p className="mt-1 text-sm text-muted">
            As {firstTry.wrong} que você errou ganharam prioridade nos próximos treinos.
          </p>
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
          {index + 1} de {queue.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>
      {/* A key reinicia o campo de resposta a cada pergunta, inclusive quando ela volta. */}
      <QuestionCard key={`${current.id}-${index}`} question={current} retry={(retries[current.id] ?? 0) > 0} onNext={next} />
    </div>
  );
}

/** Dois exercícios, ambos de recuperação ativa: o treino adaptativo e os flashcards. */
export function PracticePage() {
  const material = useLiveQuery(loadPracticeMaterial, []);
  const [training, setTraining] = useState<Question[] | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const items = useMemo(() => (material ? studyItems(material) : []), [material]);

  if (!material) return null;
  if (training) return <Training questions={training} onExit={() => setTraining(null)} />;
  if (flashcards) return <FlashcardRound cards={flashcards} onExit={() => setFlashcards(null)} />;

  const trainable = items.filter((i) => questionsFor(i).length > 0).length;
  const difficult = hardest(items, 6);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <PageTitle eyebrow="Practice" title="Exercícios">
        Só com o que você já estudou, sempre escrevendo ou lembrando antes de ver a resposta.
      </PageTitle>

      <Card>
        <Prompt>Treino</Prompt>
        <p className="mt-1 text-sm text-muted">
          Começa pelos termos em que você mais erra e alterna três perguntas: lembrar o termo pelo significado, completar
          a frase e escrever o que ouviu. O que você errar volta na mesma rodada.
        </p>
        {trainable === 0 ? (
          <div className="mt-3">
            <EmptyState title="Ainda sem material.">
              Adicione palavras ao dicionário clicando nelas nos cards, ou escolha chunks nas sessões.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {SIZES.filter((n, i) => i === 0 || n <= trainable).map((n) => (
              <Button key={n} variant={n === SIZES[0] ? 'primary' : 'secondary'} onClick={() => setTraining(buildTraining(items, n))}>
                {Math.min(n, trainable)} {Math.min(n, trainable) === 1 ? 'termo' : 'termos'}
              </Button>
            ))}
            <span className="text-sm text-muted">
              de {trainable} {trainable === 1 ? 'disponível' : 'disponíveis'}
            </span>
          </div>
        )}
      </Card>

      <FlashcardSetup items={items} onStart={setFlashcards} />

      <Card className="col-span-full">
        <Eyebrow>Onde você mais erra</Eyebrow>
        {difficult.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Aparece aqui depois dos primeiros treinos. Contam os erros nos exercícios e, para os chunks, os “não lembrei”
            das revisões.
          </p>
        ) : (
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {difficult.map((item) => (
              <li key={item.key} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
                <span className="min-w-0">
                  <span className="font-serif break-words" lang="en">
                    {item.term}
                  </span>
                  {item.meaning && <span className="text-sm text-muted"> — {item.meaning}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {item.wrong} {item.wrong === 1 ? 'erro' : 'erros'} · {item.right} {item.right === 1 ? 'acerto' : 'acertos'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
