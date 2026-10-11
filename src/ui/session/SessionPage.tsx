import { useLiveQuery } from 'dexie-react-hooks';
import { type ComponentType, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '../../domain/dates';
import { SKILL_LABELS, SKILLS, stepIndex, STEPS } from '../../domain/session';
import type { Skill } from '../../domain/types';
import type { StepId } from '../../domain/types';
import type { CoachContext } from '../../ai/coach';
import { finishSession, loadSessionBundle, type SessionBundle, setStep, startSession } from '../../services/sessions';
import { CoachPanel } from '../components/Coach';
import { Button } from '../components/ui';
import { isAIConfigured } from '../../ai/feedback';
import { generateStudySummary } from '../../ai/summary';
import { useSettings, useToday } from '../hooks';
import { attempt, showToast } from '../toast';
import {
  AloudStep,
  ListenStep,
  MineStep,
  PersonalizeStep,
  ReadStep,
  ReflectStep,
  RetellStep,
  ReviewStep,
  ScheduleStep,
  SoWhatStep,
  type StepProps,
  TextStep,
} from './steps';

const STEP_VIEWS: Record<StepId, ComponentType<StepProps>> = {
  review: ReviewStep,
  text: TextStep,
  listen: ListenStep,
  read: ReadStep,
  mine: MineStep,
  aloud: AloudStep,
  retell: RetellStep,
  personalize: PersonalizeStep,
  reflect: ReflectStep,
  sowhat: SoWhatStep,
  schedule: ScheduleStep,
};

/** Cor da faixa de cada habilidade no stepper. */
const SKILL_BAR: Record<Skill, string> = {
  listening: 'bg-listening',
  reading: 'bg-reading',
  speaking: 'bg-speaking',
  writing: 'bg-writing',
};

/** Rótulo curto de cada etapa, embaixo da caixa numerada. */
const SHORT_LABEL: Partial<Record<StepId, string>> = { aloud: 'ALOUD', schedule: 'SCHEDULE', personalize: 'PERSONAL.' };

/**
 * As etapas como caixas numeradas: a atual em destaque, as já passadas marcadas, todas
 * clicáveis. Uma faixa colorida embaixo de cada caixa mostra a habilidade trabalhada.
 */
function Stepper({ current, onSelect }: { current: number; onSelect: (step: StepId) => void }) {
  return (
    <nav aria-label="Etapas da sessão">
      <ol className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}>
        {STEPS.map((step, i) => {
          const active = i === current;
          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                title={`${i + 1}. ${step.label}${step.skill ? ` · ${SKILL_LABELS[step.skill]}` : ''}`}
                aria-label={`Etapa ${i + 1}: ${step.label}${step.skill ? `, ${SKILL_LABELS[step.skill]}` : ''}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(step.id)}
                className={`flex h-10 w-full flex-col items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors ${
                  active
                    ? 'border-accent bg-accent text-accent-ink shadow-sm'
                    : i < current
                      ? 'border-accent/40 bg-accent-soft text-accent hover:border-accent'
                      : 'border-line bg-surface text-muted hover:border-accent hover:text-ink'
                }`}
              >
                {i + 1}
              </button>
              <span aria-hidden="true" className={`mt-1 block h-1 rounded-full ${step.skill ? SKILL_BAR[step.skill] : 'bg-transparent'}`} />
              <span
                aria-hidden="true"
                className={`mt-1 hidden truncate text-center text-[9px] font-semibold tracking-wide lg:block ${active ? 'text-accent' : 'text-muted'}`}
              >
                {SHORT_LABEL[step.id] ?? step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Habilidades">
        {SKILLS.map((skill) => (
          <li key={skill} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-1 w-4 rounded-full ${SKILL_BAR[skill]}`} />
            {SKILL_LABELS[skill]}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** O que a IA precisa saber para orientar a etapa: o conteúdo em estudo e o que já foi escrito. */
function coachContext(bundle: SessionBundle, step: StepId): CoachContext {
  const { session, ideas, ideaOfDay, chunks, reflection } = bundle;
  const text = ideaOfDay ?? ideas[0];
  const attempts: Partial<Record<StepId, string>> = {
    listen: session.listenGist ?? '',
    read: ideaOfDay?.idea.mainIdea ?? '',
    personalize: chunks
      .map((c) => c.userSentence)
      .filter(Boolean)
      .join(' | '),
    reflect: reflection?.userOpinion ?? '',
    sowhat: reflection?.soWhat ?? '',
  };
  return {
    step,
    cycleWeek: session.cycleWeek,
    bookTitle: text?.idea.bookTitle ?? '',
    ideaTitle: text?.idea.title ?? '',
    cardsText: (text?.cards.map((c) => c.content).join('\n\n') ?? '').slice(0, 6000),
    mainIdea: text?.idea.mainIdea ?? '',
    chunks: chunks.map((c) => c.text),
    attempt: attempts[step] ?? '',
    draftPt: (step === 'reflect' ? reflection?.opinionPt : step === 'sowhat' ? reflection?.soWhatPt : '') ?? '',
  };
}

/** Sessão guiada: uma etapa por vez, com tudo salvo automaticamente. */
export function SessionPage() {
  const date = useToday();
  const navigate = useNavigate();
  const bundle = useLiveQuery(() => loadSessionBundle(date), [date]);
  const settings = useSettings();
  // Sem IA não há painel de orientação: a etapa fica em coluna única.
  const withCoach = settings !== undefined && isAIConfigured(settings.ai);

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
        // O resumo do que estudar é escrito em segundo plano; falhar aqui não impede de finalizar.
        if (withCoach && navigator.onLine) void generateStudySummary(session.id).catch(() => undefined);
        showToast(withCoach ? 'Sessão finalizada. O resumo do que estudar aparece em Today.' : 'Sessão finalizada.');
        void navigate('/');
      })
      .catch((error: unknown) => attempt(Promise.reject(error)));
  };

  return (
    <div className={withCoach ? 'mx-auto max-w-3xl xl:max-w-none' : 'mx-auto max-w-3xl'}>
      <div className="mb-4 flex items-center justify-between text-sm">
        <Link to="/" className="flex min-h-10 items-center font-medium text-accent">
          ← Hoje
        </Link>
        <span className="text-muted">
          {formatDate(session.date, 'short')} · fase {session.cycleWeek} de 4
        </span>
      </div>

      <Stepper current={index} onSelect={goTo} />

      <header className="mt-4 mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Etapa {index + 1} de {STEPS.length}
          {step.skill && ` · ${SKILL_LABELS[step.skill]}`}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{step.label}</h1>
        <p className="mt-1 text-sm text-muted">{step.hint}</p>
        <p className="mt-1 text-xs font-medium text-accent">
          {step.frequency} · ~{step.minutes} min
        </p>
      </header>

      {/* No computador, a orientação da IA fica ao lado da etapa, à vista enquanto se escreve. */}
      <div className={withCoach ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-6' : 'mx-auto max-w-3xl'}>
        <div className="xl:sticky xl:top-4 xl:order-2">
          <CoachPanel key={step.id} context={coachContext(bundle, step.id)} />
        </div>
        <div className="min-w-0">
          <StepView bundle={bundle} goTo={goTo} />
        </div>
      </div>

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
