import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Genera las capturas de la memoria (capítulo 4) en docs/capturas/memoria.
 * Usa el adaptador simulado: las cifras que aparecen NO son resultados de modelos reales.
 */
test.use({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const dir = 'docs/capturas/memoria';
const el = (l: Locator, name: string) => l.screenshot({ path: `${dir}/${name}.png` });
async function mainTop(page: Page, name: string, height = 820) {
  const box = (await page.locator('main').boundingBox())!;
  await page.screenshot({ path: `${dir}/${name}.png`, clip: { x: box.x - 8, y: Math.max(0, box.y - 8), width: box.width + 16, height } });
}

test('capturas para la memoria', async ({ page }) => {
  await page.goto('/?simulador=rapido#/');
  await page.getByRole('button', { name: 'Crear el proyecto de ejemplo' }).click();
  await expect(page.getByText('Versión 2', { exact: true })).toBeVisible();
  await mainTop(page, 'editor');
  await el(page.locator('nav[aria-label="Pasos del flujo"]'), 'pasos');

  const task = page.getByRole('textbox', { name: 'Tarea' });
  await task.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await el(page.locator('.panel', { hasText: 'Validación estructural' }), 'validacion');
  await page.keyboard.type('Extrae los campos indicados de la factura.');

  await page.getByRole('tab', { name: 'Comparar versiones' }).click();
  await page.getByLabel('Versión anterior').selectOption({ label: 'Versión 1' });
  await page.getByLabel('Versión nueva').selectOption({ label: 'Versión 2' });
  await el(page.locator('section[aria-label="Comparar versiones"]'), 'diff');

  await page.getByRole('link', { name: /Casos de prueba/ }).click();
  await page.getByRole('button', { name: /F27/ }).click();
  await mainTop(page, 'casos', 760);

  await page.getByRole('link', { name: /Ejecutar/ }).click();
  await page.getByLabel('Nombre (opcional)').fill('Versión 1 frente a versión 2 (simulado)');
  await mainTop(page, 'ejecutar', 860);
  await page.getByRole('button', { name: /Ejecutar 240 llamadas/ }).click();

  await expect(page.getByRole('heading', { name: 'Resumen por alternativa' })).toBeVisible({ timeout: 60_000 });
  await el(page.locator('section[aria-labelledby="sum-title"]'), 'resumen');
  await page.getByLabel('A', { exact: true }).selectOption({ index: 0 });
  await page.getByLabel('B', { exact: true }).selectOption({ index: 2 });
  await el(page.locator('section[aria-label="Comparación entre dos alternativas"]'), 'tira-y-par');
  await page.getByRole('button', { name: /caso F28/ }).first().click();
  await el(page.locator('section[aria-label^="Detalle de"]'), 'detalle');
  await page.getByRole('button', { name: 'Cerrar detalle' }).click();
  await el(page.locator('section.grid', { hasText: 'Exactitud frente a coste' }), 'grafico-y-campos');

  await page.goto('/#/ajustes');
  await page.getByLabel('OpenAI', { exact: true }).fill('sk-ejemplo-no-real-000000000000');
  await mainTop(page, 'ajustes', 900);
});

test('captura de la ejecución en curso', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Crear el proyecto de ejemplo' }).click();
  await page.getByRole('link', { name: /Ejecutar/ }).click();
  await page.getByRole('button', { name: /Ejecutar 240 llamadas/ }).click();
  await expect(page.getByText('Ejecución en curso')).toBeVisible();
  await page.waitForTimeout(4000);
  await el(page.locator('div.panel', { hasText: 'Ejecución en curso' }), 'en-curso');
  await page.getByRole('button', { name: 'Cancelar ejecución' }).click();
});
