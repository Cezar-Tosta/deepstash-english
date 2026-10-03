import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MAX_CHUNKS_PER_DAY, ROUTINE, STEPS } from '../../domain/session';
import type { StepId } from '../../domain/types';
import { Card, Eyebrow, PageTitle } from '../components/ui';

/** O essencial de cada etapa, em uma linha. */
const STEP_ACTION: Record<StepId, string> = {
  review: 'Lembre a expressão e diga uma frase; só então revele.',
  read: 'Leia as ideias em inglês, sem traduzir. Registre livro, título e ideia principal.',
  focus: 'Escolha uma ideia para aprofundar.',
  check: 'Resuma em uma frase em inglês; depois confira a tradução.',
  mine: `Guarde até ${MAX_CHUNKS_PER_DAY} expressões reutilizáveis.`,
  retell: 'Feche o Deepstash e reconte a ideia em voz alta.',
  personalize: 'Escreva uma frase sua com cada chunk.',
  reflect: 'Concordo? Por quê? Rascunhe em português, escreva em inglês.',
  sowhat: 'Defina uma ação concreta: “I’ll…”.',
  schedule: 'Confira as próximas revisões e finalize.',
};

/** As etapas agrupadas nos quatro movimentos do método. */
const PHASES: { name: string; steps: StepId[] }[] = [
  { name: 'Recuperar', steps: ['review'] },
  { name: 'Ler e entender', steps: ['read', 'focus', 'check'] },
  { name: 'Guardar', steps: ['mine'] },
  { name: 'Produzir', steps: ['retell', 'personalize', 'reflect', 'sowhat', 'schedule'] },
];

const AFTER: { when: string; what: string; to: string }[] = [
  { when: 'D1 · D3 · D7 · D14 · D30', what: 'Revisar cada chunk', to: '/review' },
  { when: '3 dias depois', what: 'Did you do it?', to: '/' },
  { when: '2 a 3× por semana', what: 'Treino e flashcards', to: '/practice' },
  { when: 'Sábado e domingo', what: 'Só revisões', to: '/review' },
  { when: 'Sexta-feira', what: 'Weekly review', to: '/weekly' },
  { when: 'Fim do livro', what: 'Explicar o livro', to: '/knowledge' },
  { when: 'A cada 4 semanas', what: 'Sobe a meta de fala', to: '/progress' },
];

function Arrow({ down }: { down?: boolean }) {
  return (
    <span aria-hidden="true" className={`text-muted ${down ? 'block text-center leading-none' : 'self-center'}`}>
      {down ? '↓' : '→'}
    </span>
  );
}

function Box({ title, children, to }: { title: string; children: ReactNode; to?: string }) {
  const body = (
    <>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs text-muted">{children}</span>
    </>
  );
  const look = 'block min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2';
  return to ? (
    <Link to={to} className={`${look} hover:bg-sunken`}>
      {body}
    </Link>
  ) : (
    <span className={look}>{body}</span>
  );
}

/** Manual enxuto: o fluxo de estudos em uma tela. */
export function ManualPage() {
  const byId = new Map(STEPS.map((s, i) => [s.id, { ...s, number: i + 1 }]));
  const total = STEPS.reduce((sum, s) => sum + s.minutes, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageTitle eyebrow="Manual" title="O fluxo de estudos">
        Livro → ideias → cards. Em tudo, você tenta primeiro; tradução e IA vêm depois.
      </PageTitle>

      <Card>
        <Eyebrow>Visão geral</Eyebrow>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Box title="Ler" to="/session">
            as ideias do dia
          </Box>
          <span className="hidden sm:flex">
            <Arrow />
          </span>
          <Box title="Aprofundar 1" to="/session">
            Idea of the Day
          </Box>
          <span className="hidden sm:flex">
            <Arrow />
          </span>
          <Box title={`Guardar ${MAX_CHUNKS_PER_DAY}`} to="/session">
            chunks úteis
          </Box>
          <span className="hidden sm:flex">
            <Arrow />
          </span>
          <Box title="Falar 1" to="/session">
            vez, em voz alta
          </Box>
          <span className="hidden sm:flex">
            <Arrow />
          </span>
          <Box title="Revisar" to="/review">
            nos dias marcados
          </Box>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <Eyebrow>Segunda a sexta · a sessão</Eyebrow>
          <span className="text-xs font-semibold text-accent">~{total} min</span>
        </div>
        <ol className="mt-3 space-y-2">
          {PHASES.map((phase, p) => (
            <Fragment key={phase.name}>
              {p > 0 && (
                <li aria-hidden="true">
                  <Arrow down />
                </li>
              )}
              <li className="rounded-xl border border-line p-3">
                <p className="text-xs font-semibold tracking-wide text-accent uppercase">{phase.name}</p>
                <ul className="mt-1 space-y-1">
                  {phase.steps.map((id) => {
                    const step = byId.get(id);
                    if (!step) return null;
                    return (
                      <li key={id} className="flex gap-2 text-sm">
                        <span className="w-5 shrink-0 text-right text-muted tabular-nums">{step.number}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{step.label}</span> <span className="text-muted">· {step.minutes} min</span>
                          <span className="block">{STEP_ACTION[id]}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            </Fragment>
          ))}
        </ol>
        <p className="mt-3 text-sm">
          <Link to="/session" className="font-medium text-accent underline underline-offset-2">
            Ir para a sessão de hoje →
          </Link>
        </p>
      </Card>

      <Card>
        <Eyebrow>Depois da sessão</Eyebrow>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {AFTER.map((item) => (
            <li key={item.what} className="flex">
              <Box title={item.what} to={item.to}>
                {item.when}
              </Box>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted">
          A qualquer momento: em Knowledge, abra uma ideia e clique nas palavras dos cards para ver a tradução e montar o dicionário.
        </p>
      </Card>

      <Card>
        <Eyebrow>Três regras</Eyebrow>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
          <li>Tente antes de revelar, traduzir ou pedir ajuda à IA.</li>
          <li>Poucas expressões, bem aprendidas: no máximo {MAX_CHUNKS_PER_DAY} chunks por dia.</li>
          <li>Constância vale mais que quantidade: uma ideia por dia útil já conta, com quantos cards ela tiver.</li>
        </ol>
      </Card>

      <Card>
        <details>
          <summary className="min-h-8 cursor-pointer text-xs font-semibold tracking-[0.16em] text-muted uppercase">
            Frequência de cada atividade
          </summary>
          <ul className="mt-2 divide-y divide-line text-sm">
            {ROUTINE.map((r) => (
              <li key={r.activity} className="py-2">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{r.activity}</span>
                  <span className="text-accent">{r.frequency}</span>
                </p>
                <p className="text-muted">{r.detail}</p>
              </li>
            ))}
          </ul>
        </details>
      </Card>
    </div>
  );
}
