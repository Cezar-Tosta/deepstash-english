import { Link } from 'react-router-dom';
import { formatDate } from '../../domain/dates';
import type { FollowUpStatus } from '../../domain/types';
import { type PendingAction, saveFollowUp } from '../../services/study';
import { attempt } from '../toast';
import { AIFeedbackPanel } from './AIFeedbackPanel';
import { AutoTextArea, Button, Card, Eyebrow } from './ui';

const ANSWERS: { status: FollowUpStatus; label: string }[] = [
  { status: 'done', label: 'Yes, I did it' },
  { status: 'partly', label: 'Partly' },
  { status: 'not', label: 'Not yet' },
];

export const FOLLOW_UP_LABEL: Record<FollowUpStatus, string> = {
  done: 'Yes, I did it',
  partly: 'Partly',
  not: 'Not yet',
};

/**
 * Fecha o ciclo informação → reflexão → ação: dias depois de registrar um "I'll…",
 * o app pergunta se a ação aconteceu. Responder é o que tira o item da lista.
 */
export function ActionFollowUp({ actions }: { actions: readonly PendingAction[] }) {
  if (actions.length === 0) return null;
  return (
    <Card>
      <Eyebrow>Did you do it?</Eyebrow>
      <ul className="mt-3 space-y-6">
        {actions.map(({ reflection, idea }) => (
          <li key={reflection.id}>
            <p className="text-xs text-muted">
              <Link to={`/knowledge/idea/${idea.id}`} className="underline underline-offset-2">
                {idea.title}
              </Link>{' '}
              · {formatDate(idea.date, 'medium')}
            </p>
            <p className="mt-1 font-serif text-lg" lang="en">
              “{reflection.soWhat}”
            </p>
            <div className="mt-3">
              <AutoTextArea
                label="What happened?"
                value={reflection.followUp ?? ''}
                onSave={(text) => saveFollowUp(reflection.id, { text })}
                rows={2}
                lang="en"
                placeholder="Escreva em inglês, mesmo que seja uma frase."
              />
              <AIFeedbackPanel
                targetType="followUp"
                targetId={reflection.id}
                text={reflection.followUp ?? ''}
                context={`O aluno conta o que aconteceu com a ação: "${reflection.soWhat}"`}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ANSWERS.map(({ status, label }) => (
                <Button key={status} small variant="secondary" onClick={() => attempt(saveFollowUp(reflection.id, { status }))}>
                  {label}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
