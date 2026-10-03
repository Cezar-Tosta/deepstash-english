import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { overdueDays } from '../../domain/chunks';
import { cyclePosition, weekPlan } from '../../domain/cycle';
import { formatDate, formatDuration, startOfWeek } from '../../domain/dates';
import { CARD_GOAL, MAX_CHUNKS_PER_DAY, sessionProgress } from '../../domain/session';
import { getDueChunks } from '../../services/reviews';
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
        cards: bundle.cards.length,
        hasCardOfDay: bundle.cardOfDay !== null,
        hasMainIdea: Boolean(bundle.cardOfDay?.mainIdea.trim()),
        chunks: bundle.chunks.length,
        sentences: bundle.chunks.filter((c) => c.userSentence.trim()).length,
        spoke: speakingSec > 0,
        hasView: Boolean(bundle.reflection?.userOpinion.trim()),
        hasSoWhat: Boolean(bundle.reflection?.soWhat.trim()),
      })
    : 0;

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
          <Eyebrow>Método 5 → 1 → 3 → 1</Eyebrow>
          <p className="mt-2 leading-relaxed">
            Leia <strong>5 cards</strong> do Deepstash, escolha <strong>1</strong> para aprofundar, guarde só{' '}
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
          <Row label="Cards de hoje" done={(bundle?.cards.length ?? 0) >= CARD_GOAL} value={`${bundle?.cards.length ?? 0}/${CARD_GOAL}`} />
          <Row
            label="Card of the Day"
            done={Boolean(bundle?.cardOfDay)}
            value={bundle?.cardOfDay ? <span className="font-serif">{bundle.cardOfDay.title}</span> : 'não escolhido'}
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

      {totalSessions > 0 && (
        <Link to={`/weekly/${startOfWeek(date)}`} className="block rounded-2xl border border-line bg-surface p-5 hover:bg-sunken">
          <Eyebrow>Weekly review</Eyebrow>
          <p className="mt-1">Fechamento da semana: relembrar os Cards of the Day, Top 3 ideias e escrita curta.</p>
        </Link>
      )}
    </div>
  );
}
