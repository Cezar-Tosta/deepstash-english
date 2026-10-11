import { type FormEvent, useState } from 'react';
import { weekPlan } from '../../../domain/cycle';
import { addVocab, deleteVocab, updateIdea, updateSessionNotes } from '../../../services/sessions';
import { AIFeedbackPanel } from '../../components/AIFeedbackPanel';
import { Reader } from '../../components/Reader';
import { AutoTextArea, Button, Card, Eyebrow, Hint, Notice, Prompt, TextInput } from '../../components/ui';
import { attempt } from '../../toast';
import { type StepProps, NeedsText, TextHeading } from './shared';

// ---------- 4. READ ----------

export function ReadStep({ bundle, goTo }: StepProps) {
  const { session, ideaOfDay, vocab } = bundle;
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  if (!ideaOfDay) return <NeedsText goTo={goTo} />;
  const { idea, cards } = ideaOfDay;
  const withText = cards.filter((c) => c.content.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    attempt(
      addVocab(session.id, idea.id, term, meaning).then(() => {
        setTerm('');
        setMeaning('');
      }),
    );
  };

  return (
    <div className="space-y-6">
      <TextHeading item={ideaOfDay} />

      <Notice>
        Leia tudo em inglês antes de traduzir e não pare em toda palavra desconhecida. Depois, clique nas palavras e expressões que quiser
        entender: a análise aparece no contexto e pode ir para o dicionário.
      </Notice>

      {withText.length > 0 && <Reader ideaId={idea.id} cards={withText} />}

      {session.listenGist?.trim() && (
        <Card>
          <Eyebrow>O que você entendeu só ouvindo</Eyebrow>
          <p className="mt-2 whitespace-pre-wrap">{session.listenGist}</p>
          <Hint>Compare com o texto: o que você captou e o que escapou?</Hint>
        </Card>
      )}

      <div className="space-y-3">
        <Prompt>What is the main idea?</Prompt>
        <Hint>Uma frase que resuma o texto inteiro, não só o primeiro parágrafo.</Hint>
        <AutoTextArea
          label="Ideia principal, em uma frase em inglês"
          hideLabel
          value={idea.mainIdea}
          onSave={(mainIdea) => updateIdea(idea.id, { mainIdea })}
          rows={3}
          lang="en"
          placeholder="The main idea is that…"
        />
        <AIFeedbackPanel targetType="mainIdea" targetId={idea.id} text={idea.mainIdea} context={`Texto: ${idea.title}`} />
      </div>

      <Notice>
        Só agora consulte tradução ou dicionário e compare com a sua primeira interpretação. {weekPlan(session.cycleWeek).translation}
      </Notice>

      <AutoTextArea
        label="O que eu entendi errado ou não sabia?"
        value={session.misunderstood}
        onSave={(misunderstood) => updateSessionNotes(session.id, { misunderstood })}
        rows={3}
      />

      <div className="space-y-3">
        <div>
          <Eyebrow>Vocabulário de compreensão</Eyebrow>
          <Hint>Só para entender este texto. Não entra na revisão; para isso existem os chunks da próxima etapa.</Hint>
        </div>
        {vocab.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {vocab.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-serif" lang="en">
                    {v.term}
                  </span>
                  {v.meaning && <span className="text-muted"> — {v.meaning}</span>}
                </span>
                <Button small variant="ghost" aria-label={`Remover ${v.term}`} onClick={() => attempt(deleteVocab(v.id))}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextInput label="Palavra ou expressão" value={term} onChange={setTerm} lang="en" autoComplete="off" />
          <TextInput label="Significado" value={meaning} onChange={setMeaning} autoComplete="off" />
          <Button type="submit" variant="secondary" disabled={!term.trim()}>
            Anotar
          </Button>
        </form>
      </div>
    </div>
  );
}
