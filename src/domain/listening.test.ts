import { describe, expect, it } from 'vitest';
import { listeningSentences } from './listening';
import { splitSentences } from './reader';

describe('frases do texto', () => {
  it('separa as frases pela pontuação final, sem perder abreviações comuns', () => {
    expect(splitSentences('Mr. Smith arrived early. He was tired! Was he late? No.')).toEqual([
      'Mr. Smith arrived early.',
      'He was tired!',
      'Was he late?',
      'No.',
    ]);
  });

  it('trata quebras de linha como espaço', () => {
    expect(splitSentences('It was a long\nday. Then it rained.')).toEqual(['It was a long day.', 'Then it rained.']);
  });
});

describe('frases para o ditado do LISTEN', () => {
  const paragraphs = [
    'Short one. Habits are the compound interest of self-improvement and they grow over time.',
    'You do not rise to the level of your goals because you fall to the level of your systems.',
    'Every action you take is a vote for the type of person you wish to become. Yes.',
  ];

  it('escolhe frases de tamanho bom para ditar, espalhadas pelo texto e na ordem', () => {
    expect(listeningSentences(paragraphs, 3)).toEqual([
      'Habits are the compound interest of self-improvement and they grow over time.',
      'You do not rise to the level of your goals because you fall to the level of your systems.',
      'Every action you take is a vote for the type of person you wish to become.',
    ]);
  });

  it('não pede mais frases do que existem', () => {
    expect(listeningSentences(['Just a short text with six words.'], 3)).toEqual(['Just a short text with six words.']);
  });

  it('sem frase do tamanho certo, usa as mais longas disponíveis', () => {
    expect(listeningSentences(['Hi there. Go now.'], 1)).toEqual(['Hi there.']);
  });

  it('texto vazio não tem ditado', () => {
    expect(listeningSentences([], 3)).toEqual([]);
  });
});

describe('ditado do LISTEN conforme a fase', () => {
  const paragraphs = [
    'Habits are the compound interest of self-improvement and they grow over time.',
    'You do not rise to the level of your goals because you fall to the level of your systems.',
  ];

  it('com limite de palavras, frases longas ficam de fora', () => {
    expect(listeningSentences(paragraphs, 3, 14)).toEqual([
      'Habits are the compound interest of self-improvement and they grow over time.',
    ]);
  });
});
