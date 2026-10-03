import { type FormEvent, type ReactNode, useState } from 'react';
import { resolveConflict, signIn, syncNow, useCloud } from '../sync/cloud';
import { Button, Card, Hint, Notice, TextInput } from './components/ui';

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-paper px-5 py-10 text-ink">
      <p className="font-serif text-lg leading-tight text-muted">Deepstash English</p>
      <h1 className="mt-1 mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email, password) ?? '');
    setBusy(false);
  };

  return (
    <Screen title="Entrar">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <TextInput label="E-mail" type="email" autoComplete="username" required value={email} onChange={setEmail} />
        <TextInput label="Senha" type="password" autoComplete="current-password" required value={password} onChange={setPassword} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={busy || !email.trim() || !password}>
          {busy ? 'Entrando…' : 'ENTRAR'}
        </Button>
      </form>
      <div className="mt-6">
        <Hint>Seus estudos ficam guardados na sua conta e aparecem em qualquer navegador onde você entrar.</Hint>
      </div>
    </Screen>
  );
}

/** Os dois lados têm dados diferentes: só o usuário pode dizer qual vale. */
function Choose() {
  const { status } = useCloud();
  const [confirm, setConfirm] = useState<'cloud' | 'local' | null>(null);
  const busy = status === 'syncing';

  const options = [
    {
      keep: 'cloud' as const,
      title: 'Usar os dados da nuvem',
      detail: 'Substitui o que está neste navegador pelo que foi salvo por último em outro lugar.',
    },
    {
      keep: 'local' as const,
      title: 'Usar os dados deste navegador',
      detail: 'Substitui o que está na nuvem pelo que está aqui.',
    },
  ];

  return (
    <Screen title="Qual versão vale?">
      <Notice tone="warn">
        Este navegador e a nuvem têm dados diferentes, e o app não sabe qual é o mais completo. O lado que você não
        escolher será substituído.
      </Notice>
      <div className="mt-4 space-y-3">
        {options.map((o) => (
          <Card key={o.keep}>
            <p className="font-medium">{o.title}</p>
            <p className="mt-1 text-sm text-muted">{o.detail}</p>
            <div className="mt-3">
              {confirm === o.keep ? (
                <div className="flex flex-wrap gap-2">
                  <Button small variant="danger" disabled={busy} onClick={() => void resolveConflict(o.keep)}>
                    {busy ? 'Aplicando…' : 'Confirmar'}
                  </Button>
                  <Button small variant="ghost" onClick={() => setConfirm(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button small variant="secondary" onClick={() => setConfirm(o.keep)}>
                  Escolher
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  );
}

/**
 * Com a nuvem configurada, o app só abre depois do login e de conferir os dados
 * com a nuvem. Sem ela, mostra o app direto, guardando tudo neste navegador.
 */
export function CloudGate({ children }: { children: ReactNode }) {
  const cloud = useCloud();
  if (!cloud.enabled) return children;
  if (!cloud.authReady) return null;
  if (!cloud.user) return <Login />;
  if (cloud.status === 'choose') return <Choose />;
  if (!cloud.hydrated) {
    return (
      <Screen title={cloud.status === 'error' ? 'Não foi possível carregar' : 'Carregando seus estudos…'}>
        {cloud.status === 'error' && (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-danger">
              {cloud.error}
            </p>
            <Button onClick={() => void syncNow()}>Tentar de novo</Button>
          </div>
        )}
      </Screen>
    );
  }
  return children;
}
