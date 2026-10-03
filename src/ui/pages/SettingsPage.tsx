import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { ANTHROPIC_DEFAULT_MODEL, GROQ_DEFAULT_MODEL } from '../../ai/AIProvider';
import { isAIConfigured } from '../../ai/feedback';
import { backupCounts, BackupError, type BackupFile, exportBackup, parseBackup, restoreBackup } from '../../data/backup';
import { cyclePosition, weekPlan } from '../../domain/cycle';
import { formatDate, startOfWeek } from '../../domain/dates';
import type { AIProviderKind, AISettings, ThemePref } from '../../domain/types';
import { errorMessage } from '../../services/errors';
import { markBackupDone, restartCycle, setAISettings, setTheme } from '../../services/settings';
import { Button, Card, Eyebrow, Hint, Notice, PageTitle, Segmented, TextInput } from '../components/ui';
import { useSettings, useToday } from '../hooks';
import { attempt, showToast } from '../toast';

const THEMES: readonly { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

const PROVIDERS: readonly { value: AIProviderKind; label: string }[] = [
  { value: 'none', label: 'Desligada' },
  { value: 'groq', label: 'Groq' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'Compatível com OpenAI' },
];

// ---------- Backup ----------

async function deliver(backup: BackupFile): Promise<void> {
  const name = `deepstash-english-${backup.exportedAt.slice(0, 10)}.json`;
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });
  // No celular, a folha de compartilhamento deixa salvar em Arquivos, Drive, e-mail etc.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Backup Deepstash English' });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // Compartilhamento indisponível neste contexto: cai para o download comum.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function BackupSection({ lastBackupAt }: { lastBackupAt: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [error, setError] = useState('');

  const doExport = async () => {
    try {
      const backup = await exportBackup();
      await deliver(backup);
      await markBackupDone(backup.exportedAt);
      showToast('Backup exportado.');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      showToast(errorMessage(e), 'error');
    }
  };

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPending(null);
    try {
      setPending(parseBackup(await file.text()));
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'Não foi possível ler o arquivo.');
    }
  };

  const counts = pending ? backupCounts(pending) : null;

  return (
    <Card>
      <Eyebrow>Backup</Eyebrow>
      <Hint>
        Seus dados ficam só neste aparelho. Exporte um arquivo de tempos em tempos: limpar os dados do navegador ou
        desinstalar o app apaga tudo.
      </Hint>
      <p className="mt-2 text-sm text-muted">
        Último backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString('pt-BR') : 'nunca'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void doExport()}>Export Backup</Button>
        <Button variant="secondary" onClick={() => input.current?.click()}>
          Import Backup
        </Button>
        <input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="Arquivo de backup" onChange={(e) => void pick(e)} />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {pending && counts && (
        <div className="mt-4">
          <Notice tone="warn">
            <p className="font-medium">Importar substitui tudo o que está neste aparelho.</p>
            <p className="mt-1">
              O arquivo{pending.exportedAt && ` de ${new Date(pending.exportedAt).toLocaleDateString('pt-BR')}`} tem{' '}
              {counts.sessions} sessões, {counts.ideas} ideias e {counts.chunks} chunks.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                small
                variant="danger"
                onClick={() =>
                  attempt(
                    restoreBackup(pending).then(() => {
                      setPending(null);
                      showToast('Backup restaurado.');
                    }),
                  )
                }
              >
                Substituir meus dados
              </Button>
              <Button small variant="ghost" onClick={() => setPending(null)}>
                Cancelar
              </Button>
            </div>
          </Notice>
        </div>
      )}
    </Card>
  );
}

// ---------- IA ----------

