import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { weekPlan } from '../../domain/cycle';
import { MAX_CHUNKS_PER_DAY, ROUTINE, STEPS } from '../../domain/session';
import type { StepId } from '../../domain/types';
import { FOLLOW_UP_DAYS } from '../../services/study';
import { Card, PageTitle } from '../components/ui';

/** O que fazer em cada etapa da sessão e o erro mais comum a evitar. */
const STEP_GUIDE: Record<StepId, { todo: string; avoid: string }> = {
  review: {
    todo: 'Para cada expressão agendada, tente lembrar o significado e diga ou escreva uma frase com ela. Só então clique em REVELAR e avalie com honestidade.',
    avoid: 'Revelar antes de tentar. O esforço de lembrar é o que fixa.',
  },
  read: {
    todo: 'Leia no Deepstash as ideias do dia, em inglês, do primeiro ao último card. Registre o livro e o título de cada ideia e escreva, em uma frase, a ideia principal. Para guardar o texto, use “Importar a ideia inteira”.',
    avoid: 'Parar em cada palavra desconhecida ou traduzir antes de entender o conjunto.',
  },
  focus: {
    todo: 'Entre as ideias lidas, escolha uma só: a mais útil ou interessante para você. É ela que será aprofundada nas próximas etapas.',
    avoid: 'Querer aprofundar todas. O método funciona porque aprofunda uma.',
  },
  check: {
    todo: 'Escreva a ideia principal em uma frase em inglês. Depois, e só depois, consulte tradução ou dicionário e anote o que você tinha entendido errado.',
    avoid: 'Copiar uma frase do card como se fosse o seu resumo.',
  },
  mine: {
    todo: `Escolha no máximo ${MAX_CHUNKS_PER_DAY} expressões que você conseguiria usar em outras situações, com significado e a frase em que apareceram.`,
    avoid: 'Guardar palavras soltas ou tudo o que não conhecia. Para isso existe o dicionário.',
  },
  retell: {
    todo: 'Feche o Deepstash, clique em INICIAR e reconte a ideia em voz alta, do começo ao fim, com as suas palavras. A fala é gravada; ouça-se depois.',
    avoid: 'Ler o texto, decorar um roteiro ou recomeçar a cada erro.',
  },
  personalize: {
    todo: 'Escreva uma frase sua com cada chunk, ligada ao seu trabalho, estudo ou rotina.',
    avoid: 'Repetir a frase original trocando uma palavra.',
  },
  reflect: {
    todo: 'Responda em inglês: você concorda com a ideia? Por quê? Vale concordar, discordar ou concordar em parte.',
    avoid: 'Apenas resumir a ideia de novo, sem tomar posição.',
  },
  sowhat: {
    todo: 'Escreva uma ação concreta e pequena, começando por “I’ll…”. Ela será cobrada alguns dias depois.',
    avoid: 'Intenções vagas, como “I’ll be more focused”.',
  },
  schedule: {
    todo: 'Confira o resumo do dia e as datas das próximas revisões e clique em FINALIZAR SESSÃO.',
    avoid: 'Sair sem finalizar: a sessão fica como incompleta no histórico.',
  },
};

function Chapter({ number, title, when, children }: { number: number; title: string; when?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-lg font-semibold tracking-tight">
          <span className="text-muted">{number}.</span> {title}
        </h2>
        {when && <span className="text-xs font-semibold tracking-wide text-accent uppercase">{when}</span>}
      </div>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed">{children}</div>
    </Card>
  );
}

function Go({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-10 items-center font-medium text-accent underline underline-offset-2">
      {children} →
    </Link>
  );
}

