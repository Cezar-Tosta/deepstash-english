import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useEffect, useState } from 'react';
import { firstParagraphsWithin, TEXT_MAX_WORDS, TEXT_MIN_WORDS, textProfile } from '../../../domain/textLevel';
import { countWords } from '../../../domain/session';
import {
  addIdea,
  deleteIdea,
  type IdeaWithCards,
  lastBookTitle,
  setIdeaOfDay,
  splitIntoCards,
  updateIdea,
} from '../../../services/sessions';
import { CardSequence } from '../../components/CardSequence';
import { IdeaImport } from '../../components/IdeaImport';
import { AutoTextArea, Badge, Button, Card, Hint, Notice, TextArea, TextInput } from '../../components/ui';
import { attempt } from '../../toast';
import { type StepProps, paragraphCount } from './shared';

// ---------- 2. TEXT ----------

/** Tamanho e nível estimado do texto colado, com a sugestão de um trecho quando ele é longo demais para uma sessão. */
function TextAdvice({ paragraphs, onTrim }: { paragraphs: string[]; onTrim: (kept: string[]) => void }) {
  const profile = textProfile(paragraphs.join('\n\n'));
  const excerpt = firstParagraphsWithin(paragraphs, TEXT_MAX_WORDS);
  const excerptWords = countWords(excerpt.join(' '));
  return (
    <div className="space-y-2">
      <Hint>
        {paragraphCount(paragraphs.length)} · {profile.words} palavras
        {profile.level && ` · nível aproximado ${profile.level} (frases de ${Math.round(profile.wordsPerSentence)} palavras em média)`}
      </Hint>
      {profile.words > TEXT_MAX_WORDS && (
        <Notice tone="warn">
          <p>Texto longo para uma sessão: o LISTEN, o READ ALOUD e o RETELL ficam pesados. Estude um trecho hoje e o resto em outro dia.</p>
          {excerpt.length < paragraphs.length && (
            <Button small variant="secondary" className="mt-2" onClick={() => onTrim(excerpt)}>
              Usar só os primeiros {paragraphCount(excerpt.length)} ({excerptWords} palavras)
            </Button>
          )}
        </Notice>
      )}
      {profile.words > 0 && profile.words < TEXT_MIN_WORDS && (
        <Hint>Texto curto: serve num dia corrido, mas com 150 a 400 palavras há mais material para os chunks e o reconto.</Hint>
      )}
    </div>
  );
}

function TextEditor({ item, current, onlyOne }: { item: IdeaWithCards; current: boolean; onlyOne: boolean }) {
  const [open, setOpen] = useState<'paragraphs' | 'details' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { idea, cards } = item;
  const toggle = (panel: 'paragraphs' | 'details') => setOpen(open === panel ? null : panel);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-serif text-lg leading-snug break-words">{idea.title}</h4>
          <p className="text-sm text-muted">{[idea.bookTitle, paragraphCount(cards.length)].filter(Boolean).join(' · ')}</p>
        </div>
        {current && !onlyOne && <Badge tone="accent">Em estudo</Badge>}
      </div>
      {!current && (
        <div className="mt-2">
          <Button small variant="secondary" onClick={() => attempt(setIdeaOfDay(idea.sessionId, idea.id))}>
            Estudar este texto hoje
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-5">
        <button
          type="button"
          aria-expanded={open === 'paragraphs'}
          onClick={() => toggle('paragraphs')}
          className="min-h-10 text-sm font-medium text-accent"
        >
          Parágrafos ({cards.length})
        </button>
        <button
          type="button"
          aria-expanded={open === 'details'}
          onClick={() => toggle('details')}
          className="min-h-10 text-sm font-medium text-accent"
        >
          Título, fonte, tema e observações
        </button>
      </div>

      {open === 'paragraphs' && (
        <div className="mt-2">
          <Hint>Para não estragar o LISTEN, confira os parágrafos só se precisar corrigir algo.</Hint>
          <CardSequence item={item} />
        </div>
      )}

      {open === 'details' && (
        <div className="mt-2 space-y-3">
          <AutoTextArea label="Título" value={idea.title} onSave={(title) => updateIdea(idea.id, { title })} rows={1} lang="en" />
          <AutoTextArea label="Fonte" value={idea.bookTitle} onSave={(bookTitle) => updateIdea(idea.id, { bookTitle })} rows={1} />
          <AutoTextArea label="Tema / categoria" value={idea.category} onSave={(category) => updateIdea(idea.id, { category })} rows={1} />
          <AutoTextArea label="Observações" value={idea.notes} onSave={(notes) => updateIdea(idea.id, { notes })} rows={2} />
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Apagar este texto e o que foi feito com ele?</span>
              <Button small variant="danger" onClick={() => attempt(deleteIdea(idea.id))}>
                Apagar
              </Button>
              <Button small variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button small variant="danger" onClick={() => setConfirming(true)}>
              Apagar texto
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function TextStep({ bundle, goTo }: StepProps) {
  const { session, ideas } = bundle;
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const remembered = useLiveQuery(lastBookTitle, [ideas.length]);
  const paragraphs = splitIntoCards(body);

  // Sugere a fonte do último texto registrado, até o usuário digitar outra.
  useEffect(() => {
    if (source === null && remembered !== undefined) setSource(remembered);
  }, [source, remembered]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || paragraphs.length === 0) return;
    attempt(
      addIdea(session.id, { title, bookTitle: source ?? '', cards: paragraphs }).then(() => {
        setTitle('');
        setBody('');
      }),
    );
  };

  if (ideas.length > 0) {
    return (
      <div className="space-y-4">
        {ideas.map((item) => (
          <TextEditor key={item.idea.id} item={item} current={item.idea.id === session.ideaOfDayId} onlyOne={ideas.length === 1} />
        ))}
        <Notice>
          Texto registrado. Agora vem o <strong>LISTEN</strong>: ouça antes de ler, para treinar o ouvido sem o apoio da escrita.
        </Notice>
        <Button onClick={() => goTo('listen')}>Ir para o LISTEN</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Notice>
        Qualquer texto em inglês serve: artigo, notícia, página de livro, post, letra de música. Para uma sessão, de 150 a 400 palavras é um
        bom tamanho. <strong>Cole sem ler</strong>: a primeira passada será só ouvindo.
      </Notice>

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line p-4">
        <TextInput label="Título" value={title} onChange={setTitle} lang="en" placeholder="Why we sleep" autoComplete="off" />
        <TextInput
          label="Fonte (opcional)"
          value={source ?? ''}
          onChange={setSource}
          autoComplete="off"
          placeholder="Livro, site, autor…"
        />
        <TextArea
          label="Texto"
          value={body}
          onChange={setBody}
          rows={8}
          lang="en"
          placeholder="Cole o texto aqui. Cada parágrafo fica separado do outro por uma quebra de linha."
        />
        {body.trim() && <TextAdvice paragraphs={paragraphs} onTrim={(kept) => setBody(kept.join('\n\n'))} />}
        <Button type="submit" block disabled={!title.trim() || paragraphs.length === 0}>
          Registrar o texto
        </Button>
        <IdeaImport
          onImported={(imported) => {
            if (imported.title && !title.trim()) setTitle(imported.title);
            setBody(imported.cards.join('\n\n'));
          }}
        />
      </form>
    </div>
  );
}
