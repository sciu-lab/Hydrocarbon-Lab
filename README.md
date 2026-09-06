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
en el navegador; en Sites se sincroniza mediante su almacenamiento persistente.

## Nomenclatura y estructuras extensas

- La ficha de nombre presenta dos sistemas: **IUPAC Preferido** y
  **Tradicional**. Este último convierte de forma sistemática las familias de
  uso escolar: `hexan-1-ol` → `hexanol`, `pentan-2-ol` → `2-pentanol`,
  `propan-1,2-diol` → `1,2-propanodiol`, `butan-2-ona` → `2-butanona` y
  `pent-2-eno` → `2-penteno`. Los nombres comunes conservados se mantienen
  para las familias que no tienen una conversión tradicional sistemática.
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
- El canvas no reserva letras, flechas ni números para dibujar. Se mantienen
  los atajos globales documentados con Ctrl, además de `Delete` y `Esc`.

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

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
- `db/schema.ts` starts intentionally empty
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
- `npm test`: build, validate, and verify the rendered development-preview metadata
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
