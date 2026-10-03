import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AIError } from '../../ai/AIProvider';
import { isAIConfigured } from '../../ai/feedback';
import { deleteVerb, findVerbs, listVerbs, setVerbSelected } from '../../ai/verbs';
import type { VerbEntry } from '../../domain/types';
import { useOnline, useSettings } from '../hooks';
import { attempt, showToast } from '../toast';
import { ListenButton } from './Listen';
import { Button, Eyebrow, Hint, Spinner } from './ui';

const FORMS: { label: string; pick: (v: VerbEntry) => string }[] = [
  { label: 'Base', pick: (v) => v.base },
  { label: 'He / she / it', pick: (v) => v.thirdPerson },
  { label: 'Past simple', pick: (v) => v.past },
  { label: 'Past participle', pick: (v) => v.participle },
  { label: '-ing', pick: (v) => v.gerund },
];

function VerbCard({ verb }: { verb: VerbEntry }) {
  return (
    <li className={`rounded-xl border p-3 ${verb.selected ? 'border-accent bg-surface' : 'border-line bg-surface opacity-70'}`}>
      <div className="flex items-start justify-between gap-2">
        <label className="flex min-h-9 min-w-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-(--accent)"
            checked={verb.selected}
            onChange={(e) => attempt(setVerbSelected(verb.id, e.target.checked))}
          />
          <span className="min-w-0">
            <span className="font-serif text-lg break-words" lang="en">
              to {verb.base}
            </span>
            {verb.translation && <span className="text-sm text-muted"> — {verb.translation}</span>}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-3">
          <ListenButton text={[verb.base, verb.past, verb.participle].filter(Boolean).join(', ')} />
          <button
            type="button"
            aria-label={`Remover o verbo ${verb.base}`}
            onClick={() => attempt(deleteVerb(verb.id))}
            className="min-h-8 text-xs font-medium text-muted hover:text-danger"
          >
            Remover
          </button>
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-5">
        {FORMS.map(({ label, pick }) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] tracking-wide text-muted uppercase">{label}</dt>
            <dd className="font-serif break-words" lang="en">
              {pick(verb) || '—'}
            </dd>
          </div>
        ))}
      </dl>

      {verb.sentence && (
        <p className="mt-2 border-l-2 border-line pl-3 text-sm">
          <span className="text-xs font-semibold text-accent">
            No texto: {verb.textForm || verb.base}
            {verb.textTense && ` · ${verb.textTense}`}
          </span>
          <span className="block font-serif text-muted break-words" lang="en">
            “{verb.sentence}”
          </span>
        </p>
      )}
    </li>
  );
}

/**
 * Estudo dos verbos de uma ideia: a IA encontra os verbos do texto, com as formas
 * e o tempo em que aparecem; o usuário escolhe quais estudar e treina os tempos
 * verbais em frases com lacuna.
 */
export function IdeaVerbs({ ideaId, hasText }: { ideaId: string; hasText: boolean }) {
  const settings = useSettings();
  const online = useOnline();
  const verbs = useLiveQuery(() => listVerbs(ideaId), [ideaId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!settings || !verbs) return null;
  const aiReady = isAIConfigured(settings.ai);
  const selected = verbs.filter((v) => v.selected);
  const drills = selected.reduce((sum, v) => sum + v.drills.length, 0);

  const find = async () => {
    setBusy(true);
    setError('');
    try {
      const added = await findVerbs(ideaId);
      showToast(added === 0 ? 'Nenhum verbo novo encontrado.' : `${added} ${added === 1 ? 'verbo encontrado' : 'verbos encontrados'}.`);
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Não foi possível encontrar os verbos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>Verbos desta ideia · tempos verbais</Eyebrow>
        {aiReady && hasText && (
          <Button small variant="secondary" disabled={busy || !online} onClick={() => void find()}>
            {busy ? (
              <span className="inline-flex items-center gap-2" role="status">
                <Spinner /> Procurando os verbos…
              </span>
            ) : verbs.length === 0 ? (
              'Encontrar os verbos desta ideia'
            ) : (
              'Procurar mais verbos'
            )}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {verbs.length === 0 ? (
        <div className="mt-2">
          <Hint>
            {!hasText
              ? 'Registre o texto dos cards para estudar os verbos desta ideia.'
              : aiReady
                ? 'A IA lista os verbos principais do texto, com as formas (passado, particípio, -ing), o tempo em que cada um aparece e frases para treinar outros tempos.'
                : 'Com a IA configurada em Settings, dá para listar os verbos do texto e treinar os tempos verbais.'}
          </Hint>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">Marque os verbos que quer estudar. Só os marcados entram nos exercícios.</p>
          <ul className="mt-3 grid items-start gap-2 lg:grid-cols-2">
            {verbs.map((verb) => (
              <VerbCard key={verb.id} verb={verb} />
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {drills > 0 ? (
              <Link
                to={`/practice?verbs=${ideaId}`}
                className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-ink hover:opacity-90"
              >
                Treinar estes verbos ({drills} {drills === 1 ? 'frase' : 'frases'})
              </Link>
            ) : (
              <span className="text-sm text-muted">Marque ao menos um verbo para treinar.</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
