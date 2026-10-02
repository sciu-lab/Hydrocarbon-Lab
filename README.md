# Hydrocarbon Lab

## Hydrocarbon Lab / Laboratorio de Hidrocarburos

Simulación didáctica bilingüe (ES/EN) para construir y analizar estructuras de
química orgánica en vista semidesarrollada o esquelética. Incluye hidrocarburos,
ciclos, aromáticos, grupos funcionales, un constructor desde nombres IUPAC y
una biblioteca personal importable y exportable mediante archivos `.quimica`.
El selector de idioma recuerda la preferencia del visitante y las versiones
pueden compartirse directamente mediante `/es/` y `/en/`.

- GitHub Pages: https://sciu-lab.github.io/Hydrocarbon-Lab/
- Español: https://sciu-lab.github.io/Hydrocarbon-Lab/es/
- English: https://sciu-lab.github.io/Hydrocarbon-Lab/en/

La versión de GitHub Pages se genera automáticamente desde la rama `main` con
`npm run build:pages`. En GitHub Pages, el historial queda guardado localmente
en el navegador; en Sites se sincroniza mediante su almacenamiento persistente,
si el binding D1 y sus migraciones están configurados.

## Práctica, examen y variantes de clase

Practice ofrece Nomenclatura, Opción múltiple y Construir la molécula, con
feedback, repaso de errores, dominio final y Detailed Reviewer. Exam conserva
borradores y permite navegar antes de un envío explícito; revela resultados,
Dashboard y Reviewer después de enviar. El Dashboard agrupa los intentos por
categoría y tipo y permite revisar las respuestas sin cambiar su puntuación.
Las sesiones usan semillas reproducibles y protegen contra ejercicios repetidos.
Los recuentos finitos son enteros positivos; un conjunto de preguntas puede
agotarse y fallar de forma segura, sin iniciar un examen parcial.

Class Seed genera semillas estables para IDs anónimos de participantes y exporta
asignaciones CSV. Es una herramienta de reproducibilidad: no verifica identidades,
no oculta las semillas y no ofrece seguridad de examen, anti-cheat, cuentas,
entrega de resultados ni seguimiento docente remoto.

El alcance didáctico de los ejercicios comprende 17 categorías: alcanos, alquenos,
alquinos, halogenados, alcoholes, aldehídos, cetonas, ácidos carboxílicos, éteres,
ésteres, aminas, amidas, carbociclos simples, aromáticos, E/Z, nitrilos y nitro.
La nomenclatura tiene un alcance delimitado; no es un sistema universal para
cualquier estructura orgánica. Véanse los informes y corpus de referencia en
`docs/` y `tests/reference-corpus/`. El código está disponible en este repositorio. Actualmente no
incluye un archivo de licencia explícita; la política de reutilización debe
aclararse antes de presentarlo como software con licencia de código abierto.

## Ejecutar la versión pública localmente

Con Node.js >=22.13.0 y las dependencias del lockfile (`npm ci`):

```sh
npm run dev:pages
npm run build:pages
npm run validate:pages
npm run preview:pages
```

Abra la URL indicada por Vite bajo `/Hydrocarbon-Lab/`, o directamente sus rutas
`es/` y `en/`. El build estático se publica desde `dist-pages` por
`.github/workflows/deploy-pages.yml`; no necesita Worker ni base de datos.
Las cachés de Pages y Vinext están separadas para evitar módulos optimizados
obsoletos al alternar servidores y pruebas. `npm run dev` inicia el adaptador
Vinext/Sites; su almacenamiento D1 local necesita las migraciones SQL de
`drizzle/`. Los scripts de build, lint y test de Sites requieren Bash y las
herramientas GNU indicadas más abajo; en Windows puede usarse Git Bash.

Para inicializar D1 **solo localmente**, después de `npm run build`:

```sh
npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_nervous_husk.sql
npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_blue_lightspeed.sql
```

Son migraciones iniciales: aplíquelas una sola vez a una base vacía. El despliegue
Sites remoto necesita su propio binding y proceso de migración; estos comandos
no preparan una base remota.

## Persistencia y privacidad

En la versión estática, molécula en edición, History y Save usan almacenamiento
local del navegador. El idioma, tema y preferencias también se conservan localmente.
No se comparten entre dispositivos y pueden perderse al limpiar o bloquear ese
almacenamiento. Practice/Exam, borradores, intentos y Dashboard son temporales:
recargar la página termina la sesión. Exporte su biblioteca si necesita una copia.

