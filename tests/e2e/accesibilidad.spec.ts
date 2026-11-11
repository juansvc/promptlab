import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

/**
 * Auditoría automática de accesibilidad (WCAG 2.0, 2.1 y 2.2, niveles A y AA) con axe-core
 * en las seis pantallas, y comprobación del recorrido con teclado.
 * Una auditoría automática detecta solo parte de los problemas: no sustituye la revisión manual.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const report: Record<string, unknown> = {};

async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  report[name] = {
    violaciones: r.violations.map((v) => ({ regla: v.id, impacto: v.impact, descripcion: v.help, nodos: v.nodes.length, ejemplo: v.nodes[0]?.target })),
    reglasSuperadas: r.passes.length,
    incompletas: r.incomplete.length,
  };
  return r.violations;
}

test('auditoría axe de las pantallas principales', async ({ page }) => {
  await page.goto('/?simulador=rapido#/');
  await audit(page, 'proyectos-vacio');
  await page.getByRole('button', { name: 'Crear el proyecto de ejemplo' }).click();
  await expect(page.getByText('Versión 2', { exact: true })).toBeVisible();
  await audit(page, 'prompt');
  await page.getByRole('tab', { name: 'Comparar versiones' }).click();
  await audit(page, 'diff');
  await page.getByRole('link', { name: /Casos de prueba/ }).click();
  await audit(page, 'casos');
  await page.getByRole('link', { name: /Ejecutar/ }).click();
  await audit(page, 'ejecutar');
  await page.getByLabel('Repeticiones por caso').fill('1');
  await page.getByRole('button', { name: /Ejecutar 80 llamadas/ }).click();
  await expect(page.getByRole('heading', { name: 'Resumen por alternativa' })).toBeVisible({ timeout: 60_000 });
  await audit(page, 'comparar');
  await page.getByRole('button', { name: /caso F28/ }).first().click();
  await audit(page, 'comparar-detalle');
  await page.goto('/#/ajustes');
  await audit(page, 'ajustes');
  mkdirSync('docs/evidencias', { recursive: true });
  writeFileSync('docs/evidencias/axe-2026-11-11.json', JSON.stringify(report, null, 2));
});

test('recorrido con teclado: crear proyecto y llegar al editor sin ratón', async ({ page }) => {
  await page.goto('/#/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  // Avanzar con Tab hasta el botón principal y activarlo con Enter.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => document.activeElement?.textContent ?? '');
    if (label.includes('Crear el proyecto de ejemplo')) break;
  }
  await page.keyboard.press('Enter');
  await expect(page.getByText('Versión 2', { exact: true })).toBeVisible();
  // El foco debe ser visible: el contorno de :focus-visible no puede ser «none».
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe('none');
});
