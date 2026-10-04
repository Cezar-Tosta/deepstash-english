import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText } from './richText';

describe('formatação das respostas da IA', () => {
  it('negrito e itálico viram estilo, sem os asteriscos', () => {
    expect(parseInline('- **Trigger–Identify**: “every afternoon”')).toEqual([
      { text: '- ', style: 'plain' },
      { text: 'Trigger–Identify', style: 'bold' },
      { text: ': “every afternoon”', style: 'plain' },
    ]);
    expect(parseInline('Conectores úteis: *when*, *instead of*, *so*.')).toEqual([
      { text: 'Conectores úteis: ', style: 'plain' },
      { text: 'when', style: 'italic' },
      { text: ', ', style: 'plain' },
      { text: 'instead of', style: 'italic' },
      { text: ', ', style: 'plain' },
      { text: 'so', style: 'italic' },
      { text: '.', style: 'plain' },
    ]);
  });

  it('aceita __negrito__ e `código`', () => {
    expect(parseInline('__Dica__: use `I’ll`.').map((s) => s.style)).toEqual(['bold', 'plain', 'code', 'plain']);
  });

  it('asterisco solto ou sem par continua sendo texto', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6', style: 'plain' }]);
    expect(parseInline('sobrou ** aqui')).toEqual([{ text: 'sobrou ** aqui', style: 'plain' }]);
  });

  it('tópicos consecutivos formam uma lista; o texto depois é parágrafo', () => {
    const blocks = parseRichText('- **Cost**: “fifty bucks”\n- **Choice**: picture it\n\nConectores úteis: *when*.');
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'paragraph']);
    expect(blocks[0]).toMatchObject({ ordered: false });
    expect(blocks[0]?.kind === 'list' && blocks[0].items).toHaveLength(2);
    expect(blocks[0]?.kind === 'list' && blocks[0].items[0]?.[0]).toEqual({ text: 'Cost', style: 'bold' });
  });

  it('reconhece listas numeradas, marcadores com * e títulos', () => {
    const blocks = parseRichText('### Roteiro\n1. Start\n2. End\n* extra');
    expect(blocks.map((b) => (b.kind === 'list' ? `${b.kind}:${b.ordered}` : b.kind))).toEqual(['heading', 'list:true', 'list:false']);
  });

  it('texto sem formatação passa intacto', () => {
    expect(parseRichText('Na terceira pessoa usamos talks.')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'Na terceira pessoa usamos talks.', style: 'plain' }] },
    ]);
  });
});

describe('campos de texto simples', () => {
  it('remove os símbolos mantendo o conteúdo', async () => {
    const { stripMarkdown } = await import('./richText');
    expect(stripMarkdown('**segurar**, *guardar*')).toBe('segurar, guardar');
    expect(stripMarkdown('This card **talks** about focus.')).toBe('This card talks about focus.');
    expect(stripMarkdown('sem formatação')).toBe('sem formatação');
  });
});
