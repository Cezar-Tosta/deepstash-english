import { defineConfig, devices } from '@playwright/test';

const PORT = 4319;

/**
 * Testes de interface. Rodam contra um build sem as variáveis do Supabase (o app funciona
 * só no navegador, sem login) e usam o Google Chrome instalado, que os runners do GitHub
 * já trazem: não é preciso baixar navegador.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'celular', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 400, height: 860 } } },
  ],
  webServer: {
    command: `pnpm build:e2e && pnpm exec vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
