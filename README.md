# tweet-x-delete

Scripts para **borrar todos tus posts de X (Twitter)** y **deshacer todos tus reposts (retweets)** desde el propio navegador, sin API, sin apps de terceros y sin dar tu contraseña a nadie.

Se pegan en la consola de Chrome con tu sesión iniciada y hacen lo mismo que harías tú a mano: abrir el menú «⋯», pulsar «Eliminar» y confirmar.

Probado en noviembre de 2026 con una cuenta de unos 4.400 posts.

> 🇬🇧 **English summary** — Browser-console scripts to delete all your posts on X and undo all your reposts. Paste them into DevTools on x.com while logged in. Deleting posts is rate limited by X: about 200 deletes, then HTTP 429 for about 15 minutes. The scripts detect the 429, wait and resume. Undoing reposts is not limited. Keep the tab visible in the foreground. Details below, in Spanish.

---

## Qué hay

| Script | Para qué | Dónde se pega |
|---|---|---|
| [`delete-posts.js`](delete-posts.js) | Borra tus posts y respuestas. De paso deshace los reposts que encuentre. | `x.com/<tu_usuario>` (pestaña **Posts**) y después `x.com/<tu_usuario>/with_replies` (pestaña **Respuestas**) |
| [`undo-reposts.js`](undo-reposts.js) | Deshace reposts. **X no lo limita**, así que va del tirón. | `x.com/<tu_usuario>/reposts` (pestaña **Reposts**) |
| [`delete-by-search.js`](delete-by-search.js) | Encuentra y borra los posts **antiguos** que el perfil ya no enseña, buscando semana a semana. | Cualquier página de búsqueda de X |
| [`skills/x-delete/SKILL.md`](skills/x-delete/SKILL.md) | Skill para que un agente de IA haga todo el proceso (ver «Con IA»). | — |

---

## Cómo usarlo, paso a paso

1. Abre **Chrome** (o cualquier navegador basado en Chromium) e inicia sesión en x.com.
2. Ve a la página que toque según la tabla de arriba. Por ejemplo, `https://x.com/<tu_usuario>/reposts`.
3. Abre las herramientas de desarrollador con **F12**, o con `Cmd+Opt+J` en Mac y `Ctrl+Shift+J` en Windows/Linux, y entra en la pestaña **Console**.
4. La primera vez, Chrome no deja pegar código. Escribe `allow pasting` y pulsa Enter.
5. Copia **todo** el contenido del script, pégalo en la consola y pulsa **Enter**.
6. **Deja la pestaña de X delante, visible y sin tocarla** (ver «Trampas»). Puedes trabajar en otra ventana siempre que no la tape entera ni la minimice.
7. Para ver el progreso escribe en la consola:
   ```js
   __xStats
   ```
   Para pararlo:
   ```js
   __xStop = true
   ```

### Orden recomendado

1. **`undo-reposts.js`** en la pestaña Reposts. Es lo más rápido porque no tiene límite. Cuando acabe una tanda (`__xStats.done === true`), **recarga la página y pégalo otra vez**, hasta que no quede ninguno.
2. **`delete-posts.js`** en la pestaña **Posts**, y después en la pestaña **Respuestas**. Va solo, con las pausas que imponga X. Si se queda quieto varios minutos sin nada en pantalla, recarga y vuelve a pegarlo.
3. **`delete-by-search.js`** al final, para lo antiguo que el perfil ya no enseña. Ajusta `FROM` y `TO` arriba del script, por ejemplo `FROM` al mes en que abriste la cuenta.

Mira el contador «N posts» de tu perfil, que sale bajo tu nombre, para saber cuánto queda. Tarda un rato en actualizarse.

---

## Límites de X («timeouts»)

Esto es lo que medimos borrando unos 4.400 posts:

| Acción | Límite observado | Qué pasa al pasarlo |
|---|---|---|
| **Borrar un post** (`DeleteTweet`) | Unos **200 borrados** seguidos | X responde **HTTP 429 `Rate limit exceeded`** durante unos **15 minutos** |
| **Deshacer un repost** (`DeleteRetweet`) | **Ninguno** en la práctica (cientos seguidos sin un 429) | — |
| **Cargar el timeline** del perfil | Tandas de unas decenas de posts por carga | Deja de cargar más. Recargar la página da otra tanda |
| **Perfil: posts alcanzables** | Más o menos los **3.200 más recientes** | Los más viejos sólo salen buscando (`delete-by-search.js`) |

Con esos números:

- **Borrar posts** va a unos **400 por hora** (200 → pausa de 15 min → 200…). Mil posts son unas 2,5 horas.
- **Deshacer reposts** va a unos **40–50 por minuto**. Mil reposts son unos 25 minutos.

### ⚠️ El borrado «falso»

Cuando X te limita, **la web quita el post de la pantalla y enseña «Se eliminó tu post», pero el servidor ha respondido 429 y el post sigue ahí**. Si recargas, vuelve a salir.

