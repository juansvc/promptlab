# Instrumentos de la fase 1 (identificación de requisitos)

Corresponden al OE1 y al apartado 3.3.4 de la memoria. Perfil: desarrolladores que han integrado al menos una API de LLM en un proyecto.

Canales de reclutamiento: compañeros del entorno profesional, comunidades de desarrollo de Ecuador y estudiantes del máster con experiencia en integración de API. Meta: entre 15 y 20 respuestas al cuestionario y 5 entrevistas.

---

## 1. Cuestionario (Google Forms o Microsoft Forms, unos 7 minutos)

**Texto de introducción**

> Este cuestionario forma parte de un Trabajo Fin de Máster de la Universidad Internacional de La Rioja (UNIR) sobre cómo los desarrolladores prueban y eligen *prompts* y modelos de lenguaje. Es anónimo, voluntario y dura unos 7 minutos. Las respuestas se usarán solo de forma agregada para definir los requisitos de una herramienta. Puedes dejarlo en cualquier momento.

**Bloque A. Perfil**

1. ¿Has integrado alguna API de modelos de lenguaje (OpenAI, Anthropic, Google u otra) en un proyecto? *(Sí / No → si responde No, termina)*
2. Años de experiencia como desarrollador/a: *(menos de 2 / 2–5 / 6–10 / más de 10)*
3. Rol principal: *(front-end / back-end / full-stack / datos o IA / otro)*
4. País donde trabajas: *(texto)*
5. ¿En cuántos proyectos con LLM has trabajado? *(1 / 2–3 / 4 o más)*

**Bloque B. Práctica actual**

6. ¿Para qué tareas usas LLM en tus proyectos? *(extracción de datos de documentos / clasificación / resumen / chat / generación de código / otra)*
7. ¿Dónde guardas tus *prompts*? *(en el código / en archivos aparte / en una herramienta de gestión / en notas o documentos / no los guardo)*
8. Cuando cambias un *prompt*, ¿registras qué cambió y por qué? *(Escala 1 = nunca, 5 = siempre)*
9. Antes de dar por bueno un *prompt*, ¿con cuántos casos distintos lo pruebas? *(1–2 / 3–10 / más de 10 / depende)*
10. ¿Ejecutas el mismo caso varias veces para ver si la respuesta cambia? *(nunca / a veces / siempre)*
11. ¿Has comparado el mismo *prompt* en modelos de distintos proveedores? *(sí, en una herramienta / sí, a mano / no)*
12. ¿Qué herramientas usas para probar *prompts*? *(Playground de OpenAI / Consola de Anthropic / Google AI Studio / Langfuse / promptfoo / scripts propios / ninguna / otra)*

**Bloque C. Criterios de decisión**

13. Ordena por importancia al elegir un *prompt* y un modelo: *exactitud, formato correcto, coste, tiempo de respuesta, consistencia entre ejecuciones.*
14. ¿Calculas el coste antes de llevar un *prompt* a producción? *(nunca / a veces / siempre)*
15. Grado de acuerdo (1–5): «Me resulta difícil saber si un cambio en el *prompt* mejoró los resultados».
16. Grado de acuerdo (1–5): «Me resulta difícil comparar modelos de distintos proveedores».
17. ¿Te preocupa enviar datos de prueba o claves de API a herramientas de terceros? *(1–5)*

**Bloque D. Abierta**

18. Describe la última vez que tuviste que elegir entre dos *prompts* o dos modelos. ¿Cómo lo decidiste?
19. ¿Qué te gustaría que hiciera una herramienta para ayudarte con eso?
20. ¿Aceptarías participar en una entrevista de 30 minutos o en una prueba de la herramienta? *(Sí, deja tu correo / No)*

---

## 2. Guion de entrevista semiestructurada (30 minutos, remota)

**Inicio (3 min).** Presentación, objetivo, voluntariedad, confirmación del consentimiento y de la grabación (solo audio, si acepta).

**Contexto (5 min)**
- Cuéntame un proyecto en el que hayas integrado un LLM. ¿Qué tarea resolvía?
- ¿Quién escribía los *prompts* y quién decidía qué modelo usar?

