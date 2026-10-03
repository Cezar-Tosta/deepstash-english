import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isDifficult, isDue } from '../../domain/chunks';
import { formatDate } from '../../domain/dates';
import { scheduler } from '../../domain/srs';
import type { ISODate, Rating } from '../../domain/types';
import type { ChunkWithHistory } from '../../services/library';
import { reactivateChunk, retireChunk } from '../../services/reviews';
import { deleteChunk } from '../../services/sessions';
import { attempt, showToast } from '../toast';
import { Badge, Button } from './ui';

const RATING_LABEL: Record<Rating, string> = {
  AGAIN: 'não lembrei',
  HARD: 'difícil',
  GOOD: 'lembrei',
  EASY: 'muito fácil',
};

function StatusBadge({ item, date }: { item: ChunkWithHistory; date: ISODate }) {
  const { chunk, reviews } = item;
  if (chunk.status === 'retired') return <Badge tone="good">Já uso</Badge>;
  if (chunk.status === 'learned') return <Badge tone="good">Learned</Badge>;
  if (isDue(chunk, date)) return <Badge tone="warn">Due</Badge>;
  if (isDifficult(chunk, reviews)) return <Badge tone="warn">Difficult</Badge>;
  return <Badge tone={chunk.status === 'new' ? 'accent' : 'muted'}>{chunk.status === 'new' ? 'New' : 'Learning'}</Badge>;
}

/** Um chunk com tudo o que se sabe dele: frases, origem, próxima revisão e histórico. */
export function ChunkItem({ item, date, linkToIdea = true }: { item: ChunkWithHistory; date: ISODate; linkToIdea?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { chunk, reviews, recall, sourceIdea } = item;
  const active = chunk.status === 'new' || chunk.status === 'learning';

  return (
    <li className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-16 w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span>
          <span className="block font-serif text-lg leading-snug" lang="en">
            {chunk.text}
          </span>
          {chunk.meaning && <span className="block text-sm text-muted">{chunk.meaning}</span>}
        </span>
        <StatusBadge item={item} date={date} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-5 py-4 text-sm">
          <dl className="space-y-3">
            {chunk.originalSentence && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Frase original</dt>
                <dd className="font-serif text-base" lang="en">{chunk.originalSentence}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Minha frase</dt>
              <dd className={chunk.userSentence ? 'font-serif text-base' : 'text-muted'} lang="en">
                {chunk.userSentence || 'Ainda sem frase.'}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Criado em</dt>
                <dd>{formatDate(chunk.createdDate, 'medium')}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Próxima revisão</dt>
                <dd>
                  {chunk.nextReviewDate
                    ? `${formatDate(chunk.nextReviewDate, 'medium')} · ${scheduler.stageLabel(chunk.stage)}`
                    : 'nenhuma'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Acertos / erros</dt>
                <dd className="tabular-nums">
                  {recall.recalled} / {recall.missed}
                </dd>
              </div>
              {sourceIdea && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Ideia de origem</dt>
                  <dd>
                    {linkToIdea ? (
                      <Link to={`/knowledge/idea/${sourceIdea.id}`} className="text-accent underline underline-offset-2">
                        {sourceIdea.title}
                      </Link>
                    ) : (
                      sourceIdea.title
                    )}
                  </dd>
                </div>
              )}
            </div>
          </dl>

          {reviews.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Histórico</p>
              <ol className="mt-1 space-y-1">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <span className="tabular-nums">{formatDate(r.completedDate, 'short')}</span> ·{' '}
                    {scheduler.stageLabel(r.stage)} · {RATING_LABEL[r.rating]}
                    {r.userSentence && (
                      <span className="block pl-3 font-serif text-muted" lang="en">
                        “{r.userSentence}”
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {active ? (
              <Button small variant="secondary" onClick={() => attempt(retireChunk(chunk.id))}>
                Já uso espontaneamente · tirar da revisão
              </Button>
            ) : (
              <Button small variant="secondary" onClick={() => attempt(reactivateChunk(chunk.id, date))}>
                Voltar para a revisão
              </Button>
            )}
            {!confirming && (
              <Button small variant="danger" aria-label={`Excluir o chunk ${chunk.text}`} onClick={() => setConfirming(true)}>
                Excluir
              </Button>
            )}
          </div>
          {confirming && (
            <div role="alert" className="rounded-xl bg-sunken p-3">
              <p>
                Excluir <span className="font-serif" lang="en">“{chunk.text}”</span>? O histórico de revisões dele é
                apagado e o destaque some de todos os textos. Não dá para desfazer.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  small
                  variant="danger"
                  onClick={() => attempt(deleteChunk(chunk.id).then(() => showToast(`"${chunk.text}" excluído.`)))}
                >
                  Confirmar exclusão
                </Button>
                <Button small variant="ghost" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
