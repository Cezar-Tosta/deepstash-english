import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { attempt } from '../toast';

const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ');

// ---------- Botões ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  ghost: 'text-accent hover:bg-accent-soft',
  danger: 'border border-line bg-surface text-danger hover:bg-sunken',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant | undefined;
  block?: boolean | undefined;
  small?: boolean | undefined;
}

export function Button({ variant = 'primary', block, small, className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        small ? 'min-h-10 px-3 text-sm' : 'min-h-12 px-5 text-[15px]',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
    />
  );
}

// ---------- Estrutura ----------

export function Card({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface p-4', className)}>{children}</section>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string | undefined; title: string; children?: ReactNode }) {
  return (
    <header className="col-span-full mb-1">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </header>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{children}</p>;
}

/** Pergunta em inglês. A tipografia serifada separa "o que produzir" do resto da interface. */
export function Prompt({ children }: { children: ReactNode }) {
  return <p className="font-serif text-xl leading-snug">{children}</p>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | undefined; children: ReactNode }) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'note'}
      className={cx(
        'rounded-xl px-4 py-3 text-sm leading-relaxed',
        tone === 'warn' ? 'bg-sunken text-warn' : 'bg-accent-soft text-ink',
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'warn' | 'good' | undefined }) {
  const tones = {
    muted: 'bg-sunken text-muted',
    accent: 'bg-accent-soft text-accent',
    warn: 'bg-sunken text-warn',
    good: 'bg-sunken text-good',
  };
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 overflow-hidden rounded-full bg-sunken"
    >
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${value}%` }} />
    </div>
  );
}

// ---------- Campos ----------

const FIELD =
  'w-full rounded-xl border border-line bg-paper px-4 py-3 text-ink placeholder:text-muted/70 focus:border-accent';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hideLabel?: boolean | undefined;
}

export function TextInput({ label, value, onChange, hideLabel, className, ...props }: TextInputProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-sm font-medium'}>
        {label}
      </label>
      <input id={id} {...props} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} />
    </div>
  );
}

interface TextAreaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number | undefined;
  placeholder?: string | undefined;
  hideLabel?: boolean | undefined;
  readOnly?: boolean | undefined;
  lang?: string | undefined;
  onBlur?: (() => void) | undefined;
  ref?: Ref<HTMLTextAreaElement> | undefined;
}

export function TextArea({ label, value, onChange, rows = 3, hideLabel, ...props }: TextAreaProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-sm font-medium'}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(FIELD, 'resize-y leading-relaxed')}
      />
    </div>
  );
}

interface AutoTextAreaProps extends Omit<TextAreaProps, 'onChange' | 'onBlur'> {
  /** Gravação no banco. É chamada sozinha, pouco depois de o usuário parar de digitar. */
  onSave: (value: string) => Promise<unknown>;
  /** Começos de frase que o usuário pode tocar para inserir no texto. */
  starters?: readonly string[] | undefined;
}

/** Campo que se salva sozinho: o usuário nunca precisa procurar um botão "salvar". */
export function AutoTextArea({ value, onSave, starters, ...props }: AutoTextAreaProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(value);
  const latest = useRef(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useRef(onSave);

  useEffect(() => {
    save.current = onSave;
  }, [onSave]);

  // Aceita o valor do banco só quando não há digitação pendente.
  useEffect(() => {
    if (!dirty.current) {
      latest.current = value;
      setText(value);
    }
  }, [value]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    attempt(save.current(latest.current));
  }, []);

  useEffect(() => flush, [flush]);

  const change = (next: string) => {
    setText(next);
    latest.current = next;
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  return (
    <div className="space-y-3">
      {starters && (
        <StarterChips
          starters={starters}
          onPick={(starter) => {
            const base = latest.current.trimEnd();
            change(base ? `${base} ${starter} ` : `${starter} `);
            field.current?.focus();
          }}
        />
      )}
      <TextArea {...props} ref={field} value={text} onBlur={flush} onChange={change} />
    </div>
  );
}

/** Estruturas de apoio: tocar insere o começo da frase no campo, nunca uma resposta pronta. */
export function StarterChips({ starters, onPick }: { starters: readonly string[]; onPick?: ((starter: string) => void) | undefined }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Estruturas de apoio">
      {starters.map((s) => (
        <li key={s}>
          {onPick ? (
            <button
              type="button"
              onClick={() => onPick(s)}
              className="min-h-9 rounded-full border border-line bg-surface px-3 font-serif text-sm text-ink hover:bg-accent-soft"
            >
              {s}
            </button>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 font-serif text-sm">
              {s}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-10 rounded-full border px-4 text-sm font-medium transition-colors',
            o.value === value
              ? 'border-accent bg-accent text-accent-ink'
              : 'border-line bg-surface text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Ícone girando para operações em andamento. O texto ao lado diz o que está acontecendo. */
export function Spinner({ className }: { className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx('size-4 shrink-0 animate-spin', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export { cx };
