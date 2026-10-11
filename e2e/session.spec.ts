import { expect, type Page, test } from '@playwright/test';

const TEXT = [
  'Sleep is one of the most important things we do for our health. During sleep, the brain stores new memories and clears away waste.',
  'Most adults need between seven and nine hours of sleep every night. People who sleep less often find it harder to focus at work.',
  'If you want to sleep better, keep a regular schedule and avoid screens before bed.',
].join('\n');

/** Vai para uma etapa pelo stepper do topo. */
async function step(page: Page, n: number): Promise<void> {
  await page.locator(`button[aria-label^="Etapa ${n}:"]`).click();
}

/** Abre a sessão de hoje e registra o texto de exemplo. */
async function registerText(page: Page): Promise<void> {
  await page.goto('#/session');
  await step(page, 2);
  await page.getByLabel('Título').fill('Why we sleep');
  await page.getByLabel('Fonte (opcional)').fill('Science blog');
  await page.getByLabel('Texto', { exact: true }).fill(TEXT);
  await expect(page.getByText(/3 parágrafos · 63 palavras · nível aproximado/)).toBeVisible();
  await page.getByRole('button', { name: 'Registrar o texto' }).click();
  await expect(page.getByRole('button', { name: 'Ir para o LISTEN' })).toBeVisible();
}

test.beforeEach(({ page }) => {
  // Qualquer erro no console reprova o teste.
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('a sessão passa pelo texto, pelo listening e pela leitura, e resume as quatro habilidades', async ({ page }) => {
  await registerText(page);

  await step(page, 3);
  await expect(page.getByRole('heading', { name: 'LISTEN' })).toBeVisible();
  // O texto fica escondido no LISTEN: só os botões de ouvir.
  await expect(page.getByText('During sleep, the brain stores new memories')).toHaveCount(0);
  await page.getByLabel('O que entendi só ouvindo (em inglês ou em português)').fill('It is about sleep and memory.');
  await page.getByLabel('O que você ouviu na frase 1').fill('most adults need between seven and nine hours of sleep every night');
  await page.getByRole('button', { name: 'Conferir' }).first().click();
  await expect(page.getByText(/% das palavras certas/).first()).toBeVisible();

  await step(page, 4);
  await expect(page.getByText('During sleep, the brain stores new memories')).toBeVisible();
  await expect(page.getByText('It is about sleep and memory.')).toBeVisible();

  await step(page, 11);
  for (const skill of ['Listening', 'Reading', 'Speaking', 'Writing']) {
    await expect(page.getByText(skill, { exact: true }).last()).toBeVisible();
  }
  await expect(page.getByText('Gist written after listening')).toBeVisible();
});

test('o ditado do Practice dita só os termos salvos e mostra o contexto depois de conferir', async ({ page }) => {
  await registerText(page);
  await step(page, 5);
  await page.getByLabel('Nova expressão', { exact: true }).fill('regular schedule');
  await page.getByLabel('Significado (depois de tentar deduzir)').fill('rotina regular');
  await page.getByLabel('Frase original', { exact: true }).fill('Keep a regular schedule and avoid screens before bed.');
  await page.getByRole('button', { name: 'Adicionar chunk' }).click();

  await page.goto('#/practice?tab=dictation');
  await page.getByRole('button', { name: /^Começar com/ }).click();
  await page.getByLabel('A palavra ou o chunk que você ouviu').fill('regular skedule');
  await page.getByRole('button', { name: 'Conferir' }).click();
  await expect(page.getByText('Contexto')).toBeVisible();
  await expect(page.getByText('rotina regular')).toBeVisible();
  await expect(page.locator('mark', { hasText: 'schedule' })).toBeVisible();
});

test('texto longo sugere estudar só um trecho', async ({ page }) => {
  await page.goto('#/session');
  await step(page, 2);
  const long = Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1}. ${'This sentence has exactly eight words in it. '.repeat(9)}`);
  await page.getByLabel('Texto', { exact: true }).fill(long.join('\n'));
  await expect(page.getByText(/Texto longo para uma sessão/)).toBeVisible();
  await page.getByRole('button', { name: /Usar só os primeiros/ }).click();
  await expect(page.getByText(/Texto longo para uma sessão/)).toHaveCount(0);
});

test('a voz da leitura em voz alta é escolhida em Ajustes → Áudio', async ({ page }) => {
  await page.goto('#/settings?tab=audio');
  await expect(page.getByLabel('Voz da leitura em voz alta')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ouvir uma prévia/ })).toBeVisible();
});
