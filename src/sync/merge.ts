import type { BackupFile, BackupSettings } from '../data/backup';
import { DATA_TABLES } from '../data/db';

type Row = Record<string, unknown>;

/** JSON com as chaves em ordem: a ordem das chaves não é uma mudança. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Row)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b);

/** Quando o registro foi alterado por último, se ele guardar isso. */
function changedAt(row: Row): string {
  const value = row['updatedAt'] ?? row['lastAt'] ?? row['completedAt'] ?? row['createdAt'];
  return typeof value === 'string' ? value : '';
}

interface Counter {
  conflicts: number;
}

/**
 * Três vias: o que mudou de um lado em relação à base vence o que ficou igual. Se os
 * dois lados mudaram o mesmo registro, a decisão desce para cada campo; só quando o
 * mesmo campo mudou nos dois vale o registro alterado por último (sem data, este
 * navegador). Excluído de um lado e editado do outro: o editado fica.
 */
function mergeRow(base: Row | undefined, local: Row | undefined, remote: Row | undefined, counter: Counter): Row | undefined {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  if (!local) return remote;
  if (!remote) return local;

  const remoteWins = changedAt(remote) > changedAt(local);
  let conflict = false;
  const out: Row = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[key];
    const r = remote[key];
    const b = base?.[key];
    let value: unknown;
    if (same(l, r) || same(r, b)) value = l;
    else if (same(l, b)) value = r;
    else {
      conflict = true;
      value = remoteWins ? r : l;
    }
    if (value !== undefined) out[key] = value;
  }
  if (conflict) counter.conflicts += 1;
  return out;
}

function mergeTable(base: readonly Row[], local: readonly Row[], remote: readonly Row[], counter: Counter): Row[] {
  const byId = (rows: readonly Row[]) => new Map(rows.map((r) => [String(r['id']), r]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  const out: Row[] = [];
  for (const id of new Set([...l.keys(), ...r.keys(), ...b.keys()])) {
    const row = mergeRow(b.get(id), l.get(id), r.get(id), counter);
    if (row) out.push(row);
  }
  return out;
}

export interface MergeResult {
  merged: BackupFile;
  /** Quantos registros tinham o mesmo campo alterado dos dois lados. */
  conflicts: number;
}

/**
 * Junta o que mudou neste navegador e na nuvem desde a última vez em que os dois
 * concordavam (`base`). Nada que só um lado mudou se perde.
 */
export function mergePayloads(base: BackupFile, local: BackupFile, remote: BackupFile): MergeResult {
  const counter: Counter = { conflicts: 0 };
  const data = Object.fromEntries(
    DATA_TABLES.map((table) => [table, mergeTable(base.data[table] ?? [], local.data[table] ?? [], remote.data[table] ?? [], counter)]),
  ) as BackupFile['data'];
  const settings = mergeRow(
    (base.settings as Row | null) ?? undefined,
    (local.settings as Row | null) ?? undefined,
    (remote.settings as Row | null) ?? undefined,
    counter,
  );
  return {
    merged: { ...local, settings: (settings as BackupSettings | undefined) ?? null, data },
    conflicts: counter.conflicts,
  };
}
