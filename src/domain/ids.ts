/**
 * `crypto.randomUUID` só existe em contexto seguro (HTTPS/localhost). Ao abrir o app
 * pelo IP da rede local no celular ele não existe, então caímos para getRandomValues.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
