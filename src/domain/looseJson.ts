/**
 * Leitura tolerante do JSON que os modelos de IA devolvem. Na prática ele chega
 * embrulhado em texto ou em cerca de código, com vírgula sobrando antes de fechar,
 * ou cortado no meio quando a resposta é longa.
 */

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Vírgula antes de `}` ou `]` é o erro mais comum; removê-la não muda o conteúdo. */
const withoutTrailingCommas = (text: string): string => text.replace(/,(\s*[}\]])/g, '$1');

/** O trecho entre o primeiro `open` e o último `close`, se houver. */
function between(raw: string, open: string, close: string): string | null {
  const start = raw.indexOf(open);
  const end = raw.lastIndexOf(close);
  return start >= 0 && end > start ? raw.slice(start, end + 1) : null;
}

/** O JSON contido na resposta (objeto ou lista), ou undefined se não der para ler. */
export function parseLooseJSON(raw: string): unknown {
  const firstBrace = raw.indexOf('{');
  const firstBracket = raw.indexOf('[');
  // Tenta primeiro a estrutura que abre antes: uma lista de objetos começa por "[".
  const listFirst = firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace);
  const candidates = listFirst ? [between(raw, '[', ']'), between(raw, '{', '}')] : [between(raw, '{', '}'), between(raw, '[', ']')];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = tryParse(candidate) ?? tryParse(withoutTrailingCommas(candidate));
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/**
 * Recupera os objetos completos de uma resposta cortada ou malformada: percorre o
 * texto casando chaves (ignorando as que estão dentro de strings) e devolve cada
 * objeto fechado que tenha a chave `key`. O que ficou pela metade é descartado.
 */
export function salvageObjects(raw: string, key: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const opens: number[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') opens.push(i);
    else if (ch === '}') {
      const start = opens.pop();
      if (start === undefined) continue;
      const text = raw.slice(start, i + 1);
      if (!text.includes(`"${key}"`)) continue;
      const parsed = tryParse(text) ?? tryParse(withoutTrailingCommas(text));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && key in parsed) {
        found.push(parsed as Record<string, unknown>);
      }
    }
  }
  return found;
}

/** Normaliza o nome de um campo: "past_participle", "pastParticiple" e "Past Participle" viram "pastparticiple". */
export function fieldKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

/** Lê um campo de texto aceitando vários nomes possíveis para ele. */
export function pickText(obj: Record<string, unknown>, ...names: string[]): string {
  const wanted = new Set(names.map(fieldKey));
  for (const [name, value] of Object.entries(obj)) {
    if (wanted.has(fieldKey(name)) && typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** Lê um campo que deve ser uma lista, aceitando vários nomes. */
export function pickList(obj: Record<string, unknown>, ...names: string[]): unknown[] {
  const wanted = new Set(names.map(fieldKey));
  for (const [name, value] of Object.entries(obj)) {
    if (wanted.has(fieldKey(name)) && Array.isArray(value)) return value;
  }
  return [];
}
