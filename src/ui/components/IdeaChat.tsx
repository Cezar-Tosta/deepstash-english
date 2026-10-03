import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AIError } from '../../ai/AIProvider';
import { isAIConfigured } from '../../ai/feedback';
import { clearChat, getChat, retryChat, sendChatMessage } from '../../ai/ideaChat';
import { useOnline, useSettings } from '../hooks';
import { attempt } from '../toast';
import { RichText } from './RichText';
import { Button, Eyebrow, Hint, Spinner, StarterChips, TextArea } from './ui';

const STARTERS = [
  'Qual é o ponto mais forte desta ideia?',
  'O que um crítico diria?',
  'Give me a real-life example.',
  'How can I apply this at work?',
] as const;

/**
 * Conversa com a IA sobre uma ideia. A IA conhece os cards, a ideia principal e o
 * que o usuário já escreveu. A conversa fica guardada junto com a ideia.
 */
export function IdeaChat({ ideaId }: { ideaId: string }) {
  const settings = useSettings();
  const online = useOnline();
  const messages = useLiveQuery(() => getChat(ideaId), [ideaId]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = messages?.length ?? 0;

  // Mantém a última mensagem à vista conforme a conversa cresce.
  useEffect(() => {
    if (count > 0 || busy) end.current?.scrollIntoView({ block: 'nearest' });
  }, [count, busy]);

  if (!settings || !messages) return null;

  if (!isAIConfigured(settings.ai)) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4">
        <Eyebrow>Conversar sobre esta ideia</Eyebrow>
        <p className="mt-2 text-sm text-muted">
          Com a IA configurada, você pode conversar sobre esta ideia e pedir exemplos, contrapontos e conexões.{' '}
          <Link to="/settings" className="text-accent underline underline-offset-2">
            Configurar em Settings
          </Link>
        </p>
      </section>
    );
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Não foi possível falar com a IA.');
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setDraft('');
    void run(() => sendChatMessage(ideaId, text));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  // Enter envia; Shift+Enter quebra a linha.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  const waitingReply = messages.at(-1)?.role === 'user' && !busy;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>Conversar sobre esta ideia</Eyebrow>
        {messages.length > 0 &&
          (confirmingClear ? (
            <span role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              Apagar a conversa?
              <Button
                small
                variant="danger"
                onClick={() => {
                  setConfirmingClear(false);
                  setError('');
                  attempt(clearChat(ideaId));
                }}
              >
                Apagar
              </Button>
              <Button small variant="ghost" onClick={() => setConfirmingClear(false)}>
                Cancelar
              </Button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmingClear(true)} className="min-h-8 text-xs font-medium text-muted hover:text-ink">
              Apagar conversa
            </button>
          ))}
      </div>

      {messages.length === 0 ? (
        <div className="mt-2 space-y-3">
          <Hint>
            A IA conhece os cards desta ideia e o que você já escreveu. Pergunte em português ou em inglês; em inglês, ela
            também aponta erros da sua mensagem.
          </Hint>
          <StarterChips starters={STARTERS} onPick={send} />
        </div>
      ) : (
        <ol className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user' ? 'bg-accent text-accent-ink' : 'bg-sunken text-ink'
                }`}
              >
                <span className="sr-only">{m.role === 'user' ? 'Você: ' : 'IA: '}</span>
                {m.role === 'user' ? (
                  <p className="break-words whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <RichText text={m.content} />
                )}
              </div>
            </li>
          ))}
          {busy && (
            <li className="flex justify-start">
              <span className="inline-flex items-center gap-2 rounded-2xl bg-sunken px-3 py-2 text-sm text-muted" role="status">
                <Spinner /> Pensando…
              </span>
            </li>
          )}
          <div ref={end} />
        </ol>
      )}

      {error && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-danger">
          <span>{error}</span>
          {waitingReply && (
            <Button small variant="secondary" disabled={!online} onClick={() => void run(() => retryChat(ideaId))}>
              Tentar de novo
            </Button>
          )}
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex items-end gap-2" onKeyDown={onKeyDown}>
        <div className="min-w-0 flex-1">
          <TextArea label="Sua mensagem" hideLabel value={draft} onChange={setDraft} rows={2} placeholder="Pergunte, discorde, peça um exemplo…" />
        </div>
        <Button type="submit" disabled={busy || !online || !draft.trim()}>
          Enviar
        </Button>
      </form>
      {!online && <p className="mt-2 text-sm text-muted">Sem conexão. A conversa volta quando você estiver online.</p>}
    </section>
  );
}
