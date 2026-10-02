# Release Hardening — RC1

Auditoría del 2 de octubre de 2026, Windows, sobre `main`. Alcance del release:
la aplicación estática de GitHub Pages. No se añadieron funcionalidades,
química, telemetría, persistencia de sesiones ni límites arbitrarios de preguntas.
Este documento distingue comprobación manual, pruebas automatizadas e inferencias.

## A. Baseline

| Dato | Resultado inicial, antes de editar |
|---|---|
| HEAD | `e2716ee736991553707831910cc249588f9b2704` — `feat: add session review dashboard` |
| Rama | `main` |
| Origin | `main...origin/main`, 0 ahead / 0 behind; `git ls-remote origin refs/heads/main` confirmó el mismo SHA |
| Árbol | Limpio; Phase 11 ya estaba comprometida y publicada en origin |
| Node / npm | `v24.19.0` / `11.17.0`; requisito del paquete `>=22.13.0` |
| Paquete | `hydrocarbon-lab`, privado, versión `0.1.0`; sin cambio de versión ni tag |
| Suite | 2141 tests: 2136 PASS, 0 FAIL, 5 SKIP; 1 875 771,5702 ms |
| Lint | PASS, 0 errores, 11 advertencias preexistentes |
| Build | PASS, artefacto Worker y manifest verificados |
| `git diff --check` | PASS |

`npm test` ejecuta primero `npm run build` y después todos los
`tests/*.test.mjs`, con concurrencia de archivos 1. El build principal usa Bash,
GNU timeout y `scripts/build-verified.sh`; lint también usa Bash.
El build de Pages usa Vite y `vite.pages.config.ts`. Se inspeccionaron los scripts,
el lockfile v3 y las versiones instaladas mediante `npm ls --depth=0`, sin errores.
No se reinstaló ni sustituyó el árbol de dependencias durante las regresiones.
Los cinco SKIP preexistentes son `ESTER-0007`, `ESTER-0012`, `ESTER-0014`,
`ESTER-0015` y `ESTER-0016`: autoridad silver, no un oráculo de nombre exacto.
Sus verificaciones estructurales se ejecutan; no se añadieron skips de release.

## B. Deployment architecture

```text
pages-src/{index.html,es/index.html,en/index.html,main.tsx}
  + app/page.tsx + módulos químicos/UI + app/globals.css + public/
→ npm run build:pages (Vite + React; base /Hydrocarbon-Lab/)
→ dist-pages/ (HTML raíz/ES/EN + JS/CSS/recursos OpenChemLib)
→ npm run validate:pages
→ .github/workflows/deploy-pages.yml: upload-pages-artifact → deploy-pages
→ https://sciu-lab.github.io/Hydrocarbon-Lab/
```

El workflow de `main`/ejecución manual instala con `npm ci` en Node 22. El gate
de artefactos añadido corre antes de subir `dist-pages`. Pages usa `createRoot`
en el cliente: no necesita Next server, SSR, RSC, Worker ni D1, y no hidrata HTML
de servidor. La entrada raíz redirige a ES/EN según la preferencia guardada o
idioma del navegador; tiene enlaces alternativos para navegación sin JavaScript.

`npm run build`/`npm run dev` corresponden a la superficie separada Vinext/Sites,
con Worker y APIs D1. La aprobación estática de RC1 no certifica un despliegue
del servidor Sites. No se cambió esa arquitectura.

## C. DEV-001

Reproducción en Windows, con dependencias existentes:

1. `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` fallaba porque
   `WRANGLER_LOG_PATH=.wrangler/wrangler.log vite` no es sintaxis válida de cmd.
2. Ejecutando directamente `node node_modules/vite/bin/vite.js --host 127.0.0.1
   --port 5173 --strictPort`, el HTML y la entrada virtual de Vinext respondían
   200, pero sus imports transitivos de React devolvían 504 de optimización
   obsoleta. El navegador mostraba `Failed to fetch dynamically imported module`
   para la entrada virtual y el editor no respondía.
3. Las URLs de `react-dom_client.js` y
   `react-server-dom-webpack_client__browser.js` esperaban `v=17b5f955`, mientras
   `_metadata.json` en la caché compartida tenía browserHash `922ea55f`.
   Pages, Vinext y los servidores Vite de las pruebas compartían `.vite`.
4. Con una caché separada dentro de `node_modules`, Vinext cargó y el botón de
   añadir carbono convirtió metano en etano. La inspección de imports transitivos
   dejó de encontrar los 504. El mismo resultado se obtuvo con la configuración
   final en puerto 5176 y `npm run dev`.

**Clasificación:** P1, configuración del proyecto/caché de desarrollo compartida,
más un fallo independiente de sintaxis del script en Windows. La entrada virtual
existía; no fue un 404 de routing ni un fallo del artefacto de producción.

**Corrección mínima:** cachés distintas en `vite.config.ts` y
`vite.pages.config.ts`; `dev` ahora ejecuta `vite`, usando la configuración
existente del log de Wrangler. Se añadieron comandos explícitos `dev:pages` y
`preview:pages`. No se actualizó Vinext ni se suprimieron excepciones.
Pages resuelve su caché desde `import.meta.url` al `node_modules` raíz, para
no depender de la exclusión local preexistente de `pages-src/node_modules`.

