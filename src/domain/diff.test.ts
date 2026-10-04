import { describe, expect, it } from 'vitest';
import { diffText } from './diff';

const marked = (segments: { text: string; changed: boolean }[]): string[] => segments.filter((s) => s.changed).map((s) => s.text);
const joined = (segments: { text: string }[]): string => segments.map((s) => s.text).join('');

describe('destaque do que a correção mudou', () => {
  it('marca só as palavras trocadas, dos dois lados', () => {
    const diff = diffText('The main idea are that we should to focus.', 'The main idea is that we should focus.');
    expect(marked(diff.before)).toEqual(['are', 'to']);
    expect(marked(diff.after)).toEqual(['is']);
    expect(diff.changed).toBe(true);
  });

  it('o texto remontado é idêntico ao original, com espaços e quebras de linha', () => {
    const original = 'First  line\nsecond line.';
    const corrected = 'First line\nthe second line.';
    const diff = diffText(original, corrected);
    expect(joined(diff.before)).toBe(original);
    expect(joined(diff.after)).toBe(corrected);
    expect(marked(diff.after)).toEqual(['the']);
  });

  it('palavras vizinhas alteradas viram um destaque só', () => {
    const diff = diffText('I think is good idea.', 'I think it is a good idea.');
    expect(marked(diff.after)).toEqual(['it', 'a']);
    expect(marked(diffText('He go school.', 'He goes to school.').after)).toEqual(['goes to']);
  });

  it('pontuação ou maiúscula corrigida marca a palavra', () => {
    const diff = diffText('i agree', 'I agree.');
    expect(marked(diff.before)).toEqual(['i agree']);
    expect(marked(diff.after)).toEqual(['I agree.']);
  });

  it('texto igual, ou diferente só nos espaços, não tem destaque', () => {
    expect(diffText('Focus on one task.', 'Focus on one task.').changed).toBe(false);
    const spaces = diffText('Focus  on one task.', 'Focus on one task.');
    expect(spaces.changed).toBe(false);
    expect(marked(spaces.after)).toEqual([]);
  });

  it('frase reescrita por inteiro fica toda marcada', () => {
    const diff = diffText('Mind for ideas.', 'Your brain creates thoughts');
    expect(marked(diff.before)).toEqual(['Mind for ideas.']);
    expect(marked(diff.after)).toEqual(['Your brain creates thoughts']);
  });
});
