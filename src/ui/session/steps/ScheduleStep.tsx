import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate, formatDuration } from '../../../domain/dates';
import { countWords } from '../../../domain/session';
import { scheduler } from '../../../domain/srs';
import { getUpcoming } from '../../../services/reviews';
import { DaySummary } from '../../components/DaySummary';
import { Card, Eyebrow } from '../../components/ui';
import { type StepProps } from './shared';

// ---------- 11. SCHEDULE REVIEW ----------

function inDaysLabel(days: number): string {
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}

export function ScheduleStep({ bundle }: StepProps) {
  const { session, ideaOfDay, chunks, speaking, reflection } = bundle;
  const upcoming = useLiveQuery(() => getUpcoming(session.date, 30), [session.date, chunks.length]);
  const seconds = (kind: 'daily' | 'aloud'): number => speaking.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.durationSec, 0);
  const retellSec = seconds('daily');
  const aloudSec = seconds('aloud');
  const answers = session.listenAnswers ?? [];
  const listenScore = answers.length > 0 ? Math.round((answers.reduce((sum, a) => sum + a.score, 0) / answers.length) * 100) : null;
  const sentences = chunks.filter((c) => c.userSentence.trim()).length;
  const words = countWords([...chunks.map((c) => c.userSentence), reflection?.userOpinion ?? '', reflection?.soWhat ?? ''].join(' '));

  const groups: { skill: string; lines: [string, boolean][] }[] = [
    {
      skill: 'Listening',
      lines: [
        [session.listenGist?.trim() ? 'Gist written after listening' : 'No gist', Boolean(session.listenGist?.trim())],
        [
          listenScore === null
            ? 'No dictation'
            : `Dictation: ${answers.length} ${answers.length === 1 ? 'sentence' : 'sentences'}, ${listenScore}% right`,
          listenScore !== null,
        ],
      ],
    },
    {
      skill: 'Reading',
      lines: [
        [
          ideaOfDay ? `1 text read (${ideaOfDay.cards.length} ${ideaOfDay.cards.length === 1 ? 'paragraph' : 'paragraphs'})` : 'No text',
          ideaOfDay !== null,
        ],
        [ideaOfDay?.idea.mainIdea.trim() ? 'Main idea written' : 'No main idea', Boolean(ideaOfDay?.idea.mainIdea.trim())],
        [`${chunks.length} ${chunks.length === 1 ? 'chunk' : 'chunks'} learned`, chunks.length > 0],
      ],
    },
    {
      skill: 'Speaking',
      lines: [
        [`${formatDuration(aloudSec)} reading aloud`, aloudSec > 0],
        [`${formatDuration(retellSec)} retelling`, retellSec > 0],
      ],
    },
    {
      skill: 'Writing',
      lines: [
        [`${sentences} personal ${sentences === 1 ? 'sentence' : 'sentences'}`, sentences > 0],
        [reflection?.userOpinion.trim() ? '1 reflection' : 'No reflection', Boolean(reflection?.userOpinion.trim())],
        [reflection?.soWhat.trim() ? '1 action' : 'No action', Boolean(reflection?.soWhat.trim())],
        [`${words} words written`, words > 0],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <Eyebrow>{session.status === 'completed' ? 'Today completed' : 'Resumo de hoje'}</Eyebrow>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.skill}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{group.skill}</p>
              <ul className="mt-1 space-y-1 font-serif" lang="en">
                {group.lines.map(([label, done]) => (
                  <li key={label} className={done ? '' : 'text-muted'}>
                    <span aria-hidden="true">{done ? '✓' : '·'}</span> {label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <DaySummary sessionId={session.id} />

      {chunks.length > 0 && (
        <div className="space-y-3">
          <Eyebrow>Chunks de hoje e suas revisões</Eyebrow>
          {chunks.map((chunk) => (
            <Card key={chunk.id}>
              <p className="font-serif text-lg" lang="en">
                {chunk.text}
              </p>
              <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                {scheduler.plan(chunk.createdDate).map((p) => (
                  <li key={p.stage}>
                    <span className="font-semibold text-ink">{p.label}</span> {formatDate(p.date, 'short')}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}

      {upcoming && upcoming.length > 0 && (
        <Card>
          <Eyebrow>Next reviews</Eyebrow>
          <ul className="mt-3 space-y-1.5">
            {upcoming.slice(0, 5).map((u) => (
              <li key={u.date} className="flex justify-between">
                <span>
                  {inDaysLabel(u.inDays)} <span className="text-muted">· {formatDate(u.date, 'short')}</span>
                </span>
                <span className="font-semibold tabular-nums">{u.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
