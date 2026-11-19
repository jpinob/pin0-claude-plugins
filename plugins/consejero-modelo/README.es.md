# consejero-modelo

[English](README.md) · **Español**

Mientras escribes el primer prompt de una sesión, este mod mira de qué va y te dice en una línea qué modelo y qué effort le pondría:

```
Consejo: Fable · medium · arquitectura   [Aplicar] [Mejorar] [Desactivar]
```

Solo sugiere. No cambia el modelo ni el effort por su cuenta: lo hace si pulsas `Aplicar`. El prompt sale siempre tal como lo escribiste.

Además, en cualquier prompt, el botón `Mejorar` pide a un modelo una versión mejor de lo que escribiste y te la enseña en un panel, junto a una tarjeta de modelo y effort para ese mismo borrador. Tú eliges qué usas, y el Enter lo pulsas tú.

Versión actual: **0.8.0** (en `.claude-plugin/plugin.json`).

![El panel Prompt mejorado: la propuesta de Sonnet para un script que borra logs antiguos, con una etiqueta NECESARIO en rojo, tres ESPECIFICAR en amarillo, la línea de cambios y los botones Usar y Descartar](docs/pane-es.png)

## Idioma

El mod habla español o inglés: la banda, el panel, los avisos, `/consejo` y `/mejora`.

- **Sigue el idioma de lo que escribes.** Lo detecta con palabras frecuentes de cada idioma y con signos como ñ, ¿, ¡ y las tildes, sin llamar a ningún modelo. Si el texto no da pistas o empata, se queda el idioma que tenía.
- **Antes de que escribas nada**, usa el ajuste `language` de Claude Code: con `spanish` o `español`, español; con cualquier otro valor o sin ajuste, inglés.
- **Las etiquetas de la propuesta** van en el idioma del prompt, sea cual sea el de la interfaz.
- `/consejo auditar` también vale como `/consejo audit`.

Lo que no cambia: el nombre de los comandos (`/consejo`, `/mejora`), las filas de `/config` (salen en los dos idiomas a la vez) y lo que se le pide a Haiku y al mejorador.

## Cuándo habla

- En el primer prompt de una sesión nueva y en el primero después de `/clear`. Al reanudar una sesión con `/resume` calla.
- Mientras escribes, antes de pulsar Enter. Así puedes cambiar con `/model` o `/effort` antes de enviar.
- Solo si la sugerencia no coincide con lo que tienes puesto. Si cambias al modelo sugerido, la línea se va. Una excepción: si Haiku revisa el borrador y da por bueno lo que tienes, la línea lo dice (`Consejo: vas bien con Opus · high · depuración`) para que no desaparezca sin más.
- Con menos de 12 caracteres, o si el texto empieza por `/`, no dice nada.
- Al enviar el prompt la línea desaparece y no vuelve en esa conversación.

La línea sale en la banda de encima del prompt: terminal, app de escritorio y móvil. En VS Code esa banda no existe, así que allí no hay línea de consejo ni botón `Mejorar`; `/mejora` funciona, y su panel trae la tarjeta de modelo y effort. En `claude -p` el mod no hace nada.

`/consejo` enseña la última sugerencia con la regla que la disparó, su fuente y los choques que arrastra.

El botón `Mejorar` no sigue estas reglas: sale en cualquier prompt con 12 caracteres o más que no empiece por `/`. Fuera del primer prompt la banda solo tiene ese botón.

## Aceptar el consejo

La línea trae dos botones propios: `Aplicar` y `Desactivar`. Haz clic, o enfoca la banda con `ctrl+x tab` y pulsa su tecla.

`Aplicar` escribe el modelo y el effort sugeridos en sus filas de `/config`, igual que si los cambiaras tú en el menú. Tu prompt se queda en la caja: después solo falta Enter. Un aviso corto dice qué se aplicó.

Dos cosas a saber. Cambiar el modelo desde `/config` puede guardarlo como modelo por defecto de las sesiones nuevas. Y si el motor niega el cambio, el aviso lo dice y tendrás que usar `/model` o `/effort`.

