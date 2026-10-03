import { useLiveQuery } from 'dexie-react-hooks';
import { type ComponentType, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '../../domain/dates';
import { stepIndex, STEPS } from '../../domain/session';
import type { StepId } from '../../domain/types';
import type { CoachContext } from '../../ai/coach';
import {
  finishSession,
  loadSessionBundle,
  type SessionBundle,
  setStep,
  startSession,
} from '../../services/sessions';
import { CoachPanel } from '../components/Coach';
import { Button } from '../components/ui';
import { useToday } from '../hooks';
import { attempt, showToast } from '../toast';
import {
  CheckStep,
  FocusStep,
  MineStep,
  PersonalizeStep,
  ReadStep,
  ReflectStep,
  RetellStep,
  ReviewStep,
  ScheduleStep,
  SoWhatStep,
  type StepProps,
} from './steps';

const STEP_VIEWS: Record<StepId, ComponentType<StepProps>> = {
  review: ReviewStep,
  read: ReadStep,
  focus: FocusStep,
  check: CheckStep,
  mine: MineStep,
  retell: RetellStep,
  personalize: PersonalizeStep,
  reflect: ReflectStep,
  sowhat: SoWhatStep,
  schedule: ScheduleStep,
};

function Stepper({ current, onSelect }: { current: number; onSelect: (step: StepId) => void }) {
  return (
    <nav aria-label="Etapas da sessão">
      <ol className="flex items-center gap-1.5">
        {STEPS.map((step, i) => (
          <li key={step.id} className="flex-1">
            <button
              type="button"
              aria-label={`Etapa ${i + 1}: ${step.label}`}
              aria-current={i === current ? 'step' : undefined}
              onClick={() => onSelect(step.id)}
              className="flex h-8 w-full items-center"
            >
              <span
                className={`h-1.5 w-full rounded-full transition-colors ${
                  i === current ? 'bg-accent' : i < current ? 'bg-accent/45' : 'bg-line'
                }`}
              />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** O que a IA precisa saber para orientar a etapa: o conteúdo em estudo e o que já foi escrito. */
function coachContext(bundle: SessionBundle, step: StepId): CoachContext {
  const { session, ideas, ideaOfDay, chunks, reflection } = bundle;
  // Antes da escolha, a orientação considera todas as ideias lidas hoje.
  const broad = step === 'read' || step === 'focus' || !ideaOfDay;
  const source = broad ? ideas : [ideaOfDay];
  const attempts: Partial<Record<StepId, string>> = {
    check: ideaOfDay?.idea.mainIdea ?? '',
    personalize: chunks.map((c) => c.userSentence).filter(Boolean).join(' | '),
    reflect: reflection?.userOpinion ?? '',
    sowhat: reflection?.soWhat ?? '',
  };
  return {
    step,
    cycleWeek: session.cycleWeek,
    bookTitle: (ideaOfDay ?? ideas[0])?.idea.bookTitle ?? '',
    ideaTitle: broad ? ideas.map((i) => i.idea.title).join(' / ') : (ideaOfDay?.idea.title ?? ''),
    cardsText: source
      .map((i) => [broad ? `[${i.idea.title}]` : '', ...i.cards.map((c) => c.content)].filter(Boolean).join('\n'))
      .join('\n\n')
      .slice(0, 6000),
    mainIdea: ideaOfDay?.idea.mainIdea ?? '',
    chunks: chunks.map((c) => c.text),
    attempt: attempts[step] ?? '',
  };
}

/** Sessão guiada: uma etapa por vez, com tudo salvo automaticamente. */
export function SessionPage() {
  const date = useToday();
  const navigate = useNavigate();
  const bundle = useLiveQuery(() => loadSessionBundle(date), [date]);

  // Abrir /session direto (atalho, recarregar a página) também inicia a sessão do dia.
  useEffect(() => {
    if (bundle === null) attempt(startSession(date));
  }, [bundle, date]);

  if (!bundle) return null;

  const { session } = bundle;
  const index = stepIndex(session.currentStep);
  const step = STEPS[index] ?? STEPS[0];
  if (!step) return null;
  const StepView = STEP_VIEWS[step.id];
  const prev = STEPS[index - 1];
  const next = STEPS[index + 1];

  const goTo = (target: StepId) => {
    attempt(setStep(session.id, target));
    window.scrollTo({ top: 0 });
  };

  const finish = () => {
    finishSession(session.id)
      .then(() => {
        showToast('Sessão finalizada.');
        void navigate('/');
      })
      .catch((error: unknown) => attempt(Promise.reject(error)));
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between text-sm">
        <Link to="/" className="flex min-h-10 items-center font-medium text-accent">
          ← Hoje
        </Link>
        <span className="text-muted">
          {formatDate(session.date, 'short')} · semana {session.cycleWeek} do ciclo
        </span>
      </div>

      <Stepper current={index} onSelect={goTo} />

      <header className="mt-4 mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Etapa {index + 1} de {STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{step.label}</h1>
        <p className="mt-1 text-sm text-muted">{step.hint}</p>
        <p className="mt-1 text-xs font-medium text-accent">
          {step.frequency} · ~{step.minutes} min
        </p>
      </header>

      <CoachPanel key={step.id} context={coachContext(bundle, step.id)} />

      <StepView bundle={bundle} goTo={goTo} />

      <footer className="mt-8 flex gap-3">
        {prev && (
          <Button variant="secondary" onClick={() => goTo(prev.id)}>
            Voltar
          </Button>
        )}
        {next ? (
          <Button className="flex-1" onClick={() => goTo(next.id)}>
            Continuar
          </Button>
        ) : session.status === 'completed' ? (
          <Button className="flex-1" onClick={() => void navigate('/')}>
            Concluída · voltar para Hoje
          </Button>
        ) : (
          <Button className="flex-1" onClick={finish}>
            FINALIZAR SESSÃO
          </Button>
        )}
      </footer>
    </div>
  );
}