function AISection({ saved }: { saved: AISettings }) {
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const patch = (p: Partial<AISettings>) => setDraft({ ...draft, ...p });
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <Card>
      <Eyebrow>IA (opcional)</Eyebrow>
      <Hint>
        O app funciona inteiro sem IA. Ligada, ela só comenta frases que você já escreveu e salvou; nunca responde no
        seu lugar.
      </Hint>
      <div className="mt-4 space-y-4">
        <Segmented label="Provedor de IA" value={draft.provider} options={PROVIDERS} onChange={(provider) => patch({ ...(provider === draft.provider ? {} : { model: '', apiKey: '', baseUrl: '' }), provider })} />

        {draft.provider === 'anthropic' && (
          <>
            <TextInput label="Chave de API" type="password" autoComplete="off" value={draft.apiKey} onChange={(apiKey) => patch({ apiKey })} placeholder="sk-ant-…" />
            <TextInput label="Modelo" autoComplete="off" value={draft.model} onChange={(model) => patch({ model })} placeholder={ANTHROPIC_DEFAULT_MODEL} />
            <Hint>
              Sem modelo informado, usa {ANTHROPIC_DEFAULT_MODEL}. Se o modelo recusar um pedido, a API tenta sozinha
              um modelo alternativo.
            </Hint>
          </>
        )}

        {draft.provider === 'groq' && (
          <>
            <TextInput label="Chave de API da Groq" type="password" autoComplete="off" value={draft.apiKey} onChange={(apiKey) => patch({ apiKey })} placeholder="gsk_…" />
            <TextInput label="Modelo" autoComplete="off" value={draft.model} onChange={(model) => patch({ model })} placeholder={GROQ_DEFAULT_MODEL} />
            <Hint>
              Crie a chave em console.groq.com/keys. Sem modelo informado, usa {GROQ_DEFAULT_MODEL}; se a Groq o
              desativar, informe aqui outro da lista em console.groq.com/docs/models.
            </Hint>
          </>
        )}

        {draft.provider === 'openai-compatible' && (
          <>
            <TextInput label="URL base" type="url" autoComplete="off" value={draft.baseUrl} onChange={(baseUrl) => patch({ baseUrl })} placeholder="http://localhost:11434/v1" />
            <TextInput label="Modelo" autoComplete="off" value={draft.model} onChange={(model) => patch({ model })} placeholder="llama3.1" />
            <TextInput label="Chave de API (vazia para Ollama e LM Studio)" type="password" autoComplete="off" value={draft.apiKey} onChange={(apiKey) => patch({ apiKey })} />
            <Hint>Serve para OpenAI, Google (endpoint compatível), Ollama e LM Studio.</Hint>
          </>
        )}

        {draft.provider !== 'none' && (
          <Notice>
            A chave fica guardada apenas neste aparelho e não entra no backup. Ao pedir um retorno, o texto que você
            escreveu é enviado ao provedor escolhido.
          </Notice>
        )}

        <div className="flex items-center gap-3">
          <Button disabled={!changed} onClick={() => attempt(setAISettings(draft).then(() => showToast('Configuração de IA salva.')))}>
            Salvar
          </Button>
          <span className="text-sm text-muted">{isAIConfigured(saved) ? 'IA ativa.' : 'IA desligada.'}</span>
        </div>
      </div>
    </Card>
  );
}

// ---------- Armazenamento e instalação ----------

function StorageSection() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage
      ?.persisted()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  return (
    <Card>
      <Eyebrow>Neste aparelho</Eyebrow>
      <Hint>
        Para instalar: no Android, menu do Chrome → “Instalar app”. No iPhone, Safari → Compartilhar → “Adicionar à Tela
        de Início”. Depois de instalado, o app abre e funciona sem internet.
      </Hint>
      {persisted === false && (
        <div className="mt-3">
          <Button
            small
            variant="secondary"
            onClick={() =>
              attempt(
                navigator.storage.persist().then((ok) => {
                  setPersisted(ok);
                  showToast(ok ? 'Armazenamento protegido.' : 'O navegador não concedeu. Instalar o app costuma resolver.');
                }),
              )
            }
          >
            Proteger meus dados contra limpeza automática
          </Button>
        </div>
      )}
      {persisted && <p className="mt-3 text-sm text-good">Armazenamento protegido contra limpeza automática.</p>}
    </Card>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const date = useToday();
  const [confirmCycle, setConfirmCycle] = useState(false);
  if (!settings) return null;

  const cycleStart = settings.cycleStartDate ?? startOfWeek(date);
  const { cycle, week } = cyclePosition(cycleStart, date);
  const plan = weekPlan(week);

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Settings" title="Ajustes" />

      <Card>
        <Eyebrow>Aparência</Eyebrow>
        <div className="mt-3">
          <Segmented label="Tema" value={settings.theme} options={THEMES} onChange={(theme) => attempt(setTheme(theme))} />
        </div>
      </Card>

      <Card>
        <Eyebrow>Ciclo de 4 semanas</Eyebrow>
        <p className="mt-2">
          Ciclo {cycle}, semana {week} · iniciado em {formatDate(cycleStart, 'medium')}
        </p>
        <p className="mt-1 text-sm text-muted">
          {plan.focus} Speaking {plan.speakingLabel}. {plan.translation}
        </p>
        <div className="mt-3">
          {confirmCycle ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Voltar para a semana 1 a partir desta semana? O histórico é mantido.</span>
              <Button
                small
                onClick={() =>
                  attempt(
                    restartCycle(date).then(() => {
                      setConfirmCycle(false);
                      showToast('Ciclo reiniciado. Vale para as próximas sessões.');
                    }),
                  )
                }
              >
                Reiniciar
              </Button>
              <Button small variant="ghost" onClick={() => setConfirmCycle(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button small variant="secondary" onClick={() => setConfirmCycle(true)}>
              Reiniciar ciclo nesta semana
            </Button>
          )}
        </div>
      </Card>

      <BackupSection lastBackupAt={settings.lastBackupAt} />
      <AISection saved={settings.ai} />
      <StorageSection />

      <p className="text-center text-xs text-muted">Deepstash English Study System · v{__APP_VERSION__}</p>
    </div>
  );
}
