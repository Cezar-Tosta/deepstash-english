import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { getDueChunks } from '../services/reviews';
import { useCloud } from '../sync/cloud';
import { useOnline, useToday } from './hooks';
import { dismissToast, useToast } from './toast';

const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const NAV = [
  { to: '/', label: 'TODAY', icon: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>) },
  { to: '/review', label: 'REVIEW', icon: icon(<><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5" /><path d="M20 4v4.5h-4.5" /><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5" /><path d="M4 20v-4.5h4.5" /></>) },
  { to: '/knowledge', label: 'KNOWLEDGE', icon: icon(<><path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10" /></>) },
  { to: '/practice', label: 'PRACTICE', icon: icon(<><path d="M4 20l4-1 11-11-3-3L5 16z" /><path d="M14 6l3 3" /></>) },
  { to: '/progress', label: 'PROGRESS', icon: icon(<><path d="M4 20h16" /><path d="M7 20v-6M12 20V6M17 20v-9" /></>) },
  { to: '/settings', label: 'SETTINGS', icon: icon(<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>) },
] as const;

function Toaster() {
  const toast = useToast();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8" role={toast.tone === 'error' ? 'alert' : 'status'}>
      <button
        type="button"
        onClick={dismissToast}
        className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-left text-sm shadow-lg ${
          toast.tone === 'error' ? 'bg-danger text-paper' : 'bg-ink text-paper'
        }`}
      >
        {toast.text}
      </button>
    </div>
  );
}

/** Navegação inferior no celular, barra lateral no desktop. */
export function Layout() {
  const date = useToday();
  const online = useOnline();
  const cloud = useCloud();
  const due = useLiveQuery(() => getDueChunks(date), [date])?.length ?? 0;

  return (
    <div className="min-h-dvh bg-paper text-ink md:flex">
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:static md:w-56 md:shrink-0 md:border-t-0 md:border-r md:pb-0"
      >
        <p className="hidden px-6 pt-8 pb-6 font-serif text-lg leading-tight md:block">
          Deepstash
          <br />
          English
        </p>
        <ul className="flex md:flex-col md:gap-1 md:px-3">
          {NAV.map((item) => (
            <li key={item.to} className="flex-1 md:flex-none">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `relative flex min-h-16 flex-col items-center justify-center gap-1 text-[9px] font-semibold tracking-wide transition-colors md:min-h-12 md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-xs ${
                    isActive ? 'text-accent md:bg-accent-soft' : 'text-muted hover:text-ink'
                  }`
                }
              >
                <span className="relative">
                  {item.icon}
                  {item.to === '/review' && due > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-4.5 rounded-full bg-accent px-1 text-center text-[10px] leading-4.5 text-accent-ink">
                      <span className="sr-only">Revisões pendentes: </span>
                      {due}
                    </span>
                  )}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="mx-auto w-full max-w-2xl px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-28 md:px-8 md:pt-10 md:pb-16">
        {!online && (
          <p role="status" className="mb-4 rounded-xl bg-sunken px-4 py-2 text-sm text-muted">
            Sem conexão. Tudo continua funcionando e sendo salvo neste navegador.
          </p>
        )}
        {online && cloud.user && cloud.status === 'error' && (
          <p role="alert" className="mb-4 rounded-xl bg-sunken px-4 py-2 text-sm text-danger">
            {cloud.error}
          </p>
        )}
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
