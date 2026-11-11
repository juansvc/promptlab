import { describe, expect, it } from 'vitest';
import { emptySections, findVariables, renderPrompt, validateStructure } from './prompt';
import { PROMPT_V1, PROMPT_V2 } from '../data/seed';

describe('prompt', () => {
  it('encuentra variables', () => expect(findVariables(PROMPT_V2)).toEqual(['factura']));

  it('separa instrucciones (sistema) y datos (usuario)', () => {
    const r = renderPrompt(PROMPT_V2, { factura: 'TEXTO' });
    expect(r.system).toContain('## Restricciones');
    expect(r.system).not.toContain('TEXTO');
    expect(r.user).toContain('TEXTO');
    expect(r.user).not.toContain('{{factura}}');
  });

  it('la validación estructural detecta secciones obligatorias vacías', () => {
    const issues = validateStructure(emptySections(), 'factura');
    expect(issues.filter((i) => i.level === 'error').map((i) => i.section)).toEqual(['task', 'outputFormat', 'input']);
  });

  it('avisa si la entrada no usa la variable del caso o si hay variables sin valor', () => {
    const s = { ...PROMPT_V1, input: 'Factura: {{documento}}' };
    const msgs = validateStructure(s, 'factura').map((i) => i.message).join(' ');
    expect(msgs).toContain('no usa la variable {{factura}}');
    expect(msgs).toContain('{{documento}} no tiene valor');
  });

  it('las versiones de ejemplo no tienen errores estructurales', () => {
    expect(validateStructure(PROMPT_V2, 'factura').filter((i) => i.level === 'error')).toEqual([]);
  });
});