Por eso estos scripts **leen la respuesta real del servidor** de cada borrado. Sólo cuentan como borrado un 200. Ante un 429 esperan 15 minutos (`WAIT_MINUTES`) y siguen. Si usas otro script que «borra» a toda velocidad sin mirar la respuesta, lo más probable es que la mitad no se haya borrado.

---

## Trampas que nos encontramos (y cómo están resueltas)

- **La pestaña tiene que estar visible.** X sólo dibuja posts nuevos (scroll infinito) cuando la pestaña se ve de verdad en pantalla. En segundo plano el script sigue vivo, pero no le llegan posts. Ventana delante, sin minimizar.
- **Chrome frena los temporizadores en segundo plano.** Un `setTimeout(…, 1000)` puede tardar un minuto en una pestaña oculta. Los scripts largos usan temporizadores de un **Web Worker**, que no se frenan igual.
- **Que el Mac o el PC no se duerma.** Si el equipo entra en reposo, todo se para. En macOS basta con dejar abierto en una terminal:
  ```sh
  caffeinate -di
  ```
- **Posts de otros en «Respuestas».** Esa pestaña enseña también los tuits a los que respondiste. Los scripts los saltan en bloque, sin hacer scroll uno a uno, porque eso lo volvía lentísimo.
- **Búsqueda `from:usuario` sin fechas.** A menudo devuelve «No hay resultados». Con `since:`/`until:` sí funciona, por eso `delete-by-search.js` va por ventanas de 7 días.
- **No uses la API interna directamente.** Las llamadas GraphQL de X exigen una cabecera anti-bot (`x-client-transaction-id`) y devuelven 404 sin ella. Estos scripts sólo pulsan los mismos botones que pulsarías tú.

---

## Con IA (agentes que controlan el navegador)

Si usas un agente de IA que puede manejar tu navegador, como **Claude con la extensión Claude in Chrome**, puede hacer todo el proceso por ti: abrir las pestañas, inyectar los scripts, recargar entre tandas y esperar los 429.

**Opción 1: instalar la skill.** El repo trae una skill en [`skills/x-delete/SKILL.md`](skills/x-delete/SKILL.md) con el procedimiento, los límites y las trampas. En Claude Code, cópiala a tu carpeta de skills:

```sh
git clone https://github.com/katakurinna/tweet-x-delete
mkdir -p ~/.claude/skills && cp -r tweet-x-delete/skills/x-delete ~/.claude/skills/
```

Después basta con pedir: *«borra todos mis posts y reposts de X»*.

**Opción 2: pegarle este prompt** a cualquier agente con control del navegador:

```text
Quiero borrar todos mis posts y deshacer todos mis reposts de X (mi usuario es <tu_usuario>).
Usa los scripts de https://github.com/katakurinna/tweet-x-delete y sigue su README:
1) en x.com/<tu_usuario>/reposts ejecuta undo-reposts.js; cuando __xStats.done sea true, recarga y repite hasta que no quede ninguno;
2) en x.com/<tu_usuario> y luego en /with_replies ejecuta delete-posts.js;
3) para los posts antiguos que el perfil no enseña, delete-by-search.js con FROM = el mes en que abrí la cuenta.
X limita los borrados a unos 200 y luego da 429 unos 15 minutos: el script espera solo, no lo fuerces.
No uses la API interna ni pidas mi contraseña. Compruébalo con el contador «N posts» del perfil, no sólo con lo que diga el script.
Avísame del contador real cada media hora.
```

---

## Preguntas

**¿Es seguro? ¿Me pueden suspender la cuenta?**
Los scripts sólo hacen clic en los botones de la web, al ritmo que X permite, y paran cuando X dice 429. No envían tu sesión a ningún sitio ni llaman a servidores de terceros. Aun así, automatizar la web va contra las condiciones de X: úsalo bajo tu responsabilidad.

**¿Se puede deshacer?**
**No.** Un post borrado no se recupera. Si quieres guardar una copia, antes descarga tu archivo desde *Configuración → Tu cuenta → Descargar un archivo de tus datos*.

**¿Borra los «Me gusta»?**
No. Sólo posts, respuestas y reposts.

**El contador del perfil no llega a 0.**
El contador de X va con retraso y a veces cuenta cosas que ya no existen, como respuestas a tuits borrados o reposts de cuentas suspendidas. Si `delete-posts.js`, `undo-reposts.js` y `delete-by-search.js` ya no encuentran nada, prácticamente no queda nada.

**Mi X está en otro idioma.**
El botón «Eliminar» se reconoce en español, inglés, portugués, francés, alemán e italiano. Si el tuyo es otro, añade la palabra a la expresión regular `/^(Eliminar|Delete|…)$/` del script.

---

## Licencia

MIT. Ver [LICENSE](LICENSE).
