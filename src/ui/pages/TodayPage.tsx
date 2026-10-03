import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { overdueDays } from '../../domain/chunks';
import { cyclePosition, weekPlan } from '../../domain/cycle';
import { formatDate, formatDuration, startOfWeek } from '../../domain/dates';
import { MAX_CHUNKS_PER_DAY, sessionProgress } from '../../domain/session';
import { getDueChunks } from '../../services/reviews';
import { getPendingActions } from '../../services/study';
import { ActionFollowUp } from '../components/ActionFollowUp';
import { loadSessionBundle, startSession } from '../../services/sessions';
import { Button, Card, Eyebrow, PageTitle, ProgressBar } from '../components/ui';
import { useSettings, useToday } from '../hooks';
import { attempt } from '../toast';

function Row({ label, value, done }: { label: string; value: ReactNode; done: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right font-medium ${done ? 'text-good' : ''}`}>{value}</dd>
    </div>
  );
}

/** Responde de imediato: "o que preciso estudar hoje?" */
export function TodayPage() {
  const date = useToday();
  const navigate = useNavigate();
  const settings = useSettings();
  const bundle = useLiveQuery(() => loadSessionBundle(date), [date]);
  const due = useLiveQuery(() => getDueChunks(date), [date]);
  const totalSessions = useLiveQuery(() => db.sessions.count(), []);
  const actions = useLiveQuery(() => getPendingActions(date), [date]);

  if (bundle === undefined || !due || !settings || totalSessions === undefined) return null;

  const { week } = bundle
    ? { week: bundle.session.cycleWeek }
    : cyclePosition(settings.cycleStartDate ?? startOfWeek(date), date);
  const plan = weekPlan(week);
  const overdue = due.filter((c) => overdueDays(c, date) > 0).length;
  const speakingSec = bundle?.speaking.reduce((sum, s) => sum + s.durationSec, 0) ?? 0;
  const completed = bundle?.session.status === 'completed';
  const progress = bundle
    ? sessionProgress({
        ideas: bundle.ideas.length,
        hasIdeaOfDay: bundle.ideaOfDay !== null,
        hasMainIdea: Boolean(bundle.ideaOfDay?.idea.mainIdea.trim()),
        chunks: bundle.chunks.length,
        sentences: bundle.chunks.filter((c) => c.userSentence.trim()).length,
        spoke: speakingSec > 0,
        hasView: Boolean(bundle.reflection?.userOpinion.trim()),
        hasSoWhat: Boolean(bundle.reflection?.soWhat.trim()),
      })
    : 0;

  const ideasToday = bundle?.ideas.length ?? 0;
  const cardsToday = bundle?.ideas.reduce((sum, i) => sum + i.cards.length, 0) ?? 0;

  const open = () => {
    attempt(startSession(date).then(() => navigate('/session')));
  };

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Today" title={formatDate(date, 'long')}>
        Semana {week} do ciclo · {plan.focus}
      </PageTitle>

      {totalSessions === 0 && (
        <Card className="bg-accent-soft">
          <Eyebrow>Método: ideias → 1 → 3 → 1</Eyebrow>
          <p className="mt-2 leading-relaxed">
            Leia as <strong>ideias</strong> do dia no Deepstash (cada uma é uma sequência de cards), escolha{' '}
            <strong>1 ideia</strong> para aprofundar, guarde só{' '}
            <strong>3 expressões</strong> úteis e faça <strong>1 explicação</strong> em voz alta. Cerca de 30 minutos
            por dia.
          </p>
        </Card>
      )}

      <Card>
        <div className="mb-1 flex items-baseline justify-between">
          <Eyebrow>Sessão</Eyebrow>
          <span className="text-sm font-semibold tabular-nums">{progress}%</span>
        </div>
        <ProgressBar value={progress} label="Progresso da sessão de hoje" />

        <dl className="mt-2 divide-y divide-line">
          <Row
            label="Revisões pendentes"
            done={due.length === 0}
            value={
              due.length === 0 ? 'nenhuma' : overdue > 0 ? `${due.length} (${overdue} em atraso)` : String(due.length)
            }
          />
          <Row label="Ideias lidas hoje" done={ideasToday > 0} value={ideasToday === 0 ? 'nenhuma' : `${ideasToday} · ${cardsToday} ${cardsToday === 1 ? 'card' : 'cards'}`} />
          <Row
            label="Idea of the Day"
            done={Boolean(bundle?.ideaOfDay)}
            value={bundle?.ideaOfDay ? <span className="font-serif">{bundle.ideaOfDay.idea.title}</span> : 'não escolhida'}
          />
          <Row label="Chunks" done={(bundle?.chunks.length ?? 0) >= MAX_CHUNKS_PER_DAY} value={`${bundle?.chunks.length ?? 0}/${MAX_CHUNKS_PER_DAY}`} />
          <Row label="Speaking" done={speakingSec > 0} value={speakingSec > 0 ? formatDuration(speakingSec) : `não realizado · meta ${plan.speakingLabel}`} />
        </dl>

        <Button block className="mt-4" variant={completed ? 'secondary' : 'primary'} onClick={open}>
          {completed ? 'SESSÃO CONCLUÍDA · REVER' : bundle ? 'CONTINUAR ESTUDO' : 'COMEÇAR SESSÃO'}
        </Button>
        {completed && due.length > 0 && (
          <Button block className="mt-2" onClick={() => void navigate('/review')}>
            FAZER {due.length} {due.length === 1 ? 'REVISÃO' : 'REVISÕES'}
          </Button>
        )}
      </Card>

      <ActionFollowUp actions={actions ?? []} />

      {totalSessions > 0 && (
        <Link to={`/weekly/${startOfWeek(date)}`} className="block rounded-2xl border border-line bg-surface p-5 hover:bg-sunken">
          <Eyebrow>Weekly review</Eyebrow>
          <p className="mt-1">Fechamento da semana: relembrar as Ideas of the Day, Top 3 ideias e escrita curta.</p>
        </Link>
      )}
    </div>
  );
}
