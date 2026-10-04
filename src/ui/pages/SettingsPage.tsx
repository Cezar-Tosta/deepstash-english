import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { ANTHROPIC_DEFAULT_MODEL, GROQ_DEFAULT_MODEL, GROQ_VISION_MODEL } from '../../ai/AIProvider';
import { isAIConfigured } from '../../ai/feedback';
import { backupCounts, BackupError, type BackupFile, exportBackup, parseBackup, restoreBackup } from '../../data/backup';
import type { AIProviderKind, AISettings, ThemePref } from '../../domain/types';
import { errorMessage } from '../../services/errors';
import { useCloud } from '../../sync/cloud';
import { markBackupDone, setAISettings, setTheme } from '../../services/settings';
import { AccountSection } from '../components/AccountSection';
import { CycleSection } from '../components/CycleSection';
import { DataSection } from '../components/Maintenance';
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
  const cloud = useCloud();
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
        {cloud.user
          ? 'Seus dados já ficam guardados na sua conta. O arquivo de backup é uma cópia extra, sob seu controle.'
          : 'Seus dados ficam só neste navegador. Exporte um arquivo de tempos em tempos: limpar os dados do navegador apaga tudo.'}
      </Hint>
      <p className="mt-2 text-sm text-muted">Último backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString('pt-BR') : 'nunca'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void doExport()}>Export Backup</Button>
        <Button variant="secondary" onClick={() => input.current?.click()}>
          Import Backup
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Arquivo de backup"
          onChange={(e) => void pick(e)}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {pending && counts && (
        <div className="mt-4">
          <Notice tone="warn">
            <p className="font-medium">
              Importar substitui tudo o que está neste navegador
              {cloud.user ? ' e na sua conta' : ''}.
            </p>
            <p className="mt-1">
              O arquivo
              {pending.exportedAt && ` de ${new Date(pending.exportedAt).toLocaleDateString('pt-BR')}`} tem {counts.sessions} sessões,{' '}
              {counts.ideas} ideias e {counts.chunks} chunks.
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
  const cloud = useCloud();
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const patch = (p: Partial<AISettings>) => setDraft({ ...draft, ...p });
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <Card>
      <Eyebrow>IA (opcional)</Eyebrow>
      <Hint>
        O app funciona inteiro sem IA. Ligada, ela comenta o que você já escreveu ou falou, explica palavras que você clicar nos cards e,
        com a Groq, transcreve o seu retelling. Nunca responde no seu lugar.
      </Hint>
      <div className="mt-4 space-y-4">
        <Segmented
          label="Provedor de IA"
          value={draft.provider}
          options={PROVIDERS}
          onChange={(provider) =>
            patch({
              ...(provider === draft.provider ? {} : { model: '', apiKey: '', baseUrl: '', visionModel: '' }),
              provider,
            })
          }
        />

        {draft.provider === 'anthropic' && (
          <>
            <TextInput
              label="Chave de API"
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(apiKey) => patch({ apiKey })}
              placeholder="sk-ant-…"
            />
            <TextInput
              label="Modelo"
              autoComplete="off"
              value={draft.model}
              onChange={(model) => patch({ model })}
              placeholder={ANTHROPIC_DEFAULT_MODEL}
            />
            <Hint>
              Sem modelo informado, usa {ANTHROPIC_DEFAULT_MODEL}. Se o modelo recusar um pedido, a API tenta sozinha um modelo alternativo.
            </Hint>
          </>
        )}

        {draft.provider === 'groq' && (
          <>
            <TextInput
              label="Chave de API da Groq"
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(apiKey) => patch({ apiKey })}
              placeholder="gsk_…"
            />
            <TextInput
              label="Modelo"
              autoComplete="off"
              value={draft.model}
              onChange={(model) => patch({ model })}
              placeholder={GROQ_DEFAULT_MODEL}
            />
            <TextInput
              label="Modelo de visão (para ler screenshots de cards)"
              autoComplete="off"
              value={draft.visionModel ?? ''}
              onChange={(visionModel) => patch({ visionModel })}
              placeholder={GROQ_VISION_MODEL}
            />
            <Hint>
              Crie a chave em console.groq.com/keys. Sem modelo informado, usa {GROQ_DEFAULT_MODEL}; se a Groq o desativar, informe aqui
              outro da lista em console.groq.com/docs/models.
            </Hint>
          </>
        )}

        {draft.provider === 'openai-compatible' && (
          <>
            <TextInput
              label="URL base"
              type="url"
              autoComplete="off"
              value={draft.baseUrl}
              onChange={(baseUrl) => patch({ baseUrl })}
              placeholder="http://localhost:11434/v1"
            />
            <TextInput
              label="Modelo"
              autoComplete="off"
              value={draft.model}
              onChange={(model) => patch({ model })}
              placeholder="llama3.1"
            />
            <TextInput
              label="Chave de API (vazia para Ollama e LM Studio)"
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(apiKey) => patch({ apiKey })}
            />
            <Hint>Serve para OpenAI, Google (endpoint compatível), Ollama e LM Studio.</Hint>
          </>
        )}

        {draft.provider !== 'none' && (
          <Notice>
            {cloud.user
              ? 'A chave e os modelos ficam guardados na sua conta e valem em qualquer navegador onde você entrar. Eles não entram no arquivo de backup.'
              : 'A chave fica guardada apenas neste navegador e não entra no arquivo de backup.'}{' '}
            Ao pedir um retorno, o texto que você escreveu é enviado ao provedor escolhido.
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
      <Eyebrow>Neste navegador</Eyebrow>
      <Hint>
        Os dados ficam guardados neste navegador. Alguns navegadores apagam dados de sites pouco usados; a proteção abaixo pede para manter
        os seus.
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
  const cloud = useCloud();
  if (!settings) return null;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <PageTitle eyebrow="Settings" title="Ajustes" />

      <Card>
        <Eyebrow>Aparência</Eyebrow>
        <div className="mt-3">
          <Segmented label="Tema" value={settings.theme} options={THEMES} onChange={(theme) => attempt(setTheme(theme))} />
        </div>
      </Card>

      <CycleSection date={date} />

      <AccountSection />
      <BackupSection lastBackupAt={settings.lastBackupAt} />
      <AISection saved={settings.ai} />
      <DataSection />
      {!cloud.enabled && <StorageSection />}

      <p className="col-span-full text-center text-xs text-muted">Deepstash English Study System · v{__APP_VERSION__}</p>
    </div>
  );
}
