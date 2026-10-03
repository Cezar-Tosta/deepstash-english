import { parseInline, parseRichText, type Span } from '../../domain/richText';

function Spans({ spans }: { spans: readonly Span[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.style === 'bold') return <strong key={i}>{span.text}</strong>;
        if (span.style === 'italic') return <em key={i}>{span.text}</em>;
        if (span.style === 'code') {
          return (
            <code key={i} className="rounded bg-sunken px-1 font-serif">
              {span.text}
            </code>
          );
        }
        return <span key={i}>{span.text}</span>;
      })}
    </>
  );
}

/** Mostra o texto da IA com negrito, itálico e listas de verdade, em vez dos símbolos de Markdown. */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 leading-relaxed break-words ${className}`}>
      {parseRichText(text).map((block, i) => {
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={i} className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
              {block.items.map((item, k) => (
                <li key={k}>
                  <Spans spans={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i} className={block.kind === 'heading' ? 'font-semibold' : ''}>
            <Spans spans={block.spans} />
          </p>
        );
      })}
    </div>
  );
}

/** Versão de uma linha, para usar dentro de outro parágrafo ou de um balão. */
export function InlineRich({ text }: { text: string }) {
  return <Spans spans={parseInline(text)} />;
}