**Proceso actual (10 min)**
- Muéstrame o descríbeme cómo pruebas un *prompt* nuevo. ¿Con qué casos?
- ¿Qué haces cuando un cambio mejora un caso pero empeora otro?
- ¿Cómo sabes que una respuesta es correcta? ¿Tienes respuestas esperadas?
- ¿Cómo guardas las versiones? ¿Has vuelto alguna vez a una versión anterior?

**Decisión y coste (7 min)**
- ¿Cómo elegiste el modelo? ¿Comparaste alternativas?
- ¿Qué peso tuvieron el coste y la velocidad?
- ¿Qué información te habría ayudado a decidir antes o con más seguridad?

**Cierre (5 min)**
- Si tuvieras una herramienta para esto, ¿qué tres cosas debería hacer sí o sí?
- ¿Qué te haría desconfiar de sus resultados?

**Registro.** Por cada entrevista: código (E1–E5), perfil, citas relevantes y necesidades detectadas. Al final se agrupan las necesidades en una tabla *necesidad → requisito → prioridad (MoSCoW)* para el apartado 4.1.

---

## 3. Consentimiento informado (entrevistas y pruebas de usabilidad)

> **Participación en el estudio «PromptLab»**
>
> Investigador: Juan Sebastián Vivanco Castro, estudiante del Máster Universitario en Diseño y Desarrollo de Interfaz de Usuario Web (UNIR). Directora: Andrea Vanessa Mory Alvarado.
>
> **Objetivo:** conocer cómo los desarrolladores prueban y eligen *prompts* y modelos de lenguaje, y evaluar la usabilidad de una herramienta.
>
> **Qué harás:** una entrevista o sesión remota de 30 a 45 minutos. En la prueba de la herramienta se usarán datos ficticios; no necesitas aportar claves de API ni datos propios.
>
> **Datos:** se registrarán tus respuestas, tiempos y, si lo aceptas, el audio o la pantalla. Los datos se anonimizarán con un código, se usarán solo para este trabajo, se guardarán en un medio protegido y se eliminarán al terminar la evaluación académica. Se tratarán conforme a la Ley Orgánica de Protección de Datos Personales de Ecuador.
>
> **Voluntariedad:** puedes negarte o retirarte en cualquier momento sin dar explicaciones.
>
> Acepto participar ☐  · Acepto la grabación de audio ☐  · Acepto la grabación de pantalla ☐
>
> Nombre o código: ______ · Fecha: ______

---

## 4. Prueba del prototipo (fase 2, tres usuarios, pensamiento en voz alta)

Tareas sobre el prototipo de bajo nivel (o sobre el primer incremento desplegado):

1. Crea una nueva versión del *prompt* que pida usar `null` cuando falte un dato.
2. Compara la versión nueva con la anterior.
3. Encuentra los casos incompletos.
4. Prepara una ejecución de las dos versiones con el mismo modelo y di cuántas llamadas hará.
5. En la comparación, di qué versión extrajo mejor los datos y si la diferencia es suficiente.

Registrar por tarea: éxito (sí / con ayuda / no), tiempo, dudas expresadas en voz alta y la decisión de diseño que se derive de cada hallazgo.

---

## 5. Bitácora de desarrollo (plantilla, una fila por tarea terminada)

Repositorio: https://github.com/juansvc/promptlab · Despliegue: https://promptlab-eight-eta.vercel.app

| Fecha | Tarea (tarjeta Kanban) | Objetivo | *Commit* | URL del despliegue | Pruebas | Captura | Observaciones |
|---|---|---|---|---|---|---|---|
| 2026-11-11 | Primer incremento funcional: RF01–RF17 | OE3–OE5 | 53a2892 | https://promptlab-eight-eta.vercel.app | 35 unitarias y 7 de extremo a extremo: todas superadas | docs/capturas | Implementación previa al prototipo de bajo nivel |
| 2026-11-11 | Despliegue en Vercel y comprobación desde producción | OE4 | 53a2892 | https://promptlab-eight-eta.vercel.app | CORS de los tres proveedores (401, 401, 400) y bloqueo de dominios ajenos por la CSP | — | Pendiente: verificación con claves reales |
| | | | | | | | |
