import { type FormEvent, useEffect, useState } from 'react';
import { weekPlan } from '../../../domain/cycle';
import { checkDictation, DICTATION_PASS } from '../../../domain/exercises';
import { listeningSentences } from '../../../domain/listening';
import type { ListeningAnswer } from '../../../domain/types';
import { saveListeningAnswer, updateSessionNotes } from '../../../services/sessions';
import { ListenButton, ListenSettings } from '../../components/Listen';
import { SentenceTranslation } from '../../components/SentenceTranslation';
import { AutoTextArea, Button, Eyebrow, Hint, Prompt, TextArea } from '../../components/ui';
import { setRate, stopSpeaking } from '../../speech';
import { attempt } from '../../toast';
import { type StepProps, paragraphsOf, NeedsText } from './shared';

// ---------- 3. LISTEN ----------

/** Uma frase do texto para ouvir e escrever. A resposta fica guardada na sessão. */
function ListeningSentence({
  sessionId,
  number,
  sentence,
  saved,
}: {
  sessionId: string;
  number: number;
  sentence: string;
  saved: ListeningAnswer | undefined;
}) {
  const [answer, setAnswer] = useState('');
  const [retrying, setRetrying] = useState(false);
  const checked = saved !== undefined && !retrying;
  const result = checked ? checkDictation(saved.answer, sentence) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    stopSpeaking();
    const score = checkDictation(answer, sentence).score;
    attempt(
      saveListeningAnswer(sessionId, { sentence, answer: answer.trim(), score }).then(() => {
        setRetrying(false);
        setAnswer('');
      }),
    );
  };

  return (
    <li className="space-y-2 border-l-2 border-line pl-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Frase {number}</span>
        <ListenButton text={sentence} label="Ouvir" />
      </div>
      {result && saved ? (
        <div className="space-y-1" aria-live="polite">
          <p className={`text-sm font-medium ${result.score >= DICTATION_PASS ? 'text-good' : 'text-danger'}`}>
            {Math.round(result.score * 100)}% das palavras certas
          </p>
          <p className="font-serif text-lg break-words" lang="en">
            {result.words.map((word, i) => (
              <span key={i}>
                {i > 0 && ' '}
                {word.hit ? word.text : <mark className="rounded bg-sunken px-0.5 text-danger">{word.text}</mark>}
              </span>
            ))}
          </p>
          <p className="text-sm text-muted break-words">
            Você escreveu: <span lang="en">{saved.answer}</span>
          </p>
          <SentenceTranslation sentence={sentence} />
          <button type="button" onClick={() => setRetrying(true)} className="min-h-8 text-sm font-medium text-accent">
            Tentar de novo
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <TextArea label={`O que você ouviu na frase ${number}`} hideLabel value={answer} onChange={setAnswer} rows={2} lang="en" />
          <Button small type="submit" variant="secondary" disabled={!answer.trim()}>
            Conferir
          </Button>
        </form>
      )}
    </li>
  );
}

export function ListenStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay } = bundle;
  const plan = weekPlan(session.cycleWeek);
  const started = Boolean(session.listenGist?.trim()) || (session.listenAnswers?.length ?? 0) > 0;

  // A primeira escuta do dia começa na velocidade da fase; depois vale a que o usuário escolher.
  useEffect(() => {
    if (!started) setRate(plan.listenRate);
    // Só ao abrir a etapa: mudar a velocidade durante a escuta não deve ser desfeito.
  }, []);

  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const paragraphs = paragraphsOf(ideaOfDay);
  if (paragraphs.length === 0) return <NeedsText goTo={goTo} />;
  const whole = paragraphs.join('\n\n');
  const sentences = listeningSentences(paragraphs, plan.listenSentences, plan.listenMaxWords);
  const answers = session.listenAnswers ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Texto do dia</Eyebrow>
        <h3 className="mt-1 font-serif text-xl">{ideaOfDay.idea.title}</h3>
      </div>

      <div className="space-y-3">
        <Prompt>1. Ouça o texto inteiro, sem ler.</Prompt>
        <Hint>
          Na primeira vez, só a ideia geral. Ouça de novo quantas vezes quiser; se estiver difícil, diminua a velocidade ou ouça um
          parágrafo por vez. Fase {session.cycleWeek} de 4: começa em {plan.listenRate}× e o ditado tem {plan.listenSentences} frases de até{' '}
          {plan.listenMaxWords} palavras.
        </Hint>
        <ListenSettings />
        <ListenButton big text={whole} label="Ouvir o texto inteiro" />
        {paragraphs.length > 1 && (
          <div className="flex flex-wrap gap-x-4">
            {paragraphs.map((p, i) => (
              <ListenButton key={i} text={p} label={`Parágrafo ${i + 1}`} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Prompt>2. O que você entendeu?</Prompt>
        <AutoTextArea
          label="O que entendi só ouvindo (em inglês ou em português)"
          hideLabel
          value={session.listenGist ?? ''}
          onSave={(listenGist) => updateSessionNotes(session.id, { listenGist })}
          rows={3}
          placeholder="Do que o texto fala? Que palavras você reconheceu?"
        />
        <Hint>Na etapa READ você compara isto com o que o texto diz de verdade.</Hint>
      </div>

      {sentences.length > 0 && (
        <div className="space-y-3">
          <Prompt>3. Ditado: ouça e escreva cada frase.</Prompt>
          <Hint>Frases tiradas do texto. Maiúsculas, pontuação e apóstrofos não contam.</Hint>
          <ol className="space-y-4">
            {sentences.map((sentence, i) => (
              <ListeningSentence
                key={sentence}
                sessionId={session.id}
                number={i + 1}
                sentence={sentence}
                saved={answers.find((a) => a.sentence === sentence)}
              />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
