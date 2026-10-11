import { describe, expect, it } from 'vitest';
import { planAudioSync } from './audio';

const NOW = '2026-10-11T12:00:00.000Z';

describe('áudios das falas na nuvem', () => {
  const base = {
    now: NOW,
    keepSince: '2026-09-13',
    speaking: [
      { id: 'recente', date: '2026-10-10' },
      { id: 'outro-aparelho', date: '2026-10-09' },
      { id: 'antiga', date: '2026-08-01' },
    ],
  };

  it('envia as gravações que só existem neste navegador', () => {
    const plan = planAudioSync({ ...base, local: ['recente', 'antiga'], remote: [{ id: 'antiga', createdAt: NOW }] });
    expect(plan.upload).toEqual(['recente']);
  });

  it('baixa as gravações recentes feitas em outro aparelho; as antigas ficam só na nuvem', () => {
    const plan = planAudioSync({
      ...base,
      local: [],
      remote: [
        { id: 'outro-aparelho', createdAt: NOW },
        { id: 'antiga', createdAt: NOW },
      ],
    });
    expect(plan.download).toEqual(['outro-aparelho']);
  });

  it('apaga da nuvem o áudio de uma fala excluída, mas só depois de uns minutos', () => {
    const plan = planAudioSync({
      ...base,
      local: [],
      remote: [
        { id: 'excluida', createdAt: '2026-10-11T11:00:00.000Z' },
        { id: 'acabou-de-subir', createdAt: '2026-10-11T11:58:00.000Z' },
      ],
    });
    // A que acabou de subir pode ser de uma fala que este navegador ainda não recebeu.
    expect(plan.remove).toEqual(['excluida']);
  });

  it('tudo em dia: nada a fazer', () => {
    const plan = planAudioSync({ ...base, local: ['recente'], remote: [{ id: 'recente', createdAt: NOW }] });
    expect(plan).toEqual({ upload: [], download: [], remove: [] });
  });
});
