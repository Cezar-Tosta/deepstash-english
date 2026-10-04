import { describe, expect, it } from 'vitest';
import {
  dayOfPeriod,
  isRestDay,
  legacyStarts,
  normalizeStarts,
  periodAround,
  periodDates,
  periodOf,
  periods,
  periodStarting,
  phaseOf,
} from './periods';

// 2026-10-06 é uma terça-feira; 2026-10-15, a quinta-feira da semana seguinte.
const STARTS = ['2026-10-06', '2026-10-15'];

describe('ciclos de 7 dias com início escolhido', () => {
  it('ciclo iniciado na terça vai até a segunda seguinte', () => {
    expect(periods(STARTS)).toEqual([
      { start: '2026-10-06', end: '2026-10-12', index: 0 },
      { start: '2026-10-15', end: '2026-10-21', index: 1 },
    ]);
    expect(periodDates(periods(STARTS)[0]!)).toHaveLength(7);
  });

  it('os dias 6 e 7 são de revisão: domingo e segunda, para um ciclo iniciado na terça', () => {
    const cycle = periodOf(STARTS, '2026-10-11')!;
    expect(dayOfPeriod(cycle, '2026-10-06')).toBe(1);
    expect(isRestDay(cycle, '2026-10-10')).toBe(false);
    expect(dayOfPeriod(cycle, '2026-10-11')).toBe(6);
    expect(isRestDay(cycle, '2026-10-11')).toBe(true);
    expect(isRestDay(cycle, '2026-10-12')).toBe(true);
  });

  it('terça e quarta entre um ciclo e outro não pertencem a nenhum', () => {
    expect(periodOf(STARTS, '2026-10-13')).toBeNull();
    expect(periodOf(STARTS, '2026-10-14')).toBeNull();
    expect(periodOf(STARTS, '2026-10-15')?.index).toBe(1);
    expect(periodOf(STARTS, '2026-10-05')).toBeNull();
  });

  it('num dia sem ciclo, o ciclo de referência é o último que terminou', () => {
    expect(periodAround(STARTS, '2026-10-14')?.start).toBe('2026-10-06');
    expect(periodAround(STARTS, '2026-10-16')?.start).toBe('2026-10-15');
    expect(periodAround(STARTS, '2026-10-01')).toBeNull();
  });

  it('começar um ciclo antes de o anterior terminar encurta o anterior', () => {
    expect(periods(['2026-10-06', '2026-10-09'])[0]).toEqual({ start: '2026-10-06', end: '2026-10-08', index: 0 });
  });

  it('datas repetidas, fora de ordem ou inválidas são arrumadas', () => {
    expect(normalizeStarts(['2026-10-15', 'x', '2026-10-06', '2026-10-15', null])).toEqual(STARTS);
  });

  it('data que não é um início registrado vale como um ciclo cheio', () => {
    expect(periodStarting(STARTS, '2026-09-28')).toEqual({ start: '2026-09-28', end: '2026-10-04', index: -1 });
    expect(periodStarting(STARTS, '2026-10-15').index).toBe(1);
  });

  it('dados antigos: cada semana de calendário com estudo vira um ciclo de segunda a domingo', () => {
    expect(legacyStarts(['2026-09-29', '2026-10-02', '2026-10-07'])).toEqual(['2026-09-28', '2026-10-05']);
  });

  it('a fase sobe a cada ciclo, volta à 1 depois da 4 e pode ser reiniciada', () => {
    const starts = ['2026-09-01', '2026-09-08', '2026-09-17', '2026-09-24', '2026-10-06', '2026-10-15'];
    const all = periods(starts);
    expect(all.map((p) => phaseOf(starts, p, null).week)).toEqual([1, 2, 3, 4, 1, 2]);
    expect(phaseOf(starts, all[4]!, null).cycle).toBe(2);
    // Reiniciado durante o terceiro ciclo: ele passa a ser a fase 1.
    expect(all.map((p) => phaseOf(starts, p, '2026-09-18').week)).toEqual([1, 1, 1, 2, 3, 4]);
  });
});