`Desactivar` apaga el consejero toda la sesión, también tras `/clear`: ni consejo ni llamadas a Haiku. En el primer prompt la banda dice entonces "Consejero desactivado" y ofrece `Activar`, que devuelve el consejo para el borrador de la caja. El botón `Mejorar` se queda en los dos casos.

## Mejorar el prompt

Pulsa `Mejorar` en la banda, o escribe `/mejora`. Pasa esto:

1. Un modelo recibe tu borrador y las instrucciones de `improver` en `rules.ts`. Por defecto es Sonnet.
2. Se abre el panel "Prompt mejorado". **Tu caja no cambia todavía.**
3. El panel lleva dos tarjetas, cada una con su marco:
   - **Prompt.** La propuesta, con cuántas etiquetas de cada nivel deja. Debajo, una línea con los cambios: cuántas palabras añadió y cuáles de las tuyas quitó. La calcula el mod comparando los dos textos, sin preguntar al modelo, así que no puede esconder una palabra quitada. Una mayúscula o un punto no cuentan como cambio. Si la propuesta se alarga más de lo permitido, una línea en amarillo lo avisa.
   - **Modelo y effort.** La sugerencia de Haiku para ese mismo borrador: una fila para el modelo y otra para el effort, solo las que cambiarían. Se explica en [Modelo y effort en el panel](#modelo-y-effort-en-el-panel).
4. Cada tarjeta y cada fila tiene `Usar`, en el verde de tu tema, y `Descartar`. Solo apuntan lo que eliges; todavía no cambia nada.
5. Cuando todas las filas tienen elección, sale `Preparar` debajo de las tarjetas. Aplica lo que elegiste: la propuesta va a la caja, y el modelo y el effort a sus filas de `/config`. Nunca envía nada.
6. Después de `Preparar`, `Deshacer` devuelve a la caja exactamente lo que tenía, y el modelo y el effort que tenías.
7. Al pie, la firma "made with ♥ and Ai by Pin0", con los colores de tu tema claro u oscuro. Si el panel es estrecho, sale corta: "♥ Ai Pin0".

### Etiquetas por importancia

El modelo no puede inventar ni suponer nada, ni siquiera marcándolo como dudoso. Donde falta algo, deja una etiqueta con una pregunta:

| Color | En español | En inglés | Significa |
| --- | --- | --- | --- |
| Rojo | `[NECESARIO: …]` | `[REQUIRED: …]` | Solo tú lo sabes, y sin esto habría que adivinar: qué quieres conseguir, qué ves que falla |
| Amarillo | `[ESPECIFICAR: …]` | `[SPECIFY: …]` | Solo tú lo sabes, y cambia el resultado: alcance, límites, casos |
| Verde | `[OPCIONAL: …]` | `[OPTIONAL: …]` | El asistente puede averiguarlo solo mirando el código: archivos, módulos, nombres. Decirlo ahorra tiempo |

La etiqueta va en el idioma del prompt. El color nunca va solo: la palabra dice el nivel, y un lector de voz la lee. Los colores son los del tema (`error`, `warning`, `success`), así que siguen tu modo claro u oscuro. Como mucho 4 etiquetas, las más importantes.

Cuando `Preparar` pone la propuesta en la caja, las etiquetas se pintan también allí, y siguen pintadas mientras escribes.

### Breve

Sin contar las etiquetas, la propuesta no puede pasar del doble de palabras de tu borrador, o de 25 palabras más si el borrador es muy corto. Los números están en `rules.ts` (`maxLengthFactor`, `minExtraWords`, `maxTags`) y la instrucción que recibe el modelo los toma de ahí. Si el modelo se pasa, el panel lo dice.

Después de `Preparar` la banda no dice nada, ni siquiera `Mejorar`, hasta que envías el prompt: ya has decidido para ese borrador. `/mejora` sigue funcionando si lo necesitas. `Deshacer` devuelve la banda.

El mod nunca envía nada: revisas la caja y pulsas Enter tú. Al enviar un prompt, la propuesta se olvida y el panel se cierra.

`/mejora texto` mejora el texto que pongas detrás. `/mejora` solo mejora el último borrador que escribiste en esta conversación, enviado o no.

Las instrucciones que sigue el modelo están en `rules.ts`, cada una con su fuente. Las principales: mantener tu intención y tu idioma, que una pregunta siga siendo pregunta, no quitar nada de lo que pides, no añadir datos que no diste, y no meter pasos ni recordatorios de "verifica" o "piensa con cuidado". Estas dos últimas salen de la [documentación de modelos](https://code.claude.com/docs/en/model-config): "Describe the outcome, not the steps" y "Skip the verification reminders".

### Quién reescribe y cuánto cuesta

`/config`, fila "Quién reescribe el prompt": `sonnet` (por defecto) o `haiku`. Cada pulsación es una llamada de pago, con effort `low`. Si cancelas, la respuesta que llegue tarde no se enseña.

Con los [precios de noviembre de 2026](https://platform.claude.com/docs/en/about-claude/pricing), estimado con 1.500 tokens de entrada y 500 de salida: Sonnet 5.5 unos 0,008 $, Haiku 5.5 unos 0,0004 $. El tope es de 4.000 caracteres de borrador y 3.000 tokens de respuesta: con Sonnet, como mucho unos 0,035 $. Son estimaciones; el gasto real lo ves en `/cost`. Con suscripción cuenta contra tu límite de uso.

#### Sonnet o Haiku: lo medido

El 19 nov 2026 pasé seis prompts reales míos por los dos modelos cinco veces: tres con las instrucciones de la 0.7.3 y dos con las de la 0.7.4 (`claude -p`, el mismo system prompt que el mod, effort `low`). Medias de 30 llamadas por modelo:

| | Sonnet 5.5 | Haiku 5.5 |
| --- | --- | --- |
| Tiempo de API | 2,4 s | 3,1 s |
| Coste por pulsación | 0,007 $ | 0,0005 $ |
| Tokens de salida | 200 | 520 |
| Por encima del tope | 0 | 0 |

Los dos mantuvieron la intención y no pasaron del tope. Haiku se equivoca más de nivel: marca como `[OPCIONAL]` lo que solo sabes tú, y una vez pasó un prompt en inglés a español. Por eso `sonnet` sigue por defecto. La lectura de calidad es mía, leyendo las propuestas; el tiempo y el coste salen de la API.

El modelo solo ve tu borrador: ni tu CLAUDE.md ni tu repo. Por eso tiene prohibido añadir datos y deja etiquetas.

## Modelo y effort en el panel

La tarjeta sigue las mismas reglas y el mismo Haiku que la banda, con una diferencia: también funciona después del primer prompt.

- **Primer prompt.** Modelo y effort, como los aconsejaría la banda. Si el Haiku de la banda ya leyó ese mismo borrador, la tarjeta usa su respuesta y no hace una segunda llamada.
- **Después del primer prompt.** La fila de modelo lleva un aviso en rojo: cambiar de modelo a mitad de sesión rompe la caché, y el modelo nuevo relee toda la conversación sin caché. El aviso da los tokens que releería, como los cuenta la línea de estado.
- **Subir el effort:** lo que pidan las reglas, en cualquier prompt.
- **Bajar el effort después del primer prompt:** un nivel como mucho, y solo si Haiku lee el borrador como tarea nueva y el último turno acabó sin errores de herramientas. Si no, la tarjeta dice que se queda donde está y por qué. El clasificador ve un borrador, y "vale, sigue" en mitad de una migración parece fácil: bajar por error es el fallo caro.

### La memoria de tarea

En una conversación puede haber varias tareas: "migra la base de datos", luego "sí", "sí", "sí", y después "ahora redáctame el README". Un "sí" no dice nada de la tarea, así que después del primer prompt Haiku recibe algo de contexto:

- La tarea en curso: el último borrador que Haiku leyó como tarea propia. El primer prompt siempre empieza una.
- Los últimos cinco prompts que enviaste, con 300 caracteres como mucho cada uno.
- El final de la última respuesta del asistente, con 1.000 caracteres como mucho (`effortLater.contextChars` en `rules.ts`).
- Cómo fue el último turno, en números: herramientas, ediciones de archivos y errores. Nunca lo que devolvieron las herramientas.

Haiku responde por la tarea tal como queda, y dice si el borrador empieza una nueva. Un "sí" hereda la clasificación de su tarea. `/clear` olvida la tarea. Con `palabras` no hay Haiku que lea el contexto: después del primer prompt la tarjeta no propone nada salvo que coincida una palabra de las reglas, y nunca baja el effort.

Cada pulsación de `Mejorar` después del primer prompt es una llamada a Haiku con ese contexto: unos 2.000 tokens de entrada, unos 0,0002 $ con los precios de Haiku 5.5. Es una estimación; el gasto real lo ves en `/cost`.

## Quién clasifica

Hay dos clasificadores y trabajan juntos:

- **Las palabras.** Mientras tecleas, el mod busca en tu texto las palabras de `rules.ts`. Es gratis y sale al momento, pero se equivoca cuando usas una palabra con otro sentido. "La migración de ayer rompió el login" tiene la palabra de Fable y lo que pide es depurar. Por eso, con Haiku activo, la suposición de las palabras nunca se enseña ni se aplica.
- **Haiku.** Cuando dejas de escribir 1,2 segundos, el mod le pasa el borrador a Haiku y le pide que elija entre las mismas reglas. Hasta que responde, la banda dice `Consejo: Haiku mira cuando pares de escribir` o `Consejo: Haiku mirando…`, sin `Aplicar`. Su respuesta es el consejo. Mientras sigues escribiendo sobre el mismo texto, se queda la respuesta de Haiku.

Haiku es una llamada de pago, pequeña. Los frenos:

- Solo en el primer prompt de la conversación, que es cuando el mod habla.
- Nunca por tecla: hace falta la pausa. Si vuelves a escribir, la llamada en curso se corta y no cuenta.
- Sin tope de llamadas, pero ninguna repetida para el mismo texto. Cada borrador nuevo en el que haces la pausa es una llamada.
- Se envían los primeros 2.000 caracteres del borrador y la lista de reglas. La tarjeta del panel, después del primer prompt, añade el contexto de [La memoria de tarea](#la-memoria-de-tarea).

Con los precios de Haiku 5.5 (0,10 $ por millón de tokens de entrada y 0,50 $ de salida), cada llamada sale por unos 0,00015 $: diez pausas sobre diez borradores distintos, unos 0,0015 $. Es una estimación con unos 1.200 tokens de entrada; el gasto real lo ves en `/cost`. Con suscripción cuenta contra tu límite de uso.

Haiku solo puede elegir una regla que exista. Si contesta otra cosa, falla o tarda más de 8 segundos, ese borrador se queda sin consejo y la banda dice por qué: `Haiku no respondió; sin consejo` o `Haiku respondió algo que no vale; sin consejo`. `/consejo` dice quién clasificó.

El consejo de Haiku acaba en `· según Haiku`. Si Haiku vuelve a mirar un borrador más largo, su línea anterior se queda con `· Haiku mirando…` hasta la respuesta nueva. `/consejo` da el motivo del fallo.

Para quedarte solo con las palabras, sin llamar a ningún modelo: `/config`, fila "Quién clasifica el prompt", valor `palabras`. Los números (pausa, tiempo máximo, caracteres) están en `haiku`, dentro de `rules.ts`.

## Por qué solo en el primer prompt

Cada modelo tiene su propia caché de prompt. Si cambias de modelo a mitad de sesión, la siguiente petición relee toda la conversación sin aciertos de caché. Con 100.000 tokens de contexto y la caché de una hora, pasar a Opus 5.5 cuesta unos 0,80 $ frente a 0,02 $ de una lectura normal. En el primer prompt todavía no hay conversación que releer. La tarjeta del panel sí propone modelo más adelante, con ese coste en un aviso rojo: mira [Modelo y effort en el panel](#modelo-y-effort-en-el-panel).

El effort es otra historia: con suscripción o API key, cambiarlo conserva la caché en Fable 5.1 o posterior, Opus 5.5, Sonnet 5.5 y Haiku 5.5.

Fuentes: [prompt caching en Claude Code](https://code.claude.com/docs/en/prompt-caching) y la [tabla de precios](https://platform.claude.com/docs/en/about-claude/pricing), consultadas el 18 de noviembre de 2026.

## Las reglas

Están en [`rules.ts`](rules.ts), un fichero que solo tiene datos. El motor de mods no deja importar `.json`, por eso es `.ts`. Se edita igual: cambias valores y guardas.

- `models`: cada regla tiene un `id`, el `model`, un `reason` corto, sus `words` y su `source`.
- `efforts`: lo mismo para el effort.
- `defaultModel` y `defaultEffort`: lo que se propone cuando ninguna regla encaja.
- `effortStep`: la regla "antes de un modelo mayor, sube el effort". `ceiling` es el effort a partir del cual ya se propone el modelo.
- `conflicts`: los puntos donde mi guía y las fuentes no dicen lo mismo.
- `minChars`: cuánto texto hace falta para clasificar, y para ofrecer `Mejorar`.
- `improver`: las instrucciones del mejorador, cada una con su `source`, y sus límites: caracteres del borrador, tokens de respuesta, tiempo máximo, effort, y a partir de qué parte del texto cambiado se considera reescrito entero (`rewriteThreshold`).

Las palabras se escriben en minúsculas y sin acentos. Una palabra acabada en `*` es un prefijo: `migra*` vale para "migrar" y "migración". Sin `*` tiene que aparecer entera: `log` no salta con "login".

Cómo se decide:

1. Gana la familia de modelo con más palabras encontradas.
2. Un empate entre dos familias es duda, y la duda va al modelo por defecto (Opus).
3. En el effort gana la regla con más palabras; si empatan, el nivel más alto.
4. Si la regla pide un modelo mayor que el tuyo y tu effort está por debajo del `ceiling`, la línea propone subir un nivel de effort en tu modelo actual.

### Choques con las fuentes

Las reglas de modelo son mi guía. Las de effort salen de la [documentación de modelos](https://code.claude.com/docs/en/model-config). Hay cuatro puntos donde mi guía no coincide con esa página o con el artículo [Choosing a Claude model and effort level in Claude Code](https://claude.com/blog/claude-model-and-effort-level-in-claude-code). Están marcados en `rules.ts` como C1 a C4 y `/consejo` los enseña cuando la regla aplicada lleva uno. Queda mi regla.

## Cuando Anthropic cambia cosas

Las reglas hablan de familias de modelo (Haiku, Sonnet, Opus, Fable), no de versiones. Un Opus nuevo no pide tocar nada.

Para lo demás hay un auditor. Solo avisa: nunca cambia `rules.ts`.

- **Al vuelo.** Si tu sesión corre un modelo que no es de ninguna familia de `rules.ts`, la línea lo dice: `· no conozco tu modelo: prueba /consejo auditar`.
- **`/consejo auditar`.** Descarga las dos páginas de las que salen las reglas y comprueba, sin llamar a ningún modelo, que cada frase copiada en `quotes` sigue ahí palabra por palabra, que la tabla de modelos no trae una familia nueva ni ha perdido una, y que no hay un nivel de effort nuevo. El informe sale en la conversación.
- **Opinión de un modelo, solo si hay avisos.** Cuando la comprobación encuentra algo, el mod pasa las reglas, los avisos y unos extractos de las páginas a Sonnet y le pide que diga qué reglas ya no cuadran. Es una llamada de pago: unos 0,03 $ con los precios de Sonnet 5.5 de noviembre de 2026, estimado con 10.000 tokens de entrada. Sin avisos no se llama a nadie.

Qué hacer con un aviso:

- **Familia nueva.** Añade su nombre a `families`, en su sitio de menor a mayor, y dale una regla en `models`. No hay que tocar código.
- **Una cita que ya no aparece.** Abre la página, mira qué dice ahora y decide si la regla sigue valiendo. Luego corrige la frase en `quotes`.
- **Un alias o una fila que no es un modelo ni un nivel.** Apúntalo en `nonFamilyAliases` o `nonEffortLevels` para que deje de avisar.

Las citas se leyeron por última vez contra sus páginas el 18 de noviembre de 2026 (`audit.reviewed`).

## Instalarlo

Escribe esto en el prompt de Claude Code:

```text
/plugin install consejero-modelo --marketplace jpinob/pin0-claude-plugins
```

Contesta `y` para añadir el marketplace y elige un ámbito. Para desactivarlo después:

```bash
claude plugin disable consejero-modelo@pin0-claude-plugins
```

Para probarlo una sola sesión desde un clon del repositorio, sin instalar nada:

```bash
claude --plugin-dir plugins/consejero-modelo
```

Instalado desde el marketplace, Claude Code usa una copia. Lo que edites en `rules.ts` dentro de esa copia se pierde al actualizar: edita tu propio clon.

## Pruebas

```powershell
claude plugin validate .
claude plugin test .
```

`hooks/classifier.test.ts` prueba las reglas con veinticuatro prompts de ejemplo: tres por modelo en español y tres en inglés. `hooks/band.test.tsx` simula la escritura tecla a tecla, el envío, `/clear` y el cambio de modelo. `hooks/haiku.test.tsx` simula a Haiku y el reloj: la pausa, que no repite llamada para el mismo texto y las respuestas malas. `hooks/auditor.test.tsx` audita dos páginas de mentira a las que les quita una cita o les añade una familia. `hooks/improver.test.ts` prueba la petición del mejorador, la lectura de su respuesta, las etiquetas en los dos idiomas, el tope de largo y la comparación de palabras. `hooks/panel.test.tsx` pulsa `Mejorar`, `Usar`, `Preparar`, `Deshacer` y `Cancelar`, prueba `/mejora`, los fallos y el color de las etiquetas en la caja. `hooks/signature.test.tsx` mide el contraste de los colores de la firma sobre fondos claros y oscuros, y comprueba que sale al pie del panel, corta si no cabe y con el corazón dibujado fuera de la terminal. `hooks/i18n.test.tsx` prueba la detección del idioma y que la banda, el panel y `/consejo` cambian de idioma con el borrador. `hooks/effort.test.ts` prueba las filas de la tarjeta: que un "sí" nunca baja el effort, que una tarea nueva baja un solo nivel, los tokens de la fila de modelo y la petición con la memoria de tarea. `hooks/card.test.tsx` prueba la tarjeta con un motor de mentira: la memoria de tarea después del primer prompt, `Preparar` escribiendo en `/config`, la banda callada, `Deshacer`, `/clear` y los colores fijos en VS Code. `hooks/palette.test.ts` mide esos colores. Ningún test llama a un modelo real.

## Límites conocidos

- El motor no tiene una llamada para leer el effort de la sesión. Antes de la primera petición el mod lee la fila de effort de `/config`. Si usas la variable `CLAUDE_CODE_EFFORT_LEVEL`, no la ve. Cuando no consigue leer el effort, compara solo el modelo.
- No mira el estado de `flujo-plan`, que elige modelo por paso. Con un paso activo, la línea compara contra el modelo de tu sesión, no contra el que responderá.
- La parte de Haiku está probada con respuestas simuladas. Qué contesta el Haiku de verdad, y cuánto acierta, se ve usándolo. También la memoria de tarea: no está probado con prompts reales si Haiku distingue un "sí" de una tarea nueva.
- `Preparar` escribe filas de `/config`, como `Aplicar`. En VS Code esa escritura no está probada: allí no había banda para probar `Aplicar`.
- En VS Code no se ven los colores del tema, así que allí el panel usa los colores fijos de la firma, medidos a 4,5:1 sobre los fondos de VS Code. Los colores de las etiquetas en la propia caja del prompt siguen siendo los del tema.
- Los tests del mejorador usan respuestas simuladas. La comparación de Sonnet y Haiku de arriba son seis prompts y cinco pasadas: una muestra pequeña.
- Cerrar el panel tú (con Escape o su aspa) olvida la propuesta. Eso no lo cubre ningún test: el kit de pruebas no puede simular ese cierre.
- `Mejorar` y `/mejora` abren el panel a cualquier ancho de terminal. Si aun así el motor no puede colocarlo (ninguna superficie dibuja paneles), el mod no hace la llamada y un aviso dice por qué.
- La detección del idioma es por palabras. Un borrador corto sin palabras frecuentes ni tildes ("Postgres MySQL") no cambia el idioma.
- La firma "made with ♥ and Ai by Pin0" va al pie del panel "Prompt mejorado" y al final de `/consejo`. En la banda no cabe: es una sola línea.

## Versiones

- **0.8.0**: el panel lleva dos tarjetas, prompt y modelo y effort, cada una con `Usar` y `Descartar`, y `Preparar` aplica lo elegido; después del primer prompt la tarjeta propone modelo con un aviso rojo por la caché, sube el effort sin freno y lo baja un nivel solo con tarea nueva y turno limpio; memoria de tarea para que una racha de "sí" no pierda su tarea; tras `Preparar` la banda calla hasta el siguiente envío; colores fijos en VS Code.
- **0.7.5**: `/mejora` abre el panel también en una terminal estrecha (antes, por debajo de 144 columnas no se dibujaba); `/consejo` y `/mejora` se registran en sesiones que no son la terminal, como las de VS Code.
- **0.7.4**: instrucciones del mejorador ajustadas tras comparar Sonnet y Haiku con prompts reales: una pregunta sigue siendo pregunta, la propuesta y sus etiquetas van en el idioma del prompt, "este archivo" sin nada pegado pide que lo pegues, una preferencia nunca es `[OPCIONAL]` y una pregunta clara no lleva `[NECESARIO]`.
- **0.7.3**: `Desactivar` ya aguanta de verdad un `/clear` (en una sesión real se volvía a activar).
- **0.7.2**: `Desactivar` / `Activar` sustituyen a `Ocultar`, con "Consejero desactivado" en la banda; con Haiku activo, la suposición de las palabras nunca se enseña ni se aplica.
- **0.7.1**: sin tope de llamadas a Haiku, así que la banda ya no se queda muda tras unos cuantos borradores; `Usar` en verde.
- **0.7.0**: el mod habla español o inglés según tu borrador; motivos, choques y palabras del clasificador en los dos idiomas; README en inglés y en español.
- **0.6.5**: las preguntas de las etiquetas pueden traer 2 o 3 opciones cortas; la banda ya no sale atenuada.
- **0.6.4**: si el texto no cambia pero hay etiquetas, el panel ya no dice que el prompt estaba claro.
- **0.6.3**: la firma "made with ♥ and Ai by Pin0" al pie del panel, con los colores del tema.
- **0.6.2**: el código pasa a inglés (ficheros, nombres y claves de `rules.ts`, antes `reglas.ts`). Lo único visible: los mensajes que nombraban `reglas.ts` ahora dicen `rules.ts`.
- **0.6.1**: botones debajo de la propuesta; el verde pasa a ser lo que el asistente puede averiguar solo; preguntas de una línea.
- **0.6.0**: etiquetas `[NECESARIO]`, `[ESPECIFICAR]` y `[OPCIONAL]` (y en inglés) con color en el panel y en la caja; el modelo no puede suponer; tope de largo; botones arriba; resumen corto de cambios; sin texto atenuado en el panel.
- **0.5.0**: botón `Mejorar` y comando `/mejora`, con el panel "Prompt mejorado" y la fila "Quién reescribe el prompt" en `/config`.
- Las versiones anteriores (hasta la 0.4.0) no tienen notas aquí.
