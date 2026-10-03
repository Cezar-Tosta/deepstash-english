export interface BarDatum {
  /** Rótulo curto do eixo (ex.: 28/09). */
  label: string;
  value: number;
  /** Texto completo para leitores de tela e para o balão ao passar o mouse ou focar. */
  description: string;
  /** Valor já formatado (ex.: "16 min"). */
  display: string;
}

/**
 * Barras de uma única série. O título nomeia a série, então não há legenda; só a
 * barra mais recente recebe rótulo direto, e as demais mostram o valor ao tocar,
 * focar ou passar o mouse.
 */
export function BarChart({ title, data }: { title: string; data: readonly BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const lastIndex = data.length - 1;

  return (
    <figure className="rounded-2xl border border-line bg-surface p-4">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <ol className="mt-3 flex h-28 items-end gap-[2px] border-b border-line">
        {data.map((d, i) => (
          <li key={d.label} className="group relative flex h-full flex-1 items-end justify-center">
            <button type="button" aria-label={d.description} className="flex h-full w-full items-end justify-center">
              {i === lastIndex && (
                <span
                  className="absolute text-xs font-semibold text-ink tabular-nums"
                  style={{ bottom: `calc(${(d.value / max) * 100}% + 4px)` }}
                >
                  {d.display}
                </span>
              )}
              <span
                className="w-full max-w-6 rounded-t-[4px] bg-chart"
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
              />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper group-focus-within:block group-hover:block"
            >
              {d.label} · {d.display}
            </span>
          </li>
        ))}
      </ol>
      <ol className="mt-1 flex gap-[2px] text-[10px] text-muted" aria-hidden="true">
        {data.map((d, i) => (
          <li key={d.label} className="flex-1 text-center">
            {i === 0 || i === lastIndex ? d.label : ''}
          </li>
        ))}
      </ol>
    </figure>
  );
}
