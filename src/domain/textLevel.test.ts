import { describe, expect, it } from 'vitest';
import { firstParagraphsWithin, syllables, textProfile } from './textLevel';

describe('nível estimado do texto', () => {
  it('conta sílabas de forma aproximada, sem o "e" mudo do fim', () => {
    expect(syllables('cat')).toBe(1);
    expect(syllables('make')).toBe(1);
    expect(syllables('table')).toBe(2);
    expect(syllables('important')).toBe(3);
    expect(syllables('computer')).toBe(3);
  });

  it('texto simples fica nos níveis básicos', () => {
    const profile = textProfile('The cat sat on the mat. It was a sunny day. We played in the park with the dog.');
    expect(profile).toMatchObject({ words: 19, sentences: 3 });
    expect(['A1–A2', 'B1']).toContain(profile.level);
  });

  it('texto denso, com frases longas e palavras compridas, fica nos níveis avançados', () => {
    const profile = textProfile(
      'Notwithstanding considerable methodological limitations, contemporary epidemiological investigations consistently demonstrate substantial associations between insufficient nocturnal rest and cardiovascular deterioration.',
    );
    expect(profile.level).toBe('C1–C2');
  });

  it('texto vazio não tem nível', () => {
    expect(textProfile('   ')).toMatchObject({ words: 0, level: null });
  });
});

describe('trecho para textos longos', () => {
  it('pega os primeiros parágrafos que cabem no limite, sempre pelo menos um', () => {
    const p = ['one two three', 'four five six seven', 'eight nine'];
    expect(firstParagraphsWithin(p, 7)).toEqual(['one two three', 'four five six seven']);
    expect(firstParagraphsWithin(p, 2)).toEqual(['one two three']);
    expect(firstParagraphsWithin(p, 100)).toEqual(p);
  });
});
