import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useMemo, useState } from 'react';
import {
  buildExercises,
  dictationScore,
  type Exercise,
  type ExerciseKind,
  isCorrect,
  shuffle,
} from '../../domain/exercises';
import { loadPracticeMaterial } from '../../services/study';
import { AIFeedbackPanel } from '../components/AIFeedbackPanel';
import { speak } from '../components/Reader';
import { Button, Card, EmptyState, Eyebrow, Hint, PageTitle, Prompt, TextArea, TextInput } from '../components/ui';

interface KindInfo {
  kind: ExerciseKind;
  title: string;
  description: string;
  /** O que falta estudar para este exercício ter material. */
  empty: string;
}

const KINDS: readonly KindInfo[] = [
  {
    kind: 'dictionary',
    title: 'Dicionário: português → inglês',
    description: 'Veja o significado e escreva a palavra ou expressão em inglês.',
    empty: 'Adicione palavras ao dicionário clicando nelas nos cards de uma ideia.',
  },
  {
    kind: 'gap',
    title: 'Completar a frase',
    description: 'Uma frase sua ou do card com a expressão escondida.',
    empty: 'Crie frases com os seus chunks (etapa PERSONALIZE) ou adicione palavras ao dicionário pela leitura.',
  },
  {
    kind: 'write',
    title: 'Escrever com a expressão',
    description: 'Receba uma expressão e escreva uma frase nova com ela.',
    empty: 'Escolha chunks nas sessões ou adicione palavras ao dicionário.',
  },
  {
    kind: 'dictation',
    title: 'Ouvir e escrever',
    description: 'O navegador lê uma frase dos seus cards e você escreve o que ouviu.',
    empty: 'Registre o texto dos cards de alguma ideia.',
  },
];

const ROUND = 8;

function Question({ exercise, onNext, last }: { exercise: Exercise; onNext: (correct: boolean) => void; last: boolean }) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const { kind } = exercise;

  const score = kind === 'dictation' ? dictationScore(answer, exercise.answer) : 0;
  const correct = kind === 'write' ? answer.trim() !== '' : kind === 'dictation' ? score >= 0.9 : isCorrect(answer, exercise.answer);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (answer.trim()) setChecked(true);
  };

  return (
    <Card>
      {kind === 'dictionary' && (
        <>
          <Eyebrow>Como se diz em inglês?</Eyebrow>
          <p className="mt-2 text-xl">{exercise.hint}</p>
          {exercise.prompt && (
            <p className="mt-2 font-serif text-lg text-muted" lang="en">
              {exercise.prompt}
            </p>
          )}
        </>
      )}
      {kind === 'gap' && (
        <>
          <Eyebrow>Complete a frase</Eyebrow>
          <p className="mt-2 font-serif text-xl leading-relaxed" lang="en">
            {exercise.prompt}
          </p>
          {exercise.hint && <p className="mt-1 text-sm text-muted">Dica: {exercise.hint}</p>}
        </>
      )}
      {kind === 'write' && (
        <>
          <Eyebrow>Write a new sentence with</Eyebrow>
          <p className="mt-2 font-serif text-2xl" lang="en">
            {exercise.prompt}
          </p>
          <Hint>Relacione ao seu trabalho, estudo ou rotina. Não repita a frase que você já tinha criado.</Hint>
        </>
      )}
      {kind === 'dictation' && (
        <>
          <Eyebrow>Ouça e escreva</Eyebrow>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => speak(exercise.answer)}>
              ▶ Ouvir a frase
            </Button>
          </div>
        </>
      )}

      <form onSubmit={submit} className="mt-4 space-y-3">
        {kind === 'write' || kind === 'dictation' ? (
          <TextArea label="Sua resposta" value={answer} onChange={setAnswer} rows={3} lang="en" readOnly={checked} />
        ) : (
          <TextInput label="Sua resposta" value={answer} onChange={setAnswer} lang="en" autoComplete="off" readOnly={checked} />
        )}
        {!checked && (
          <Button type="submit" disabled={!answer.trim()}>
            Conferir
          </Button>
        )}
      </form>

      {checked && (
        <div className="mt-4 space-y-3" aria-live="polite">
          {kind === 'write' ? (
            <>
              {exercise.full && (
                <p className="text-sm text-muted">
                  Uma frase que você já tinha: <span className="font-serif" lang="en">“{exercise.full}”</span>
                </p>
              )}
              <AIFeedbackPanel
                targetType="practice"
                targetId={exercise.id}
                text={answer}
                context={`O aluno deveria usar a expressão "${exercise.prompt}" na frase.`}
              />
            </>
          ) : (
            <>
              <p className={`font-medium ${correct ? 'text-good' : 'text-danger'}`}>
                {kind === 'dictation'
                  ? `${Math.round(score * 100)}% das palavras certas`
                  : correct
                    ? 'Certo.'
                    : 'Ainda não.'}
              </p>
              <p>
                <span className="text-sm text-muted">Resposta: </span>
                <span className="font-serif text-lg" lang="en">
                  {kind === 'dictation' ? exercise.answer : exercise.full || exercise.answer}
                </span>
              </p>
              {kind !== 'dictation' && exercise.full && (
                <p className="text-sm text-muted">
                  Expressão: <span className="font-serif" lang="en">{exercise.answer}</span>
                </p>
              )}
            </>
          )}
          <Button onClick={() => onNext(correct)}>{last ? 'Ver resultado' : 'Próxima'}</Button>
        </div>
      )}
    </Card>
  );
}

