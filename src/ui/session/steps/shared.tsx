import { textProfile } from '../../../domain/textLevel';
import { countWords } from '../../../domain/session';
import type { StepId } from '../../../domain/types';
import type { IdeaWithCards, SessionBundle } from '../../../services/sessions';
import { Button, EmptyState, Eyebrow } from '../../components/ui';

export interface StepProps {
  bundle: SessionBundle;
  goTo: (step: StepId) => void;
}

export const paragraphCount = (n: number): string => `${n} ${n === 1 ? 'parágrafo' : 'parágrafos'}`;

/** Os parágrafos com texto, na ordem de leitura. */
export const paragraphsOf = (item: IdeaWithCards): string[] => item.cards.map((c) => c.content.trim()).filter(Boolean);

export function NeedsText({ goTo }: Pick<StepProps, 'goTo'>) {
  return (
    <EmptyState title="Nenhum texto registrado hoje.">
      <p className="mb-4">Esta etapa trabalha o texto do dia. Registre-o primeiro.</p>
      <Button onClick={() => goTo('text')}>Registrar o texto</Button>
    </EmptyState>
  );
}

/** O nível aproximado do texto, para o cabeçalho. */
export function levelLabel(item: IdeaWithCards): string {
  const level = textProfile(paragraphsOf(item).join('\n\n')).level;
  return level ? `nível ~${level}` : '';
}

/** Cabeçalho do texto em estudo, com a fonte de onde ele vem. */
export function TextHeading({ item }: { item: IdeaWithCards }) {
  return (
    <div>
      <Eyebrow>Texto do dia</Eyebrow>
      <h3 className="mt-1 font-serif text-xl">{item.idea.title}</h3>
      <p className="text-sm text-muted">
        {[item.idea.bookTitle, paragraphCount(item.cards.length), `${countWords(paragraphsOf(item).join(' '))} palavras`, levelLabel(item)]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}
