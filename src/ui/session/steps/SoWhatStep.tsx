import { saveReflection } from '../../../services/sessions';
import { AIFeedbackPanel } from '../../components/AIFeedbackPanel';
import { AutoTextArea, Hint, Prompt } from '../../components/ui';
import { type StepProps, NeedsText } from './shared';

// ---------- 10. SO WHAT? ----------

export function SoWhatStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, reflection } = bundle;
  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const { idea } = ideaOfDay;
  return (
    <div className="space-y-4">
      <div>
        <Prompt>What will I do differently because I learned this?</Prompt>
        <Hint>Information → Reflection → Action. Uma ação concreta, começando por “I’ll…”.</Hint>
      </div>
      <AutoTextArea
        label="Em português: o que vou fazer de diferente (rascunho)"
        value={reflection?.soWhatPt ?? ''}
        onSave={(soWhatPt) => saveReflection(session.id, idea.id, { soWhatPt })}
        rows={2}
        placeholder="Uma ação pequena e concreta. Depois escreva em inglês, abaixo."
      />
      <Hint>A orientação da IA (“Como fazer esta etapa?”, no topo) leva este rascunho em conta.</Hint>
      <AutoTextArea
        label="So what?"
        value={reflection?.soWhat ?? ''}
        onSave={(soWhat) => saveReflection(session.id, idea.id, { soWhat })}
        rows={3}
        lang="en"
        placeholder="I’ll…"
      />
      <AIFeedbackPanel
        targetType="soWhat"
        targetId={idea.id}
        text={reflection?.soWhat ?? ''}
        context={`Ação a partir do texto "${idea.title}".`}
      />
    </div>
  );
}
