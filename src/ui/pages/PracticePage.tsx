import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  buildTenseTraining,
  buildTraining,
  dictationScore,
  type Flashcard,
  hardest,
  isCorrect,
  locateTerm,
  type Question,
  questionsFor,
  requeue,
  studyItems,
  tenseQuestions,
  withoutContext,
} from '../../domain/exercises';
import { recordPractice } from '../../services/maintenance';
import { loadPracticeMaterial } from '../../services/study';
import { FlashcardRound, FlashcardSetup } from '../components/Flashcards';
import { ListenButton, ListenSettings } from '../components/Listen';
import { SentenceTranslation } from '../components/SentenceTranslation';
import { TenseSetup } from '../components/TenseSetup';
import { Button, Card, EmptyState, Eyebrow, Hint, PageTitle, Prompt, TextArea, TextInput } from '../components/ui';
import { speak, stopSpeaking } from '../speech';
import { attempt } from '../toast';

const SIZES = [5, 10, 15] as const;
const DICTATION_PASS = 0.9;
/** Quantas vezes a mesma pergunta pode voltar numa rodada depois de errada. */
const MAX_RETRIES = 2;

const KIND_LABEL = {
  gap: 'Complete a frase',
  listen: 'Ouça e escreva a palavra que falta',
  dictation: 'Ouça e escreva a frase',
  tense: 'Complete com o verbo no tempo pedido',
} as const;

