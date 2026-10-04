import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { overdueDays } from '../../domain/chunks';
import { weekPlan } from '../../domain/cycle';
import { formatDate, formatDuration } from '../../domain/dates';
import { CYCLE_DAYS, PHASES } from '../../domain/periods';
import { MAX_CHUNKS_PER_DAY, sessionProgress } from '../../domain/session';
import { getCycleInfo } from '../../services/cycles';
import { getDueChunks } from '../../services/reviews';
import { getPendingActions } from '../../services/study';
import { ActionFollowUp } from '../components/ActionFollowUp';
import { CycleStrip } from '../components/CycleStrip';
import { DaySummary } from '../components/DaySummary';
import { Routine } from '../components/Maintenance';
import { TodaySuggestion } from '../components/TodaySuggestion';
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
  const info = useLiveQuery(() => getCycleInfo(date), [date]);

  if (bundle === undefined || !due || !settings || totalSessions === undefined || !info) return null;

  const week = bundle ? bundle.session.cycleWeek : info.week;
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

  const weekend = info.rest;
  // Nos dias 6 e 7 do ciclo a sessão só aparece se o usuário já tiver decidido fazer uma.
  const restDay = weekend && !bundle;
  // Dia entre um ciclo que terminou e o próximo, que ainda não começou.
  const betweenCycles = !info.period && info.reference !== null && !bundle;

  const open = () => {
    attempt(startSession(date).then(() => navigate('/session')));
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <PageTitle eyebrow="Today" title={formatDate(date, 'long')}>
        {info.period
          ? `Dia ${info.day} de ${CYCLE_DAYS} do ciclo (${formatDate(info.period.start, 'short')} a ${formatDate(info.period.end, 'short')})`
          : 'Sem ciclo em andamento'}{' '}
        · fase {week} de {PHASES} · {plan.focus}
      </PageTitle>

      {info.period && <CycleStrip period={info.period} date={date} />}

      {totalSessions === 0 && (
        <Card className="bg-accent-soft">
          <Eyebrow>Método: ideias → 1 → 3 → 1</Eyebrow>
          <p className="mt-2 leading-relaxed">
            Leia as <strong>ideias</strong> do dia no Deepstash (cada uma é uma sequência de cards), escolha <strong>1 ideia</strong> para
            aprofundar, guarde só <strong>3 expressões</strong> úteis e faça <strong>1 explicação</strong> em voz alta. Cerca de 30 minutos
            por dia. O estudo anda em <strong>ciclos de 7 dias</strong>, que começam no dia da sua primeira sessão: 5 dias de sessão e 2 só
            de revisão.
          </p>
          <Link to="/manual" className="mt-2 inline-flex min-h-10 items-center font-medium text-accent underline underline-offset-2">
            Ler o manual: a sequência completa de estudos →
          </Link>
        </Card>
      )}

      {betweenCycles ? (
        <Card>
          <Eyebrow>Entre ciclos</Eyebrow>
          <p className="mt-2 text-lg font-medium">
            O último ciclo terminou em {info.reference ? formatDate(info.reference.end, 'medium') : ''}.
          </p>
          <p className="mt-1 text-sm text-muted">
            Os dias entre um ciclo e outro não entram no histórico. O próximo ciclo de 7 dias começa quando você fizer a sessão, ou na data
            que escolher em{' '}
            <Link to="/settings" className="text-accent underline underline-offset-2">
              Settings
            </Link>
            .
          </p>
          <Button block className="mt-4" onClick={open}>
            COMEÇAR UM CICLO HOJE
          </Button>
          {due.length > 0 && (
            <Button block className="mt-2" variant="secondary" onClick={() => void navigate('/review')}>
              FAZER {due.length} {due.length === 1 ? 'REVISÃO' : 'REVISÕES'}
            </Button>
          )}
        </Card>
      ) : restDay ? (
        <Card>
          <Eyebrow>Dia de revisão</Eyebrow>
          <p className="mt-2 text-lg font-medium">
            {due.length === 0
              ? 'Nada agendado para hoje.'
              : `Hoje é dia só de revisão: ${due.length} ${due.length === 1 ? 'expressão' : 'expressões'}.`}
          </p>
          <p className="mt-1 text-sm text-muted">
            Hoje é o dia {info.day} de {CYCLE_DAYS}: os dois últimos dias do ciclo não têm sessão nova, só revisões.
            {info.period &&
              ` Este ciclo termina em ${formatDate(info.period.end, 'long')}; o próximo começa quando você fizer a sessão seguinte.`}
          </p>
          {due.length > 0 && (
            <Button block className="mt-4" onClick={() => void navigate('/review')}>
              FAZER {due.length} {due.length === 1 ? 'REVISÃO' : 'REVISÕES'}
            </Button>
          )}
          <Button block className="mt-2" variant="ghost" onClick={open}>
            Fazer uma sessão mesmo assim
          </Button>
        </Card>
      ) : (
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
              value={due.length === 0 ? 'nenhuma' : overdue > 0 ? `${due.length} (${overdue} em atraso)` : String(due.length)}
            />
            <Row
              label="Ideias lidas hoje"
              done={ideasToday > 0}
              value={ideasToday === 0 ? 'nenhuma' : `${ideasToday} · ${cardsToday} ${cardsToday === 1 ? 'card' : 'cards'}`}
            />
            <Row
              label="Idea of the Day"
              done={Boolean(bundle?.ideaOfDay)}
              value={bundle?.ideaOfDay ? <span className="font-serif">{bundle.ideaOfDay.idea.title}</span> : 'não escolhida'}
            />
            <Row
              label="Chunks"
              done={(bundle?.chunks.length ?? 0) >= MAX_CHUNKS_PER_DAY}
              value={`${bundle?.chunks.length ?? 0}/${MAX_CHUNKS_PER_DAY}`}
            />
            <Row
              label="Speaking"
              done={speakingSec > 0}
              value={speakingSec > 0 ? formatDuration(speakingSec) : `não realizado · meta ${plan.speakingLabel}`}
            />
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
      )}

      {completed && bundle && <DaySummary sessionId={bundle.session.id} />}
      <TodaySuggestion date={date} />
      {!weekend && <ActionFollowUp actions={actions ?? []} />}
      <Routine date={date} />

      {totalSessions > 0 && (
        <Link to="/weekly" className="block rounded-2xl border border-line bg-surface p-4 hover:bg-sunken">
          <Eyebrow>Fechamento do ciclo</Eyebrow>
          <p className="mt-1">
            {info.reference ? `Ciclo de ${formatDate(info.reference.start, 'short')} a ${formatDate(info.reference.end, 'short')}: ` : ''}
            relembrar as Ideas of the Day, Top 3 ideias e escrita curta.
          </p>
        </Link>
      )}
    </div>
  );
}