La caché de prebundling es propia del desarrollo, como explica la
[documentación de Vite](https://vite.dev/guide/dep-pre-bundling).
La evidencia de imports está en `rc1-dev-modules*.json` en el directorio local
de evidencia de Z. El rastreador simple también extrajo un `MyComponent` de un
comentario de React y pidió un 404 ficticio: se excluye expresamente de los
fallos reales. No es un import ejecutado por el navegador.

## D. API history/saved

Había dos causas distintas:

- **Preview estático/custom host:** `usesLocalLibrary()` solo reconocía
  `*.github.io` y `file:`. En localhost el artefacto solicitaba `/api/history`
  y `/api/saved`, inexistentes, y mostraba un error de JSON. Los HTML ES/EN ahora
  identifican el despliegue con `data-lab-deployment="static"`; la función usa
  esa señal además del comportamiento anterior. No se creó un backend nuevo.
- **Vinext local:** los 500 provenían de una D1 local sin tablas. Se inspeccionó
  la base local y se aplicaron las dos migraciones SQL existentes, solo con
  `--local`. Después, ambas APIs respondieron 200 JSON con identidad anónima
  válida; sin esa cabecera el 400 es la validación esperada. El procedimiento
  para una base vacía está en README. No se modificó una D1 remota.

El artefacto RC1 guardó propano, mostró Save/History y restauró molécula y
guardado tras recargar en el mismo origen. El registro del proxy de la sesión
estática no contiene solicitudes `/api/*`. El GitHub Pages existente ya usaba
la biblioteca local por hostname; la corrección amplía esto al resto de los
hosts estáticos. No se esconden respuestas 500.

## E. Production artifact

Se compiló `dist-pages` y se sirvió con Vite preview, con prueba adicional vía
proxy HTTP local. Se probaron directamente raíz, `/es/`, `/en/`, recarga y cambio
de idioma. No hubo pantalla blanca ni errores React/hidratación en los logs
capturados. Consola final de la sesión representativa: 0 warnings/errors.

El gate encuentra 3 entradas y 3 assets referenciados, incluyendo el JSON de
recursos de OpenChemLib. Verifica archivos, base de repositorio, rutas locales,
CSS URLs, referencias a assets compilados y señal de persistencia estática.
JS/CSS/JSON respondieron 200 con MIME apropiado. El logo se mostró correctamente;
no se detectó un Worker requerido por esta entrada cliente.

El audit HTTP registró 16 comprobaciones satisfactorias entre local y Pages.
Tras el ajuste final de caché se recompiló otra vez y se comprobó el nuevo
bundle en el navegador: marker estático, ES/EN, reset/añadir carbono hasta etano
e inicio de Practice de 1 pregunta `RC1-FINAL`, con consola sin warn/error.
El proxy de la sesión registró 37 solicitudes y ninguna API de servidor.
Existe un 404 no esencial de `/favicon.ico` solicitado automáticamente por el
navegador: no hay enlace HTML al `favicon.svg` existente. Se conserva como P2;
no se presenta la red como completamente libre de 404. No falló ningún recurso
necesario para dibujar, evaluar o revisar.

El proxy cubre el origen local; no es un HAR de todos los terceros. Los logs de
consola tampoco prueban ausencia de todo tráfico externo. En Vite preview,
`/es` y `/en` sin slash pueden servir el fallback raíz; se usaron las entradas
canónicas con slash. Pages sí redirigió ambas rutas sin slash a las canónicas.

## F. GitHub Pages

Verificación real de
[raíz](https://sciu-lab.github.io/Hydrocarbon-Lab/),
[ES](https://sciu-lab.github.io/Hydrocarbon-Lab/es/) y
[EN](https://sciu-lab.github.io/Hydrocarbon-Lab/en/): HTTP 200, navegación directa,
assets disponibles y aplicación interactiva. Se hicieron sesiones reales de
Exam, Dashboard/Reviewer y variantes de clase en el navegador de Pages.

La aplicación publicada se verificó **sin publicar los cambios RC1**. Su JS
era `main-1U2b4fxa.js` (1 956 241 bytes); el artefacto de la matriz RC1 local usó
`main-BiUvA2iY.js` (1 956 300 bytes). La compilación final, después del informe
y ajuste de ruta de caché, generó `main-Brjq4FLC.js` y `main-C1zEyuk6.css`;
los recursos OpenChemLib siguen siendo `resources-D5ymtJwZ.json`.
Esto confirma ambas superficies funcionando; no demuestra que el patch RC1
esté ya desplegado ni atribuye un SHA al despliegue sin evidencia del workflow.

## G. Main Lab smoke

Comprobación manual: cadena C1→C2→C3, añadir/quitar carbono, selección y flechas,
undo/redo, Delete y reset. Enlace seleccionado + teclas 1/3/2 produjo
`CC`, `C#C`, `C=C`. R abrió anillos, Esc cerró/deseleccionó, M/E/P insertaron
grupos según la selección y B activó la colocación de benceno. Escribir esas
teclas en el campo SMILES no cambió la molécula.

Los 17 ejemplos siguientes se contrastaron con el corpus/tests existentes y
se cargaron en la UI; no se cambiaron expectativas químicas congeladas.

| Familia | SMILES | Nombre observado ES |
|---|---|---|
| Alcano | `CC` | etano |
| Alqueno | `C=CC` | propeno |
| Alquino | `C#CC` | propino |
| Halogenado | `CCCl` | cloroetano |
| Alcohol | `CCO` | etanol |
| Aldehído | `CC=O` | etanal |
| Cetona | `CC(=O)C` | propan-2-ona |
| Ácido | `CC(=O)O` | ácido etanoico |
| Éter | `COC` | metoximetano |
| Éster | `CC(=O)OC` | etanoato de metilo |
| Amina | `CN` | metanamina |
| Amida | `CC(N)=O` | etanamida |
| Carbociclo | `C1CCCCC1` | ciclohexano |
| Aromático | `c1ccccc1` | benceno |
| E/Z | `C/C=C/C` | `(2E)-but-2-eno` con estereoquímica activada |
| Nitrilo | `CC#N` | etanonitrilo |
| Nitro/cargas soportadas | `C[N+](=O)[O-]` | nitrometano |

También `C/C=C\C` mostró `(2Z)-but-2-eno`. Sin la opción de estereoquímica se
presenta el nombre sin descriptor, conforme al comportamiento existente.
Las referencias usadas incluyen `tests/reference-corpus/`, pruebas de perfiles
funcionales, razonamiento de halógenos y estereoquímica del doble enlace.
La regresión completa comprueba los nombres EN y casos extensos; la muestra
manual no pretende ser una validación universal de nomenclatura.

Exportaciones reales de propano: `.smi` con `CCC` y newline, PNG 35 253 bytes,
SVG 17 100 bytes y `.quimica` 857 bytes. La importación del `.quimica` descargado
restauró propano. Importar SMILES inválido `C1`/`not-a-smiles` produjo alerta
localizada, conservó la molécula y dejó la UI operativa.

## H. Practice smoke

`RC1-PRACTICE`: 15 preguntas, alcanos/alcoholes, Naming/MCQ/Build, 5 de cada tipo.
La UI mostró categorías, feedback inmediato y referencias después de responder.
Se enviaron respuestas mayormente incorrectas: 1/15 inicial, 14 por corregir,
15 intentos. Una corrección Naming con `butan-1-ol` fue aceptada; al terminar
el repaso se conservó 1/15 inicial, dominio 2/15, 1 corregida, 13 pendientes y
16 intentos. Cambiar ES/EN conservó semilla, intentos y resultados.

Build independiente de 1 pregunta, `RC1-BUILD-1`: objetivo 2-metilpropano.
Una cadena de butano fue incorrecta; en el segundo intento se dibujó `CC(C)C`
con las flechas y selección del carbono central. Feedback correcto y Reviewer
con padre de 3 carbonos/ramificación C2. Puntuación inicial 0/1, dominio final
1/1, 2 intentos. No hubo modificación retrospectiva del primer resultado.

Configuraciones de 1 y 37 preguntas y recuentos generales se comprobaron junto
con las pruebas existentes. La protección de duplicados y búsqueda de candidatos
se verifica en los sweeps, además de las sesiones manuales finitas.

**PRACTICE-008:** se ejecutó la cobertura existente en la suite, incluida la
aceptación de la referencia exacta ES/EN, variantes de formato y rechazo de
variantes incorrectas: el barrido cubre 204 referencias. Cero falsos negativos
en los sweeps completados. No se relajó el evaluador ni se reemplazó el corpus.

## I. Exam smoke

`RC1-EXAM`: 15 preguntas, alcanos/alcoholes y los tres tipos. Antes del envío se
inspeccionaron las 15 pantallas: sin categoría, corrección, referencia, puntuación,
Reviewer o Dashboard; Build no reveló su estructura objetivo. Se probaron
Next/Previous y restauración del borrador Naming, idioma y estado de respuestas.

La salida en progreso mostró confirmación; Cancelar conservó el borrador. La
revisión previa fue neutral (15/15 respondidas, tipos y estado únicamente).
La confirmación bloqueó la navegación y el envío produjo resultados una vez:
1/15, 6,7 %, 15 intentos; desgloses por categoría y tipo coherentes.
Dashboard y Reviewer estuvieron disponibles después. No hubo correcciones ni
dominio en Exam. El cambio de idioma posterior no alteró la puntuación.

Exam de 1 pregunta `RC1-THEME`, tema claro, corroboró los mismos estados de
confirmación/resultados/Dashboard. El tiempo alto de esa pregunta incluye la
pausa de trabajo y no es tiempo de generación.

## J. Class Seed / CSV smoke

Configuración exacta: `RC1-CLASS`, Exam, 15 preguntas, Naming/MCQ/Build,
alcanos/alcoholes, 36 participantes. IDs 001–036. Al pasar a 37, las primeras
36 semillas permanecieron idénticas; al cambiar ES→EN, las 37 semillas también.
A01/A02/A03 funcionaron; A01/A01 produjo un error localizado y deshabilitó la
exportación/uso del resultado inválido. Usar la semilla 001 copió su valor
exacto a la configuración normal.

Se descargaron **ambos archivos reales**, con nombre base
`hydrocarbon-lab-class-assignments.csv` (el navegador añadió `(1)` por colisión):

| Archivo de evidencia | Bytes | Filas | IDs | Mismatches / colisiones |
|---|---:|---:|---|---|
| `rc1-class-downloaded-36.csv` | 17 219 | 36 | `text:001`–`text:036` | 0 / 0 |
| `rc1-class-downloaded.csv` | 17 692 | 37 | `text:001`–`text:037` | 0 / 0 |

Parser independiente de tests: UTF-8 BOM `EF BB BF`, 12 columnas de esquema,
seeds exactamente iguales a la UI y reconstrucción válida de modo, cantidad,
categorías, tipos e idioma para todas las filas. No hay respuestas, targets,
opciones correctas, puntuaciones ni intentos en el manifest. La protección
`text:` y las pruebas de comillas, Unicode, saltos de línea y formula-injection
existentes pasaron. No se afirma una importación manual en Excel/LibreOffice:
se verificó el archivo mediante parser, sin sesión de spreadsheet conectada.

## K. Dashboard smoke

Practice: accuracy inicial 1/15 permaneció igual después de la corrección;
dominio, corregidas/pendientes y 16 intentos reconciliaron. Reviewer abrió la
pregunta y el intento elegidos; cambiar idioma no volvió a evaluarlos.

Exam: el filtro Incorrectas mostró 14 preguntas sin cambiar 1/15; no hubo
acciones de correction/mastery. El Build de pregunta 3 abrió el target original
3-metiloctano y el intento `CC`, con numeración/reasoning del target correcto.

Los casos con `generationIndex` saltado están cubiertos por las pruebas de
reconstrucción de Practice, Corrections, Reviewer, Dashboard, Exam y sesiones
derivadas de Class CSV. El ordinal visible no se usa como índice químico.
Esto se valida por los fixtures/sweeps de identidades originales, no mediante
una nueva generación arbitraria al abrir el Reviewer.

## L. Mobile

Prueba manual con Brave: desktop 1280 px, viewports 390×844 y 320×740. Se verificó
la dimensión del DOM: 1265, 375 y 305 px útiles cuando había scrollbar vertical.
Practice, Exam, Build, Reviewer, Dashboard y variantes de clase tuvieron controles
alcanzables, scroll y confirmaciones operativas. Main canvas, selección y flechas
respondieron a una acción por click; no se observaron adiciones duplicadas.

Main a 320 tiene aproximadamente 17 px de overflow del dock inferior y espacio
lateral/vertical mejorable. No bloqueó acciones ni lectura; P2, sin rediseño.
El resto de los flujos probados quedó dentro del ancho útil.

Ambos temas se comprobaron en Main, Practice/feedback, Reviewer/highlights,
Exam/Dashboard y Class. No se observaron texto, enlaces químicos o estados
seleccionados invisibles. Las capturas `*-real-320*` y las últimas de Class/Exam
`*-real-390*` documentan los tamaños verificados.

Limitación: es interacción con pointer a ancho móvil en navegador de escritorio,
no hardware táctil. No se certifican gestos físicos multitouch ni screen readers
de un teléfono. Algunas capturas preliminares `rc1-pages-*` estaban a 500 px
por limitación del viewport IAB y **no cuentan** como prueba 390/320. Se
sustituyeron por capturas Brave con dimensiones medidas.

## M. Accessibility

Auditoría práctica: roles/nombres de botones, labels de formularios/radios,
encabezados, diálogo de envío y foco inicial en Cancelar, mensajes de estado,
feedback textual además del color y highlights numerados del Reviewer.
La opción existente de lector de pantalla expuso carbonos como botones
enfocables; Enter seleccionó y ArrowUp añadió carbono. Atajos no actuaron al
escribir en inputs. No se añadieron librerías para esta fase.

Las pruebas existentes de UI/presentación/accesibilidad se ejecutaron en la
regresión. No se encontró axe instalado; no se afirma certificación WCAG,
auditoría completa de contraste ni prueba con un screen reader físico.
No se detectó un bloqueo de alto impacto en la muestra práctica.

## N. Locale

ES↔EN en editor, Practice/feedback/correction, Exam/borradores, Reviewer,
Dashboard y Class. Se conservaron química, semilla, borradores durante la
sesión, resultados e identidades de participantes donde corresponde. No se
añadieron claves i18n ni cambios a los diccionarios. La regresión existente
comprueba integridad y duplicados de las claves.

Refresh conserva biblioteca/Save/History/tema/idioma por **origen y navegador**;
Practice/Exam/intentos/Dashboard terminan al recargar, según el diseño actual.
No se añadieron sesiones persistentes. Back/forward entre entradas visitadas
no envió un examen. En la prueba también se volvió del proxy `:4180` a `:4173`:
son orígenes distintos, cada uno con biblioteca propia; volver a `:4180`
restauró su propano. No se confunde esa separación con pérdida de datos.

## O. Security/privacy

No se añadieron analytics, logging remoto, cuentas ni envío de resultados.
Por instrucción explícita del usuario se conserva Google Analytics existente
`G-FZ76EQBG32`, presente tanto en Pages como en el layout del servidor, y se
documenta en README. No es correcto afirmar ausencia de telemetría existente.

OPSIN, PubChem, Wikidata y Wikipedia son consultas opcionales para importación
o contexto; los ejercicios/evaluadores operan localmente. No se promete offline
completo. Class usa IDs anónimos y su CSV no contiene resultados/targets. La
plantilla de bugs no pide nombres ni datos personales de estudiantes.

Exam oculta respuestas antes de enviar en la UI; no es anti-cheat ni una
frontera de seguridad contra inspección del cliente. Seeds no son secretos;
no hay verificación de identidad ni resultados inviolables. La documentación
declara estas limitaciones. El escaneo local de archivos tracked no encontró
claves privadas, tokens obvios ni credenciales accidentales; no se enviaron
archivos del repositorio a un scanner externo.

## P. Dependency audit

`npm audit --json` dio exit 1: 24 paquetes con findings, 1 low, 6 moderate,
16 high y 1 critical. Snapshot completo: `rc1-npm-audit.json` (709 dependencias
en el inventario). No se usó `npm audit fix --force` ni se cambiaron versiones.

| Superficie | Hallazgos relevantes | Evaluación para este release |
|---|---|---|
| Next 16.2.6 | Critical y advisories de servidor, incluido Windows RCE | No se despliega servidor Next/SERVER actions/image/OG en Pages |
| react-server-dom-webpack 19.2.6 | High, DoS de Server Functions | No hay endpoint RSC/Server Functions en el artefacto estático |
| Vite/Vinext/Cloudflare/Wrangler/miniflare/undici/ws | High, dev/servidor/build | Herramientas locales, no se despliegan como servidor en GitHub Pages; dev probado con bind loopback |
| PostCSS/esbuild/Babel/Drizzle tooling/browserslist y transitivos | Low–high según paquete | Transformación de source confiable/build, no procesamiento remoto en Pages |
| fflate y herramientas de imágenes | Findings transitivos | Sin importación ZIP de usuario ni servidor de imágenes en esta entrada cliente |

Inventario completo por severidad de npm (distinta de la prioridad de release):

- Critical: `next`.
- High: `@cloudflare/vite-plugin`, `brace-expansion`, `browserslist`, `fast-uri`,
  `image-size`, `js-yaml`, `miniflare`, `nanoid`, `postcss`,
  `react-server-dom-webpack`, `sharp`, `undici`, `vinext`, `vite`, `wrangler`, `ws`.
- Moderate: `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`,
  `baseline-browser-mapping`, `drizzle-kit`, `esbuild`, `fflate`.
- Low: `@babel/core`.

Se inspeccionaron también los manifests instalados: `fflate` procede de
`@shuding/opentype.js`, `fast-uri` de AJV, `brace-expansion` de minimatch y
`nanoid` de PostCSS/Vite/Next. No hay parser YAML/ZIP, expansor de shell ni
proxy SSRF expuesto al usuario en la aplicación cliente de Pages. Las entradas
hostiles de los advisories requieren las superficies descritas, que no se
publican como servicio en ese artefacto.

La clasificación procede de los avisos y de la entrada/artefacto inspeccionados;
es una evaluación de exposición, **no** un audit limpio ni una declaración de
que todas las dependencias de producción sean inocuas. Fuentes primarias:
[Next Windows RCE](https://github.com/advisories/GHSA-p293-qw3h-jr36) y
[RSC DoS](https://github.com/advisories/GHSA-wx67-qw84-cm4g).
La superficie Sites necesitaría un audit/actualización independiente antes de
una publicación de servidor. No queda aprobada por la recomendación de Pages.

## Q. Build warnings

| Warning | Clasificación | Razón / efecto |
|---|---|---|
| Pages JS mayor de 500 kB | NON-BLOCKER / P2 | Main 1,956 MB, gzip ~603 kB; carga inicial pesada pero app operativa |
| Import dinámico de openchemlib-adapter también importado estáticamente | NON-BLOCKER | Vite no divide ese módulo; no se pierde una función ni falla una URL |
| Vinext SSR importa node:async_hooks/fs/path sin flags de compatibilidad en artefacto | TOOLING / servidor separado | Advertencia del adaptador Cloudflare; Worker/manifest validados, no aplica a Pages |
| Clasificación desconocida `? /` del build Vinext | TOOLING | Limitación declarada de su análisis estático; `/:lang` es dinámica y las APIs pertenecen al Worker; no define el output multipágina de Pages |
| Babel codegen del page.tsx >500 kB en lint | TOOLING | Nota sobre formato de código, no error de ejecución |
| Pages PLUGIN_TIMINGS: css 41 %, build-html 24 %, asset-import-meta-url 16 % en una compilación | TOOLING | Perfil del bundler bajo carga; build terminó en 5,38 s, no error del runtime |

Lint conserva 11 warnings: variables no usadas en coordinate-flip/page/scripts/
skeletal-bond-geometry, dependencias de hooks en page.tsx, GA inline y un `img`.
Inventario del lint final (0 errores):

| Archivo / línea | Warning |
|---|---|
| `app/coordinate-flip.ts:23` | `_isMirrored` sin usar |
| `app/layout.tsx:39` | Script GA inline, recomendación Next third-parties |
| `app/page.tsx:1957` | `_enabledAliases` sin usar |
| `app/page.tsx:6746` | useMemo: dependencia innecesaria `externalCandidateNameUnavailable` |
| `app/page.tsx:6843` | useMemo: falta `localizedIupac` |
| `app/page.tsx:7692` | `normalizedInput` sin usar |
| `app/page.tsx:9542` | useEffect: faltan `hasActiveSelection` y `selectedAtom` |
| `app/page.tsx:12033` | `img` en lugar de optimización Next Image |
| `scripts/external-molecule-audit.mjs:161` | `carbons` sin usar |
| `scripts/nomenclature-arbitration.mjs:191` | `frozenFailures` sin usar |
| `tests/skeletal-bond-geometry.test.mjs:14` | `SKELETAL_BOND_END_CLEARANCE` sin usar |

No se desactivaron reglas ni se añadieron suppressions. No se persiguió silencio
de herramientas alterando química o arquitectura. Las advertencias de timings
de herramientas no se tratan como prueba de un error de generación.

## R. Performance smoke

Mediciones aproximadas en este equipo; no son benchmarks de hardware móvil ni
un SLA. Se distingue motor real de latencia del adaptador de control del browser.

| Operación | Observación |
|---|---|
| Carga local / entrada a configuración | UI disponible en pocos segundos (~2–4 s con control del navegador); no se aisló FCP/LCP |
| Exam mixto 15, RC1-EXAM | Motor 8 791,5972 ms; UI llegó a pregunta 1, sin loop infinito |
| Perfil de ese Exam | MCQ indices 1/3 consumieron ~3,109 / 4,036 s; validación química de distractores domina |
| Class 36 | ~650 ms incluyendo interacción/lectura UI; derivación de metadata en pruebas muy inferior a 1 s |
| Dashboard | Cálculo puro para 15/37/100: ~3,43 / 6,12 / 22,3 ms en la regresión anterior |
| Reviewer | Reconstrucción de muestra ~2,4 ms sin carga; abrirlo en UI fue inmediato a escala de las acciones |
| Plan Naming 1 / 15 / 37 / 100 | ~37,8 / 481,2 / 913,4 / 2196,5 ms |
| Pedido enorme 100000 Naming | Fallo seguro `insufficient-unique-questions`, ~6009,9 ms, 262 candidatos; sin examen parcial |

El coste MCQ es P1 pendiente, justificado como no bloqueante en esta muestra:
termina, conserva el contrato y la corrección, y no produjo sesión corrupta.
Se perfiló antes de decidir no cambiar las recetas/RNG/generación en RC1. No se
afirma un límite absoluto de tiempo para todo seed/configuración arbitrarios;
los límites de búsqueda existentes y sweeps dan seguridad de terminación, no
una garantía universal de baja latencia. No se añadió máximo 30 ni un timer.

Errores deliberados: 0 y 1,5 preguntas bloquearon inicio con error localizado;
seed opcional vacío generó una seed válida, conforme al diseño; Class Seed
vacía/IDs duplicados fallaron sin resultado usable; Build incorrecto fue
rechazado y pudo corregirse. El caso enorme no dejó un spinner permanente.

## S. Git/repository hygiene

323 archivos tracked en el baseline; sin node_modules, .env, credenciales,
Downloads, screenshots ni cachés de pruebas tracked. `dist`, `dist-pages`,
`.wrangler`, node_modules y outputs están ignorados. Se hicieron builds de
Pages repetidos y builds principales repetidos sin churn de archivos tracked.
El árbol inicial era limpio; después solo contiene los cambios RC1 enumerados
en Z. No se eliminó contenido legítimo ni se usó reset/clean destructivo.

El escaneo de secretos fue simple y local, no una garantía exhaustiva. Los
warnings LF→CRLF de Git reflejan autocrlf, no errores de `diff --check`.
No hubo fresh `npm ci`: el estado instalado era compatible y se preservó.

## T. Public documentation

README ahora explica Practice/Exam/Naming/MCQ/Build, corrections/mastery,
Reviewer/Dashboard/Class CSV, alcance de 17 categorías, límites de seguridad,
persistencia y refresh, GA existente, terceros opcionales y comandos estáticos.
Se corrigieron las instrucciones D1 local, la descripción de la suite y los
nombres del selector IUPAC sugerido / IUPAC 1979 Legacy conforme a la UI real.
La plantilla mínima de GitHub Issues pide URL/commit conocido, dispositivo,
browser, idioma, modo, categoría cuando corresponda, tipo, seed, ordinal,
ID anónimo y reproducción/screenshot.

Se mantiene versión `0.1.0`: no se inventó historial de releases ni tag 1.0.
README remite a este informe y SHA baseline para reproducibilidad. No se
añadió una etiqueta de versión visual. No hay LICENSE tracked: se documenta
la necesidad de una decisión del propietario antes de afirmar una licencia
de código abierto; no se inventan derechos de reutilización.

## U. Findings

| ID | Severity | Area | Description | Status |
|---|---|---|---|---|
| DEV-001 | P1 | Dev | Caché Vite compartida invalidaba imports de Vinext; script dev no portable en Windows | FIXED: caches separadas, script portable, editor probado |
| STORE-001 | P1 | Static | Preview/custom host llamaba APIs inexistentes para Save/History | FIXED: marker estático y persistencia local; prueba regresión + UI |
| DB-001 | P1 | Sites local | D1 vacía producía 500 history/saved | RESOLVED LOCAL: migraciones existentes, 200 JSON; procedimiento documentado |
| PERF-001 | P1 | MCQ | Inicio mixto 15 ~8,8 s en perfil medido | OPEN, no bloqueante justificado en R; optimización posterior |
| TEST-001 | P1 | Validation | Primer final: proceso Node hijo sin exit normal en test con budget 60 s | RESOLVED VALIDATION: PASS aislado y dentro de suite completa, 0 FAIL; sin modificar test |
| DEPS-001 | P2 | Static release | Audit no limpio, principalmente tooling/servidor separado | OPEN para Pages; servidor Sites requiere gate propio |
| MOBILE-001 | P2 | Mobile | Dock Main ~17 px overflow a 320 / whitespace | OPEN, controles utilizables |
| ICON-001 | P2 | Asset | Favicon.ico automático 404, no esencial | OPEN, no se modificó automáticamente |
| DOC-001 | P2 | License | Sin archivo LICENSE | OPEN, README honesto; decisión del propietario pendiente |
| TOOL-001 | P2 | Sites scripts | `start` mantiene sintaxis de shell Unix | OPEN, usar Bash; no afecta Pages |
| ROUTE-001 | P2 | Preview | Vite preview sin slash usa fallback raíz | OPEN local; URLs canónicas funcionan y Pages redirige |

P0 conocidos: 0. No se encontró mismatch con referencia confiable, falso negativo
conocido, fuga de Exam en UI ni corrupción del artefacto estático. El gate de
tests completos terminó con 0 FAIL.

## V. Known Issues

No bloqueantes sin resolver: coste MCQ detallado en R, tamaño del bundle,
overflow menor del dock Main a 320, favicon automático, falta de licencia,
script start de Sites con Bash, y fallback sin slash del preview local.
Audit de dependencias conserva findings: su exposición Pages y alcance excluido
Sites se explican en P. No se recomienda el Worker como si estuviera certificado
por este release. Las limitaciones de hardware táctil/Excel/axe son límites de
la verificación, no fallos de la aplicación observados.

## W. Tests added

Solo dos tests en `tests/release-deployment.test.mjs`:

1. Ejecuta la función real de selección de almacenamiento con marker estático
   en localhost/custom host, comportamiento legacy y servidor sin marker;
   comprueba marker en ambos HTML.
2. Gate de artefacto con fixtures: rechaza asset ausente, base de repo incorrecta
   y marker ausente; acepta output válido.

Ambos pasaron. No se cambiaron tests existentes, skip counts, tiempos límite,
expectativas químicas, generatorVersion ni seeds. El validator nuevo también
se ejecuta sobre el artefacto real en el workflow, no solo sobre fixtures.

## X. Final validation

Primera regresión posterior a cambios: 2143 tests, 2137 PASS, 1 FAIL, 5 SKIP,
2 158 370,4712 ms. Falló `15-question frozen plan is deterministic in a fresh
Node process and across locales`: el hijo terminó con `status=null`, stderr
vacío; no se alcanzó una comparación de moléculas fallida. Posible agotamiento
de su timeout bajo carga, **inferencia**, pues no se capturó `error.code/signal`.
Aislado, sin cambios, PASS en 9950,662 ms (proceso total 10617,1695 ms).
Se detuvieron los servidores de dev y se inició una repetición completa.
La misma prueba ya pasó en esa repetición en 41 067,062 ms, sin cambios.
No se acepta un test aislado como reemplazo del gate completo.
La **repetición completa final terminó con exit 0**: 2143 tests, 2138 PASS,
0 FAIL, 5 SKIP, 0 cancelled, 0 todo; 1 628 703,7669 ms (27 min 8,7 s).
La única edición posterior a iniciar esa repetición que afecta configuración
fue resolver la caché de Pages al node_modules raíz; su build/gate y smoke
del bundle recompilado también pasaron. No cambió el motor ni el evaluador.

| Check | Result |
|---|---|
| Full suite | PASS — 2143 total / 2138 PASS / 0 FAIL / 5 SKIP |
| Build | PASS baseline, ambas regresiones finales y standalone final, exit 0; Worker/manifest validados |
| Lint | PASS, 0 errores / 11 warnings existentes |
| git diff --check | PASS, exit 0 |
| Production artifact | PASS, build:pages + validate:pages + UI real |
| GitHub Pages | PASS versión actualmente publicada; patch RC1 no publicado |
| Console | PASS, 0 warn/error en logs de sesiones finales capturados |
| Network | PASS recursos esenciales; favicon P2; scope proxy local/HTTP explícito |
| Main Lab | PASS muestra 17 categorías + edición/atajos/export |
| Practice Naming | PASS manual y cobertura existente |
| Practice MCQ | PASS; coste de generación documentado |
| Practice Build | PASS incorrecto→correcto, 2-metilpropano |
| Corrections | PASS, score inicial inmutable |
| Reviewer | PASS, pregunta/intento original y highlights |
| PRACTICE-008 | PASS, 204 referencias ES/EN, 0 false negatives |
| Exam | PASS 15 preguntas, navegación, confirmación/resultados |
| Exam privacy | PASS 15 pantallas antes de Submit + cobertura existente |
| Class Seed | PASS 36→37, locale/custom/duplicate |
| CSV | PASS archivos reales 36/37, parser; no prueba Excel manual |
| Dashboard | PASS Practice/Exam, métricas/intentos/reconstrucción |
| ES | PASS |
| EN | PASS |
| Desktop | PASS |
| 390 px | PASS viewport medido; ambos temas en flujos representativos |
| 320 px | PASS usable; dock Main P2 |
| Accessibility | PASS práctico y coverage existente; sin certificación WCAG |
| Repository hygiene | PASS — solo 8 modificados + 4 nuevos deliberados |
| P0 blockers | 0 conocidos |

Checklist manual:

- [x] MAIN LAB: draw, naming, shortcuts, undo/redo, import/export.
- [x] PRACTICE: Naming, MCQ, Build, feedback, corrections, Reviewer, Dashboard.
- [x] EXAM: drafts, navigation, privacy, submit, results, Dashboard, Reviewer.
- [x] CLASS: variants, stable seeds, CSV.
- [x] PLATFORM: ES, EN, desktop, 390, 320, production artifact, deployed Pages.

## Y. Release recommendation

La beta pública de la **aplicación estática de GitHub Pages** cumple este gate:
0 P0 conocidos, 0 falsos negativos conocidos del evaluador, 0 FAIL en la suite
completa final, build y lint PASS, artefacto local y Pages operativo, y smokes
Practice/Exam/Build/Class CSV/Dashboard satisfactorios. Los P1 funcionales se
corrigieron; el coste MCQ pendiente está explícitamente justificado como no
bloqueante en R. Los P2 quedan documentados, sin correcciones automáticas.

La recomendación es preparar la publicación de estos cambios RC1 para esa
beta estática. No certifica el servidor Sites, no demuestra ausencia universal
de bugs ni sustituye las limitaciones prácticas de esta auditoría. Los cambios
siguen sin commit/push; RC1 aún no está publicado en Pages.

## Z. Final state

**No commit. No push.** HEAD y la rama no cambian.

Modificados:

- `.github/workflows/deploy-pages.yml`
- `README.md`
- `app/page.tsx`
- `package.json`
- `pages-src/en/index.html`
- `pages-src/es/index.html`
- `vite.config.ts`
- `vite.pages.config.ts`

Nuevos:

- `.github/ISSUE_TEMPLATE/bug_report.md`
- `scripts/validate-pages.mjs`
- `tests/release-deployment.test.mjs`
- `docs/release-hardening-rc1.md`

Generados ignorados: `dist/`, `dist-pages/`, cachés Vite separadas y estado D1
local migrado bajo `.wrangler/`. No se añadieron esos outputs a Git.

Evidencia local fuera del repositorio:
`C:/Users/Amy/.codex/visualizations/2026/10/02/01a0fd7f-4a4c-79a2-8ca0-b0e405438300/`.
Incluye perfiles/scripts de diagnóstico, JSON de módulos/HTTP/audit/CSV,
registro proxy, screenshots de tamaños reales, archivos exportados reales y
`rc1-final-regression-retry.log`, `rc1-final-lint.log` y `rc1-final-build.log`.
No se imprime información personal ni secretos.
Las capturas preliminares IAB a 500 px no sostienen la matriz móvil.

Inventario principal de evidencia:

- Desarrollo: `rc1-dev-module-audit.mjs`, `rc1-isolated-dev.mjs`,
  `rc1-dev-modules.json`, `rc1-dev-modules-5175.json`, `rc1-dev-modules-5176.json`.
- Red: `rc1-preview-proxy.mjs`, `rc1-preview-network.jsonl`,
  `rc1-http-audit.mjs`, `rc1-http-audit.json`.
- Performance: `rc1-count-performance.mjs`, `rc1-mixed-performance.mjs`,
  `rc1-mixed-performance.json`, `rc1-build-seed.mjs`.
- CSV: `rc1-class-visible-37.json`, `rc1-class-downloaded-36.csv`,
  `rc1-class-downloaded.csv`, `rc1-csv-audit-36.mjs`, `rc1-csv-audit-36.json`,
  `rc1-csv-audit.mjs`, `rc1-csv-audit.json`.
- Dependencias: `rc1-npm-audit.json`; el intento `npm explain` sobre la instalación
  pnpm no produjo JSON utilizable y no sustenta la clasificación. Se leyeron
  los manifests instalados directamente para comprobar esos enlaces.
- Exportaciones: `rc1-propane-downloaded.smi`, `rc1-propane-downloaded.quimica`,
  `rc1-propane-downloaded.png`, `rc1-propane-downloaded.svg`.
- Capturas Main: `rc1-main-desktop-dark.jpg`, `rc1-main-ez-desktop-light.jpg`,
  `rc1-lab-real-320.jpg`.
- Capturas Practice/Reviewer: `rc1-practice-review-real-320.jpg`,
  `rc1-practice-build-real-320.jpg`, `rc1-practice-corrections-real-320.jpg`,
  `rc1-review-real-390.jpg`, `rc1-practice-reviewer-real-320-dark.jpg`.
- Capturas Exam: `rc1-exam-final-real-320-dark.jpg`,
  `rc1-exam-review-final-real-320-dark.jpg`, `rc1-exam-results-real-390-dark.jpg`,
  `rc1-exam-reviewer-real-390-dark.jpg`, `rc1-exam-reviewer-real-320-dark.jpg`,
  `rc1-exam-real-390-light.jpg`, `rc1-exam-results-real-390-light.jpg`.
- Capturas Class: `rc1-class-desktop-dark.jpg`, `rc1-class-real-390-dark.jpg`,
  `rc1-class-real-320-dark.jpg`, `rc1-class-real-390-light.jpg`.
- Comprobación del bundle final: `rc1-final-artifact-practice-desktop.jpg`.
- Logs finales: `rc1-final-regression-retry.log`, `rc1-final-lint.log`,
  `rc1-final-build.log`.

Working tree: dirty por los 8 modificados y 4 nuevos RC1 deliberados; sin commit
ni push. HEAD sigue siendo `e2716ee736991553707831910cc249588f9b2704`,
`HEAD...origin/main` = 0/0. `git diff --ignore-cr-at-eol --stat` registra los
8 tracked modificados: 107 inserciones / 18 eliminaciones; los 4 nuevos se
enumeran aparte porque ese comando no cuenta archivos untracked. Validación
final completa terminada con 0 FAIL. No se dejaron servidores de prueba activos.

RELEASE HARDENING COMPLETE — READY FOR PUBLIC BETA