/** Manual de uso: a sequência correta de estudos, do primeiro acesso ao ciclo de 4 semanas. */
export function ManualPage() {
  const totalMinutes = STEPS.reduce((sum, s) => sum + s.minutes, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle eyebrow="Manual" title="Como estudar com o sistema">
        A sequência completa, na ordem em que as coisas acontecem.
      </PageTitle>

      <Chapter number={1} title="A ideia geral">
        <p>
          O Deepstash apresenta <strong>livros</strong>; cada livro tem várias <strong>ideias</strong>; cada ideia é uma
          sequência de <strong>cards</strong>, lida como uma história. O sistema usa essa leitura para treinar inglês em
          quatro movimentos:
        </p>
        <ol className="list-inside list-decimal space-y-1">
          <li>
            <strong>Ler</strong> as ideias do dia e entender cada uma.
          </li>
          <li>
            <strong>Aprofundar 1</strong> ideia (a Idea of the Day).
          </li>
          <li>
            <strong>Guardar até {MAX_CHUNKS_PER_DAY}</strong> expressões úteis (chunks), que voltam em revisões.
          </li>
          <li>
            <strong>Falar 1</strong> vez: recontar a ideia em voz alta.
          </li>
        </ol>
        <p>
          A regra que vale em todas as telas: <strong>você tenta primeiro</strong>. Tradução, resposta e retorno da IA
          vêm depois da sua tentativa.
        </p>
      </Chapter>

      <Chapter number={2} title="Antes de começar" when="Uma vez">
        <ul className="list-inside list-disc space-y-1">
          <li>Entre com o seu e-mail e senha. Seus estudos ficam na sua conta e aparecem em qualquer navegador.</li>
          <li>
            Opcional: em Settings, configure a IA (por exemplo, Groq). Com ela você ganha tradução ao clicar nas
            palavras, transcrição da sua fala, correções e orientação em cada etapa. A chave é informada em cada
            navegador. Sem IA, tudo o mais funciona.
          </li>
        </ul>
        <Go to="/settings">Abrir Settings</Go>
      </Chapter>

      <Chapter number={3} title="A sessão diária" when={`Todo dia · ~${totalMinutes} min`}>
        <p>
          Na tela Today, clique em COMEÇAR SESSÃO. São {STEPS.length} etapas, uma por tela, e tudo é salvo sozinho. Você
          pode voltar, pular e retomar mais tarde no mesmo dia.
        </p>
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={step.id} className="border-l-2 border-line pl-3">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold">
                  {i + 1}. {step.label}
                </span>
                <span className="text-xs text-muted">~{step.minutes} min</span>
              </p>
              <p>{STEP_GUIDE[step.id].todo}</p>
              <p className="text-sm text-muted">Evite: {STEP_GUIDE[step.id].avoid}</p>
            </li>
          ))}
        </ol>
        <p>
          Travou em alguma etapa? Com a IA ligada, o botão <em>“Como fazer esta etapa?”</em> dá sugestões com base no
          que você está lendo. Não há número certo de ideias por dia: uma já vale.
        </p>
        <Go to="/session">Ir para a sessão de hoje</Go>
      </Chapter>

      <Chapter number={4} title="Revisões dos chunks" when="D1, D3, D7, D14 e D30">
        <p>
          Cada chunk volta 1, 3, 7, 14 e 30 dias depois de aprendido. As revisões do dia aparecem na primeira etapa da
          sessão e no menu Review (o número no ícone indica quantas há).
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Não lembrei:</strong> volta amanhã.
          </li>
          <li>
            <strong>Difícil:</strong> repete com intervalo menor.
          </li>
          <li>
            <strong>Lembrei:</strong> segue o calendário.
          </li>
          <li>
            <strong>Muito fácil:</strong> pula uma revisão.
          </li>
        </ul>
        <p>Se você já usa a expressão sem pensar, tire-a da revisão em Knowledge → My English.</p>
        <Go to="/review">Abrir Review</Go>
      </Chapter>

      <Chapter number={5} title="Did you do it?" when={`${FOLLOW_UP_DAYS} dias depois`}>
        <p>
          {FOLLOW_UP_DAYS} dias depois de cada “So what?”, a tela Today pergunta se você fez o que se propôs. Conte em
          inglês o que aconteceu e marque <em>Yes, I did it</em>, <em>Partly</em> ou <em>Not yet</em>. É isso que
          transforma a leitura em mudança de hábito.
        </p>
        <Go to="/">Abrir Today</Go>
      </Chapter>

      <Chapter number={6} title="Reler e montar o dicionário" when="Quando quiser">
        <p>
          Em Knowledge → Livros, abra um livro e depois uma ideia. Nos cards, <strong>clique em uma palavra</strong>{' '}
          para ver tradução, pronúncia e explicação naquele contexto; para uma expressão, clique na primeira e depois na
          última palavra. “Adicionar ao dicionário” é opcional.
        </p>
        <p>
          O que já está no dicionário ou nos chunks aparece sublinhado em todos os textos: passe o mouse para rever. Use
          “Ouvir”, com velocidade reduzida e repetição, para treinar o ouvido.
        </p>
        <p className="text-sm text-muted">
          Dicionário e chunks são coisas diferentes: o dicionário serve para entender e alimenta os exercícios; só os
          chunks entram nas revisões espaçadas.
        </p>
        <Go to="/knowledge">Abrir Knowledge</Go>
      </Chapter>

      <Chapter number={7} title="Exercícios" when="2 a 3 vezes por semana">
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Treino:</strong> escolha 5, 10 ou 15 termos. Ele começa pelos que você mais erra e alterna três
            perguntas: lembrar pelo significado, completar a frase e escrever o que ouviu. O que você erra volta na
            mesma rodada.
          </li>
          <li>
            <strong>Flashcards:</strong> escolha quantos e de onde (dicionário, chunks ou os dois), tente lembrar, vire
            e marque se sabia.
          </li>
        </ul>
        <p>O quadro “Onde você mais erra” mostra em que vale insistir.</p>
        <Go to="/practice">Abrir Practice</Go>
      </Chapter>

      <Chapter number={8} title="Fechamento da semana" when="1 vez por semana">
        <ol className="list-inside list-decimal space-y-1">
          <li>Sem reler, tente lembrar a ideia central de cada Idea of the Day; depois revele suas anotações.</li>
          <li>Escolha as 3 melhores ideias da semana.</li>
          <li>Marque os chunks que você já usa espontaneamente.</li>
          <li>Ouça as suas falas da semana, da primeira à última, e note o que evoluiu.</li>
          <li>Fale 2 a 3 minutos, sem roteiro, sobre uma das 3 ideias.</li>
          <li>Opcional: escreva 80 a 120 palavras de uma vez; revise só depois de finalizar.</li>
          <li>Confira o balanço e dê uma nota de 1 a 5 à sua consistência.</li>
        </ol>
        <p className="text-sm text-muted">Os áudios só existem no navegador em que foram gravados.</p>
        <Go to="/weekly">Abrir o Weekly review</Go>
      </Chapter>

      <Chapter number={9} title="Ao terminar um livro" when="A cada livro">
        <p>
          Na página do livro, explique-o em voz alta em 2 minutos, como se contasse a um amigo, e escreva em inglês o que
          fica dele para você. Depois marque o livro como concluído.
        </p>
        <Go to="/knowledge">Abrir os livros</Go>
      </Chapter>

      <Chapter number={10} title="A progressão de 4 semanas" when="A cada 4 semanas">
        <p>A exigência sobe aos poucos; ao fim da quarta semana, o ciclo recomeça mantendo todo o histórico.</p>
        <ol className="space-y-2">
          {[1, 2, 3, 4].map((week) => {
            const plan = weekPlan(week);
            return (
              <li key={week} className="border-l-2 border-line pl-3">
                <span className="font-semibold">Semana {week}:</span> {plan.focus} Fala de {plan.speakingLabel}.{' '}
                {plan.translation}
              </li>
            );
          })}
        </ol>
        <Go to="/progress">Acompanhar em Progress</Go>
      </Chapter>

      <Chapter number={11} title="Resumo: o que fazer e quando">
        <ul className="divide-y divide-line">
          {ROUTINE.map((r) => (
            <li key={r.activity} className="py-2">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{r.activity}</span>
                <span className="text-sm text-accent">{r.frequency}</span>
              </p>
              <p className="text-sm text-muted">{r.detail}</p>
            </li>
          ))}
        </ul>
      </Chapter>

      <Chapter number={12} title="Se algo sair do trilho">
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Perdi um dia:</strong> siga em frente. As revisões atrasadas continuam na fila e são reagendadas a
            partir do dia em que você as fizer.
          </li>
          <li>
            <strong>Quero refazer uma semana:</strong> em Progress, escolha a semana e use “Resetar esta semana”. Não dá
            para desfazer.
          </li>
          <li>
            <strong>Quero recomeçar tudo:</strong> Settings → “Recomeçar do zero”. Exporte um backup antes, se quiser
            guardar.
          </li>
          <li>
            <strong>Apareceu “Qual versão vale?”:</strong> dois navegadores mudaram dados sem se sincronizar. Escolha o
            lado mais completo; o outro é substituído.
          </li>
        </ul>
      </Chapter>
    </div>
  );
}
