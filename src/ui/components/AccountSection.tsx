import { useState } from 'react';
import { signOut, syncNow, useCloud } from '../../sync/cloud';
import { showToast } from '../toast';
import { Button, Card, Eyebrow, Hint } from './ui';

const STATUS_TEXT = {
  idle: 'Aguardando.',
  syncing: 'Sincronizando…',
  synced: 'Tudo salvo na nuvem.',
  choose: 'Há uma diferença entre este navegador e a nuvem.',
  error: '',
} as const;

/** Conta e estado da sincronização. Só aparece quando o app foi publicado com Supabase. */
export function AccountSection() {
  const cloud = useCloud();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!cloud.enabled || !cloud.user) return null;

  const leave = async () => {
    setLeaving(true);
    const error = await signOut();
    setLeaving(false);
    setConfirming(false);
    if (error) showToast(error, 'error');
  };

  return (
    <Card>
      <Eyebrow>Conta e sincronização</Eyebrow>
      <p className="mt-2 break-all">{cloud.user.email}</p>
      <p className={`mt-1 text-sm ${cloud.status === 'error' ? 'text-danger' : 'text-muted'}`} aria-live="polite">
        {cloud.status === 'error' ? cloud.error : STATUS_TEXT[cloud.status]}
        {cloud.status === 'synced' &&
          cloud.lastSyncedAt &&
          ` Última conferência às ${new Date(cloud.lastSyncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`}
      </p>
      <Hint>Cada alteração é enviada em poucos segundos. Ao abrir o app em outro navegador e entrar, seus estudos aparecem lá.</Hint>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button small variant="secondary" disabled={cloud.status === 'syncing'} onClick={() => void syncNow()}>
          Sincronizar agora
        </Button>
        {confirming ? (
          <>
            <span className="text-sm">Sair apaga os dados deste navegador (eles continuam na nuvem).</span>
            <Button small variant="danger" disabled={leaving} onClick={() => void leave()}>
              {leaving ? 'Saindo…' : 'Sair'}
            </Button>
            <Button small variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button small variant="ghost" onClick={() => setConfirming(true)}>
            Sair da conta
          </Button>
        )}
      </div>
    </Card>
  );
}
