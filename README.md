# PromptLab

Aplicación web de página única (SPA) para construir, versionar y comparar *prompts* y modelos de lenguaje en una tarea delimitada: la extracción de datos estructurados de facturas. Es la contribución del Trabajo Fin de Estudios del Máster Universitario en Diseño y Desarrollo de Interfaz de Usuario Web (UNIR), tipología 1.

Autor: Juan Sebastián Vivanco Castro · Directora: Andrea Vanessa Mory Alvarado

**Aplicación desplegada:** https://promptlab-eight-eta.vercel.app  
**Demostración sin claves:** https://promptlab-eight-eta.vercel.app/?simulador=rapido (adaptador simulado)

## Qué hace

1. **Prompt y versiones.** Editor por secciones (rol, contexto, tarea, restricciones, formato de salida, ejemplos y entrada) con variables `{{factura}}`, validación estructural, vista previa de los mensajes y versionado con nota obligatoria y *diff*.
2. **Casos de prueba.** 30 facturas sintéticas en texto (20 completas, 6 incompletas, 4 ambiguas; 10 de ajuste y 20 de prueba) con el valor esperado de 10 campos. Se pueden editar y añadir.
3. **Ejecutar.** Alternativas = versión de *prompt* × modelo. Proveedores: OpenAI y Anthropic (versión mínima), Google Gemini (opcional) y un adaptador simulado. Previsión de llamadas y coste, límite de gasto, cancelación, un reintento como máximo, llamadas secuenciales por proveedor.
4. **Comparar.** JSON válido, cumplimiento del esquema, exactitud por campo con reglas por tipo de dato, omisiones y valores inventados, casos inconsistentes entre repeticiones, coste estimado, latencia (mediana; P95 solo con 20 o más observaciones), comparación pareada por caso con «evidencia insuficiente», detalle por caso y exportación CSV.

Las definiciones exactas están en el apartado 3.3.7 de la memoria y en `src/domain/metrics.ts`.

## Datos y credenciales

- Proyectos, versiones, casos, ejecuciones y tarifas se guardan en **IndexedDB** (Dexie.js), en el navegador.
- Las **claves de API viven solo en memoria** (Zustand, `src/store/session.ts`): no se escriben en IndexedDB, `localStorage` ni exportaciones, y se pierden al recargar. La importación rechaza archivos que parezcan contener claves.
- En cada ejecución, el *prompt* renderizado y el caso se envían **directamente al proveedor elegido**. Vercel solo sirve archivos estáticos.
- `vercel.json` define una política de seguridad de contenidos que solo permite conectar con las API de OpenAI, Anthropic y Google. No hay analítica ni *scripts* de terceros.
- Riesgo residual: cualquier código que se ejecute en la página (por ejemplo, una extensión del navegador o un XSS) podría leer la clave. Usa claves propias con límite de gasto y revócalas al terminar.

## Tecnologías

React 19 + TypeScript, Vite, Tailwind CSS 4 con *design tokens* propios (`src/index.css`), Zustand, Dexie.js, CodeMirror 6, Recharts, diff-match-patch, Vitest y Playwright. Tipografía Atkinson Hyperlegible Next/Mono, autoalojada.

## Uso local

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # pruebas unitarias (métricas, prompts, motor de ejecución)
npm run build
npx playwright install chromium   # solo la primera vez
npm run test:e2e     # flujo completo con el simulador; guarda capturas en docs/capturas
```

Añade `?simulador=rapido` a la URL para que el adaptador simulado responda casi al instante (útil en demostraciones).

## Despliegue en Vercel

Despliegue actual: https://promptlab-eight-eta.vercel.app (Vercel, sin variables de entorno). Cada cambio en `main` se publica automáticamente.

1. En vercel.com → *Add New Project* → importa https://github.com/juansvc/promptlab. Vercel detecta Vite: comando `npm run build`, salida `dist`.
2. Abre https://promptlab-eight-eta.vercel.app → **Ajustes y claves** → pega tus claves → **Verificación de proveedores** → *Probar llamada* en OpenAI y Anthropic (y Gemini si lo usarás).
3. Descarga la evidencia (JSON) y haz una captura de la tabla de resultados: es la prueba mínima desde el origen real que exige la semana 1 del plan.

## Estructura

```
src/domain/      tipos, prompts, métricas y motor de ejecución (lógica pura y probada)
src/providers/   adaptadores de OpenAI, Anthropic, Gemini y simulado
src/db/          IndexedDB (Dexie) y exportación/importación
src/store/       estado en memoria (claves y progreso)
src/views/       pantallas: proyectos, prompt, casos, ejecutar, comparar, ajustes
src/data/        caso de estudio: facturas sintéticas, versiones de ejemplo y tarifas
scripts/         generador determinista de las facturas sintéticas
tests/e2e/       pruebas de extremo a extremo con Playwright
docs/            instrumentos de la fase 1 y capturas
```

## Tarifas por defecto

Consultadas el 11 de noviembre de 2026 en las páginas oficiales de precios. Los precios cambian: verifícalos en **Ajustes y claves → Tarifas** antes de cada experimento. Cada ejecución guarda una copia de las tarifas que usó.

## Limitaciones conocidas

- Los resultados del adaptador simulado no representan modelos reales y se marcan como tales.
- La latencia se mide en el navegador e incluye la red.
- La comparación es descriptiva; no aplica pruebas estadísticas.
- Si un proveedor deja de aceptar llamadas desde el navegador, quedaría fuera de la versión mínima.
