import { expect, test, type Page } from '@playwright/test';

/**
 * Prueba del flujo completo con el adaptador simulado (sin claves ni llamadas reales).
 * Además guarda capturas en docs/capturas para el capítulo 4.
 */
const shot = (page: Page, name: string) => page.screenshot({ path: `docs/capturas/${name}.png`, fullPage: true });

test('flujo completo: proyecto de ejemplo, versiones, ejecución simulada y comparación', async ({ page }) => {
  await page.goto('/?simulador=rapido#/');
  await expect(page.getByRole('heading', { name: 'Aún no hay proyectos' })).toBeVisible();
  await shot(page, '01-proyectos-vacio');

  await page.getByRole('button', { name: 'Crear el proyecto de ejemplo' }).click();
  await expect(page.getByText('Versión 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Sin claves: solo modo simulado')).toBeVisible();
  await shot(page, '02-editor-prompt');

  // Validación estructural: vaciar la tarea genera un error y bloquea el guardado.
  const task = page.getByRole('textbox', { name: 'Tarea' });
  await task.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await expect(page.getByText('Falta la sección «Tarea».')).toBeVisible();
  await shot(page, '03-validacion-estructural');
  await page.keyboard.type('Extrae los campos indicados de la factura y devuelve solo JSON.');
  await page.getByLabel('Qué cambió y por qué').fill('Pido explícitamente devolver solo JSON.');
  await page.getByRole('button', { name: 'Guardar como versión 3' }).click();
  await expect(page.getByText('Versión 3 guardada.')).toBeVisible();

  await page.getByRole('tab', { name: 'Comparar versiones' }).click();
  await page.getByLabel('Versión anterior').selectOption({ label: 'Versión 1' });
  await page.getByLabel('Versión nueva').selectOption({ label: 'Versión 2' });
  await expect(page.locator('ins.diff-ins').first()).toBeVisible();
  await shot(page, '04-diff-versiones');

  await page.getByRole('link', { name: /Casos de prueba/ }).click();
  await expect(page.getByText('Hay 10 de ajuste y 20 de prueba.')).toBeVisible();
  await shot(page, '05-casos');

  await page.getByRole('link', { name: /Ejecutar/ }).click();
  await expect(page.getByText(/4 alternativas × 20 casos × 3 repeticiones = 240 llamadas/)).toBeVisible();
  await page.getByLabel('Repeticiones por caso').fill('2');
  await page.getByLabel('Nombre (opcional)').fill('v2 frente a v3 (simulado)');
  await shot(page, '06-configurar-ejecucion');
  await page.getByRole('button', { name: /Ejecutar 160 llamadas/ }).click();

  await expect(page.getByRole('heading', { name: 'Resumen por alternativa' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Resultados simulados: no representan modelos reales')).toBeVisible();
  await expect(page.getByRole('cell', { name: /cumple/ }).first()).toBeVisible();
  await page.getByLabel('A', { exact: true }).selectOption({ index: 0 });
  await page.getByLabel('B', { exact: true }).selectOption({ index: 2 });
  await expect(page.getByText(/Evidencia insuficiente|extrajo mejor en estos casos/)).toBeVisible();
  await shot(page, '07-comparacion');

  await page.getByRole('button', { name: /caso F28/ }).first().click();
  await expect(page.getByText('Ver salidas en bruto')).toBeVisible();
  await page.getByText('Ver salidas en bruto').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/capturas/08-detalle-caso.png' });

  // Persistencia local: tras recargar, los datos siguen ahí y las claves no.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Resumen por alternativa' })).toBeVisible();
});

test('la ejecución se puede cancelar y conserva lo ejecutado', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Crear el proyecto de ejemplo' }).click();
  await page.getByRole('link', { name: /Ejecutar/ }).click();
  await page.getByRole('button', { name: /Ejecutar 240 llamadas/ }).click();
  await expect(page.getByText('Ejecución en curso')).toBeVisible();
  await shot(page, '09-ejecucion-en-curso');
  await page.getByRole('button', { name: 'Cancelar ejecución' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen por alternativa' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/llamadas no llegaron a ejecutarse/)).toBeVisible();
});

test('las claves solo viven en memoria y no aparecen en la exportación', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.getByLabel('OpenAI', { exact: true }).fill('sk-prueba-1234567890abcdefghij');
  await expect(page.getByText('1 clave en memoria')).toBeVisible();
  const stored = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    return JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, dbs });
  });
  expect(stored).not.toContain('sk-prueba');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar todo (JSON)' }).click();
  const file = await (await download).path();
  const text = await (await import('node:fs/promises')).readFile(file!, 'utf8');
  expect(text).not.toContain('sk-prueba');
  await shot(page, '10-ajustes-claves');
  await page.reload();
  await expect(page.getByText('Sin claves: solo modo simulado')).toBeVisible();
});