function Round({ info, exercises, onExit }: { info: KindInfo; exercises: Exercise[]; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState(0);
  const current = exercises[index];

  if (!current) {
    return (
      <Card>
        <Eyebrow>Rodada concluída</Eyebrow>
        <p className="mt-2 text-xl">
          {info.kind === 'write'
            ? `${exercises.length} ${exercises.length === 1 ? 'frase escrita' : 'frases escritas'}.`
            : `${right} de ${exercises.length} certas.`}
        </p>
        <div className="mt-4">
          <Button onClick={onExit}>Voltar aos exercícios</Button>
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
          {info.title} · {index + 1} de {exercises.length}
        </span>
      </div>
      {/* A key reinicia o campo de resposta a cada questão. */}
      <Question
        key={current.id}
        exercise={current}
        last={index === exercises.length - 1}
        onNext={(correct) => {
          if (correct) setRight(right + 1);
          setIndex(index + 1);
        }}
      />
    </div>
  );
}

/** Exercícios montados só com o que o usuário já leu, escolheu e escreveu. */
export function PracticePage() {
  const material = useLiveQuery(loadPracticeMaterial, []);
  const [active, setActive] = useState<{ info: KindInfo; exercises: Exercise[] } | null>(null);
  const available = useMemo(
    () => new Map(KINDS.map((k) => [k.kind, material ? buildExercises(k.kind, material) : []])),
    [material],
  );

  if (!material) return null;
  if (active) return <Round info={active.info} exercises={active.exercises} onExit={() => setActive(null)} />;

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Practice" title="Exercícios">
        Montados com as suas ideias, chunks e dicionário. Tente primeiro; a resposta só aparece depois.
      </PageTitle>
      <ul className="space-y-3">
        {KINDS.map((info) => {
          const all = available.get(info.kind) ?? [];
          return (
            <li key={info.kind}>
              <Card>
                <Prompt>{info.title}</Prompt>
                <p className="mt-1 text-sm text-muted">{info.description}</p>
                {all.length === 0 ? (
                  <div className="mt-3">
                    <EmptyState title="Ainda sem material.">{info.empty}</EmptyState>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-3">
                    <Button onClick={() => setActive({ info, exercises: shuffle(all).slice(0, ROUND) })}>
                      Começar
                    </Button>
                    <span className="text-sm text-muted">
                      {all.length} {all.length === 1 ? 'questão disponível' : 'questões disponíveis'}
                    </span>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