function QuestionCard({ question, retry, onNext }: { question: Question; retry: boolean; onNext: (correct: boolean) => void }) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const { kind } = question;
  const heard = kind === 'listen' || kind === 'dictation';
  const score = kind === 'dictation' ? dictationScore(answer, question.answer) : 0;
  // O trecho respondido, para aparecer em negrito na frase revelada.
  const revealed = kind === 'dictation' ? null : locateTerm(question.full, question.answer);
  const correct = kind === 'dictation' ? score >= DICTATION_PASS : isCorrect(answer, question.answer);

  // As perguntas de escuta começam falando a frase inteira.
  useEffect(() => {
    if (heard) speak(question.full);
  }, [heard, question.full]);

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

      {kind === 'tense' && <p className="mt-2 text-sm font-semibold text-accent">{question.hint}</p>}
      {question.prompt && (
        <p className="mt-2 font-serif text-xl leading-relaxed break-words" lang="en">
          {question.prompt}
        </p>
      )}
      {heard && (
        <div className="mt-3 space-y-3">
          <ListenButton big text={question.full} label="Ouvir de novo" />
          <ListenSettings />
        </div>
      )}
      {kind === 'gap' &&
        question.hint &&
        !checked &&
        (hintShown ? (
          <p className="mt-2 text-sm text-muted">Dica: {question.hint}</p>
        ) : (
          <button type="button" onClick={() => setHintShown(true)} className="mt-1 min-h-8 text-sm font-medium text-accent">
            Ver dica em português
          </button>
        ))}

      <form onSubmit={submit} className="mt-4 space-y-3">
        {kind === 'dictation' ? (
          <TextArea label="A frase que você ouviu" value={answer} onChange={setAnswer} rows={2} lang="en" readOnly={checked} />
        ) : (
          <TextInput
            label="O que falta na frase"
            value={answer}
            onChange={setAnswer}
            lang="en"
            autoComplete="off"
            autoCapitalize="off"
            readOnly={checked}
          />
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
          <div>
            <p className="font-serif text-lg break-words" lang="en">
              {revealed ? (
                <>
                  {revealed.before}
                  <strong>{revealed.match}</strong>
                  {revealed.after}
                </>
              ) : (
                question.full
              )}
            </p>
            <SentenceTranslation sentence={question.full} />
          </div>
          {kind !== 'dictation' && (
            <p className="text-sm text-muted break-words">
              Resposta: <span className="font-serif text-ink" lang="en">{question.answer}</span>
              {question.phonetic && ` ${question.phonetic}`}
              {kind !== 'tense' && question.hint && ` — ${question.hint}`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={() => onNext(correct)}>Continuar</Button>
            <ListenButton text={question.full} label="Ouvir a frase" />
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Uma rodada de perguntas. O que foi errado volta algumas perguntas adiante, até
 * sair certo ou esgotar as tentativas.
 */
function Training({ title, questions, onExit }: { title: string; questions: Question[]; onExit: () => void }) {
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
        <Eyebrow>{title} concluído</Eyebrow>
        <p className="mt-2 text-xl">
          {firstTry.right} de {questions.length} certas na primeira tentativa.
        </p>
        {firstTry.wrong > 0 && (
          <p className="mt-1 text-sm text-muted">
            As {firstTry.wrong} que você errou ganharam prioridade nas próximas rodadas.
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
          {title} · {index + 1} de {queue.length}
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

function Sizes({ available, unit, onPick }: { available: number; unit: [string, string]; onPick: (n: number) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {SIZES.filter((n, i) => i === 0 || n <= available).map((n) => {
        const size = Math.min(n, available);
        return (
          <Button key={n} variant={n === SIZES[0] ? 'primary' : 'secondary'} onClick={() => onPick(n)}>
            {size} {size === 1 ? unit[0] : unit[1]}
          </Button>
        );
      })}
      <span className="text-sm text-muted">
        de {available} {available === 1 ? 'disponível' : 'disponíveis'}
      </span>
    </div>
  );
}

/** Três exercícios, todos com o termo dentro de uma frase: treino, tempos verbais e flashcards. */
export function PracticePage() {
  const material = useLiveQuery(loadPracticeMaterial, []);
  const [params, setParams] = useSearchParams();
  const [round, setRound] = useState<{ title: string; questions: Question[] } | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const items = useMemo(() => (material ? studyItems(material) : []), [material]);
  const verbsOfIdea = params.get('verbs');

  // Vindo da página de uma ideia ("Treinar estes verbos"), a rodada começa direto com os verbos dela.
  useEffect(() => {
    if (!material || !verbsOfIdea) return;
    const verbs = material.verbs.filter((v) => v.ideaId === verbsOfIdea);
    const questions = buildTenseTraining(verbs, material.stats, tenseQuestions(verbs).length);
    setParams({}, { replace: true });
    if (questions.length > 0) setRound({ title: 'Tempos verbais', questions });
  }, [material, verbsOfIdea, setParams]);

  if (!material) return null;
  if (round) return <Training title={round.title} questions={round.questions} onExit={() => setRound(null)} />;
  if (flashcards) return <FlashcardRound cards={flashcards} onExit={() => setFlashcards(null)} />;

  const trainable = items.filter((i) => questionsFor(i).length > 0).length;
  const tenses = tenseQuestions(material.verbs).length;
  const loose = withoutContext(material);
  const difficult = hardest(items, 6);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <PageTitle eyebrow="Practice" title="Exercícios">
        Nenhuma palavra solta: tudo aparece dentro de uma frase, para completar ou para ouvir e escrever.
      </PageTitle>

      <Card>
        <Prompt>Treino</Prompt>
        <p className="mt-1 text-sm text-muted">
          Começa pelos termos em que você mais erra e alterna três formas: completar a frase, ouvir a frase e escrever a
          palavra que falta, e ouvir uma frase curta e escrevê-la. O que você errar volta na mesma rodada.
        </p>
        {trainable === 0 ? (
          <div className="mt-3">
            <EmptyState title="Ainda sem material.">
              Adicione palavras ao dicionário clicando nelas nos cards, ou escolha chunks com a frase original.
            </EmptyState>
          </div>
        ) : (
          <Sizes available={trainable} unit={['termo', 'termos']} onPick={(n) => setRound({ title: 'Treino', questions: buildTraining(items, n) })} />
        )}
        {loose > 0 && (
          <div className="mt-3">
            <Hint>
              {loose} {loose === 1 ? 'termo está' : 'termos estão'} fora dos exercícios por não {loose === 1 ? 'ter' : 'terem'}{' '}
              frase. Escreva uma frase com o chunk (PERSONALIZE ou My English) para {loose === 1 ? 'ele' : 'eles'} entrar
              {loose === 1 ? '' : 'em'}.
            </Hint>
          </div>
        )}
      </Card>

      <Card>
        <Prompt>Tempos verbais</Prompt>
        <p className="mt-1 text-sm text-muted">
          Frases com lacuna para conjugar os verbos das suas ideias. Escolha os verbos, os tempos e quantas frases.
        </p>
        {tenses === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nenhum verbo selecionado ainda.">
              Abra uma ideia em{' '}
              <Link to="/knowledge?tab=ideas" className="text-accent underline underline-offset-2">
                Knowledge
              </Link>{' '}
              e use “Encontrar os verbos desta ideia”.
            </EmptyState>
          </div>
        ) : (
          <TenseSetup
            verbs={material.verbs}
            stats={material.stats}
            onStart={(questions) => setRound({ title: 'Tempos verbais', questions })}
          />
        )}
      </Card>

      <div className="col-span-full">
        <FlashcardSetup items={items} onStart={setFlashcards} />
      </div>

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
