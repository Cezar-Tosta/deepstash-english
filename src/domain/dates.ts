import type { ISODate } from './types';

const DAY_MS = 86_400_000;
const pad = (n: number): string => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): ISODate {
  return toISODate(new Date());
}

let lastStamp = 0;

/**
 * Carimbo de criação estritamente crescente. As listas são ordenadas por ele, então
 * dois registros gravados no mesmo milissegundo não podem empatar.
 */
export function nowISO(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

// A aritmética de dias é feita em UTC para não sofrer com horário de verão.
function toUTC(date: ISODate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Data inválida: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isISODate(value: unknown): value is ISODate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(toUTC(date) + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Dias de `from` até `to` (positivo quando `to` é depois). */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

/** Segunda-feira da semana de `date`. */
export function startOfWeek(date: ISODate): ISODate {
  const dow = new Date(toUTC(date)).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export function weekDates(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

const FORMATS = {
  short: { day: '2-digit', month: '2-digit' },
  medium: { day: '2-digit', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long' },
  weekday: { weekday: 'short' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export function formatDate(date: ISODate, style: keyof typeof FORMATS = 'medium'): string {
  return new Intl.DateTimeFormat('pt-BR', { ...FORMATS[style], timeZone: 'UTC' }).format(new Date(toUTC(date)));
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Sábado ou domingo: dias sem sessão nova, só de revisões. */
export function isWeekend(date: ISODate): boolean {
  const day = new Date(toUTC(date)).getUTCDay();
  return day === 0 || day === 6;
}