Existe Google Analytics (`G-FZ76EQBG32`), conservado durante RC1; no se ha añadido
telemetría en esta fase. Las consultas opcionales por nombre o contexto de un
compuesto pueden contactar OPSIN, PubChem, Wikidata y Wikipedia. Los ejercicios
y su evaluación se ejecutan localmente. Esto no equivale a prometer funcionamiento
completo sin red ni ausencia de terceros.

Para informar errores use la plantilla de GitHub Issues e incluya URL, navegador,
idioma, modo, tipo, semilla y número de pregunta; el ID anónimo de participante
solo cuando corresponda. No incluya nombres de estudiantes ni datos personales.
Indique el commit del despliegue si lo conoce; RC1 está documentado en
`docs/release-hardening-rc1.md`. El paquete conserva su versión `0.1.0`; no se
ha creado un tag ni una publicación nueva.

## Nomenclatura y estructuras extensas

- La ficha de nombre permite elegir **IUPAC sugerido (Blue Book 2013+)** o
  **IUPAC 1979 (Legacy)**. El perfil Legacy aplica las convenciones históricas
  implementadas para las estructuras admitidas y señala cuando no está disponible.
  Los nombres comunes, cuando existen, se muestran como información adicional.
- El constructor local reconoce y genera padres hidrocarbonados desde C1 hasta
  C100; la tabla preferida solicitada de C1 a C50 se comparte entre el parser,
  el generador y el sistema «¿Quisiste decir…?».
- El botón **Ampliar** abre el canvas en una capa responsive que se cierra con
  el botón, con `Esc` o pulsando el fondo. Las coordenadas visuales, las fuentes
  y el espaciado se escalan automáticamente para cadenas cortas, medianas y
  largas sin modificar la conectividad molecular.
- El constructor local reconoce alcoholes, aldehídos, cetonas y ácidos simples
  escritos sin localizador, como `hexanol`, `hexanal`, `hexanona` y
  `ácido hexanoico`, y genera su estructura funcional editable.
- Fuera de los campos de texto, las flechas añaden carbono; `B` coloca benceno,
  `R` abre la paleta de anillos y `M`/`E`/`P` añaden grupos alquilo al carbono
  seleccionado (o activan su colocación si no hay selección).
  `1`–`3` cambian el orden del enlace enfocado. `Delete` elimina la selección,
  `Esc` cierra paneles o deselecciona, y `Ctrl+Z`/`Ctrl+Y` deshacen/rehacen.
  Estos atajos no dibujan mientras se escribe en un campo editable.

## Constructor por fórmula y exportación docente

- **Por fórmula molecular** acepta números normales o subíndices Unicode (por
  ejemplo, `C6H14` y `C₄H₁₀O`), valida los elementos, calcula el índice de
  deficiencia de hidrógeno (IDH) y presenta tarjetas que se cargan directamente
  en el canvas mediante SMILES local.
- Los catálogos de `C6H14` y `C4H10O` contienen, respectivamente, sus 5 y 7
  isómeros constitucionales completos. Cuando una fórmula tiene un espacio
  isomérico más amplio, la interfaz la identifica expresamente como **catálogo
  representativo** para no confundirlo con una enumeración exhaustiva.
- **Deseleccionar** retira el halo activo sin cambiar la molécula. En la ventana
  de exportación PNG, la casilla de selección actualiza una vista previa en
  tiempo real y permite decidir si ese halo aparecerá en la descarga.
- La exportación PNG permite conservar los colores elegidos para la cadena y
  los sustituyentes, convertirlos a escala de grises o generar una versión en
  blanco y negro, además de elegir resolución y fondo transparente.

La superficie Sites utiliza [vinext](https://github.com/cloudflare/vinext),
Cloudflare D1 y Drizzle, y se mantiene separada del artefacto público estático.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` declares History and Saved tables; `drizzle/` contains their migrations
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and run the full chemistry, session, rendering and release regression suite
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Accesibilidad opcional

El icono de engranaje abre **Configuración**, donde las adaptaciones de
accesibilidad se activan de manera independiente y permanecen desactivadas por
defecto. Esto permite adaptar la interfaz sin cambiar la experiencia base ni la
lógica química.

- **Lectores de pantalla avanzados** añade etiquetas, roles y anuncios corteses
  al canvas y a sus elementos editables.
- **Contraste alto AA**, **texto ampliado** y **tipografía para dislexia**
  mejoran la legibilidad visual.
- **Patrón en enlaces dobles** refuerza la distinción de los dobles enlaces con
  líneas paralelas y un patrón adicional.
- **Botones ampliados** eleva las áreas de interacción a un mínimo de 44 px;
  **modo simplificado** oculta los controles de E/Z y el nombre tradicional.
- **Destacar interactivos** aplica contornos y halos amarillos a botones,
  átomos editables y enlaces dinámicos, al estilo de las simulaciones PhET.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
