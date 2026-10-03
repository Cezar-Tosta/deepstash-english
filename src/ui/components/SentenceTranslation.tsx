import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { isAIConfigured } from '../../ai/feedback';
import { getTranslation, translateSentence } from '../../ai/translate';
import { useOnline, useSettings } from '../hooks';

/**
 * A tradução de uma frase em inglês, em tom mais claro, para ficar logo abaixo dela.
 * Usa a tradução já guardada; se não houver, pede à IA uma única vez e guarda.
 */
export function SentenceTranslation({ sentence }: { sentence: string }) {
  const settings = useSettings();
  const online = useOnline();
  // `undefined` enquanto carrega; `null` quando ainda não há tradução guardada.
  const stored = useLiveQuery(() => getTranslation(sentence), [sentence]);
  const [failed, setFailed] = useState(false);
  const canAsk = Boolean(settings && isAIConfigured(settings.ai)) && online;

  useEffect(() => {
    if (stored !== null || !canAsk) return;
    let cancelled = false;
    translateSentence(sentence).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [stored, canAsk, sentence]);

  if (stored) return <p className="text-sm text-muted break-words">{stored}</p>;
  if (stored === undefined || failed) return null;
  if (!canAsk) return <p className="text-xs text-muted">Tradução da frase disponível com a IA configurada e online.</p>;
  return (
    <p className="text-sm text-muted" role="status">
      Traduzindo…
    </p>
  );
}
