import { saveReflection } from '../../../services/sessions';
import { AIFeedbackPanel } from '../../components/AIFeedbackPanel';
import { AutoTextArea, Hint, Prompt, type StarterGroup } from '../../components/ui';
import { type StepProps, NeedsText } from './shared';

// ---------- 9. REFLECT ----------

/** Conectores para montar a opinião, agrupados pelo que fazem na frase. */
const REFLECT_CONNECTORS: readonly StarterGroup[] = [
  {
    label: 'Opinar',
    items: [
      'I agree because',
      'I disagree because',
      'I partly agree because',
      'In my opinion,',
      'From my perspective,',
      'It seems to me that',
    ],
  },
  {
    label: 'Contrastar',
    items: ['However,', 'On the other hand,', 'Although', 'Even though', 'Nevertheless,', 'While this is true,'],
  },
  {
    label: 'Explicar',
    items: ['because', 'since', 'That is why', 'As a result,', 'Therefore,', 'This means that'],
  },
  {
    label: 'Exemplificar',
    items: ['For example,', 'For instance,', 'In my experience,', 'A good example is', 'such as'],
  },
  {
    label: 'Condicionar',
    items: ['It depends on', 'If', 'Unless', 'As long as', 'In some cases,'],
  },
  {
    label: 'Acrescentar',
    items: ['Also,', 'In addition,', 'Besides,', 'What is more,', 'Not only … but also'],
  },
  {
    label: 'Concluir',
    items: ['So,', 'In short,', 'Overall,', 'All things considered,', 'To sum up,'],
  },
];

export function ReflectStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, reflection } = bundle;
  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const { idea } = ideaOfDay;
  return (
    <div className="space-y-4">
      <div>
        <Prompt>Do I agree with this text? Why?</Prompt>
        <Hint>Questione as ideias de “{idea.title}”: concorde, discorde ou qualifique.</Hint>
      </div>
      <AutoTextArea
        label="Em português: o que eu penso sobre o texto (rascunho)"
        value={reflection?.opinionPt ?? ''}
        onSave={(opinionPt) => saveReflection(session.id, idea.id, { opinionPt })}
        rows={3}
        placeholder="Organize o raciocínio aqui. Depois escreva em inglês, abaixo."
      />
      <Hint>A orientação da IA (“Como fazer esta etapa?”, no topo) leva este rascunho em conta.</Hint>
      <AutoTextArea
        label="My view"
        value={reflection?.userOpinion ?? ''}
        onSave={(userOpinion) => saveReflection(session.id, idea.id, { userOpinion })}
        rows={5}
        lang="en"
        starterGroups={REFLECT_CONNECTORS}
      />
      <AIFeedbackPanel
        targetType="opinion"
        targetId={idea.id}
        text={reflection?.userOpinion ?? ''}
        context={`Opinião sobre o texto "${idea.title}".`}
      />
    </div>
  );
}
