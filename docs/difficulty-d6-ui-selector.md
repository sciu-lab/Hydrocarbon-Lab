# Difficulty D6 — selector público

## A. Baseline

- HEAD: `b1846f6fd5b4ad504133f29f4b43a87277a957b2`; `main` limpia y sincronizada con `origin/main` antes de editar.
- Pages del mismo HEAD: successful, [run 37263066717](https://github.com/sciu-lab/Hydrocarbon-Lab/actions/runs/37263066717).
- Current generator: 4; supported: 1, 2, 3, 4.
- Baseline de release D5-CI-001: critical 157 PASS / 0 FAIL; full 2436 PASS / 0 FAIL / 5 skips históricos. No se repitió una suite completa de baseline.
- Baseline UI ejecutado antes de editar: Practice/Exam 51 PASS / 0 FAIL. TypeScript: 32 diagnósticos históricos.
- Se leyeron completos D0, D3, D4, D4.2A, D4.2B y D5. D5 certifica Hard v4 para las 17 categorías.

## B. Arquitectura UI

`app/page.tsx` abre `PracticePanel` y proporciona locale/generador/renderers. `PracticePanel` comparte configuración de Practice y Exam; al iniciar Exam entrega el estado a `ExamPanel`. Los builders `createPracticeConfig` y `createExamConfig` ya aceptaban el tipo canónico `ExerciseDifficulty`. Solo faltaba elegirlo en UI y pasarlo al builder.

## C. Mapping

| ID interno | EN | ES |
|---|---|---|
| basic | Easy | Fácil |
| intermediate | Intermediate | Intermedio |
| advanced | Hard | Difícil |

La enumeración proviene de `EXERCISE_DIFFICULTIES`; labels/descripciones son presentación mediante `uiText`, nunca identidad de seed.

## D. Default

Ambos modos montan `basic`. Start sin tocar Difficulty sigue produciendo `basic`, generator 4. Volver a configurar conserva Difficulty como categorías, tipos, cantidad y seed. Volver al laboratorio desmonta el panel: la próxima apertura vuelve a defaults, conforme al comportamiento existente.

## E. Selector

`DifficultySelector` compartido, después de tipos de pregunta y antes de cantidad/seed. Tres radios nativos dentro de `fieldset`/`legend`, nombres únicos con `useId`, descripción de la selección mediante `aria-describedby`. Radio marcado, borde, fondo y peso de texto hacen perceptible la selección. No requiere modal, unlock ni paso adicional.

## F–G. Practice y Exam

Estado `ExerciseDifficulty` → callback del radio con ID canónico → argumento existente del builder → `SessionConfig.difficulty`. Tests ejecutan los callbacks reales del panel y los builders/generador reales para los tres niveles en ambos modos. No hay restricciones de categorías ni cambios automáticos a Naming/MCQ/Build, cantidad, Endless o seed.

## H. Inmutabilidad

El formulario y selector desaparecen al comenzar. La sesión usa su configuración original; Exam mantiene su plan, drafts, navegación, privacidad y grading existentes. Corrections y Review siguen reconstruyendo con `SessionConfig` original, sin selector nuevo. No se editaron reducers ni reconstrucción.

## I. Locale

ES↔EN conserva la selección antes de Start y la dificultad/version/seed/identidad molecular durante la sesión. Tests de integración cubren ambos modos y niveles; los tests UI existentes cubren drafts/timing. Smoke real: Practice y Exam Hard conservan el borrador `draft D6` durante el cambio de idioma. Exam sigue sin revelar respuesta/categoría antes de Submit.

## J. Accesibilidad

Semántica nativa de selección única y etiquetas asociadas; Tab, flechas y Space usan comportamiento del navegador. Se verificó ArrowRight/ArrowLeft en navegador real, foco perceptible en ambos temas y ausencia de inicio accidental. Labels completos y targets medidos de 46 px. No se añadió lógica de teclado custom; no se realizó una auditoría con lector de pantalla.

## K. Responsive / visual

Inspección real con computer-use sobre preview Pages local: Practice ES/EN y Exam ES/EN, los tres niveles a 390 px; tablet 768 px y desktop 1280 px; temas claro y oscuro. Sin overflow horizontal ni labels cortados/superpuestos. A 390 px el control usa dos opciones en la primera fila y una en la segunda; a 768/1280 px tres opciones horizontales, máximo 640 px. No hay alturas rígidas de texto ni ellipsis.

Medidas: `innerWidth` 390/768/1280 y `documentElement.scrollWidth` 375/753/1265; targets 46 px. El espacio restante corresponde al scrollbar. CSS usa flex-wrap y tokens existentes. Screenshots y métricas quedan ignorados en `outputs/difficulty-d6/`; no se añadió framework browser. El viewport temporal se restauró.

## L. i18n

Siete keys nuevas en el diccionario existente: `Dificultad`, `Fácil`, `Intermedio`, `Difícil`, y tres descripciones:

- Una idea principal de nomenclatura a la vez. / One main naming idea at a time.
- Combina reglas de nomenclatura, insaturación y sustituyentes. / Combines naming rules, unsaturation and substituents.
- Combina varias decisiones de nomenclatura y mayor complejidad estructural. / Combines several naming decisions and greater structural complexity.

## M. Límites / Class Seed / CSV

ClassVariantsPanel ya comparte exactamente la selección del formulario y soporta Difficulty. Se pasó un único prop `difficulty` para que preview/fingerprint/participant seed/manifest correspondan al nivel elegido y el preview anterior quede stale al cambiarlo. No se creó selector adicional ni rediseño de Class Seed.

CSV mantiene schemaVersion 1, columnas, BOM, CRLF, quote-all y protección de fórmulas. Chemistry, recipes, namer, domain/oracles, RNG, versiones y fixtures permanecen intactos. No cambios a package.json, workflow, molecule files, routing/query params, persistence o analytics; sin nuevas dependencias. La exclusión histórica Easy E/Z permanece fail-closed en backend y conserva el manejo de error existente; D6 no altera elegibilidad química.

## N. Frozen versions

v1/v2/v3 verificados por critical; fixture Hard v4 repetido exactamente en tres procesos frescos ES/EN por el test frozen existente. Ninguna fixture modificada/regenerada.

## O. Tests UI focalizados

- Baseline Practice/Exam: 51 PASS / 0 FAIL.
- Selector inicial + Practice/Exam: 66 PASS / 0 FAIL.
- Selector + Class UI + frozen v4: 22 PASS / 0 FAIL.
- Selector final, tras añadir conservación de controles: 17 PASS / 0 FAIL.

El harness nuevo sustituye únicamente montaje/scheduling de hooks React; los callbacks, builders, sesiones y química son código real. SSR comprueba semántica/labels/checked state. La navegación de teclado y layout se verificaron además en navegador real.

## P. Backend D5

Critical preserva validación, legacy, locale, Corrections/Review, PRACTICE-007B/008 y smoke Hard v4. Full pasó los tests existentes de basic/intermediate/advanced v4, Hard 17/17, Naming/MCQ/Build y freezes; no se actualizaron expected outputs. También pasaron sesiones finitas 5/10/20/30, agotamiento seguro de anillos, Endless acotado, reconstrucción, grading atómico, Review y Class/CSV.

## Q. Validación final

| Comando | Resultado |
|---|---|
| `npm run test:critical` | PASS: 157 tests, 157 PASS, 0 FAIL, 0 skips |
| `npm test` | PASS: 2458 tests, 2453 PASS, 0 FAIL, 5 skips históricos |
| `npm run build` | PASS; artifact Sites verificado |
| `npm run build:pages` | PASS |
| `npm run validate:pages` | PASS; 3 entries, 3 assets, base `/Hydrocarbon-Lab/` |
| `npm run lint` | PASS: 0 errors, 11 warnings históricos |
| `git diff --check` | PASS |

La suite completa se ejecutó una vez, después de los tests focalizados y critical. Duración del runner: 2,139,960.9783 ms (~35 min 40 s). Los wrappers npm funcionaron con Git Bash en PATH; no fue necesario modificar scripts ni sustituir lint. Se preservan los warnings históricos de bundling y los skips del corpus de referencia.

## R. TypeScript / lint

`npx tsc --noEmit`: 32 diagnósticos existentes, 0 nuevos. Coinciden archivo, posición, código y mensaje; únicamente cambia el orden de miembros de una unión en tres mensajes de `app/page.tsx`. Tras ordenar esos miembros, la salida coincide con baseline. No se corrigió deuda histórica. Lint focalizado: 0 errores tras renombrar una variable del harness que infringía una regla Next. Lint global: 0 errores, 11 warnings preexistentes, 0 errores/warnings nuevos.

## S. Archivos

Modificados: `app/globals.css`, `app/i18n.ts`, `app/practice-panel.tsx`, `tests/practice-ui.test.mjs`.

Nuevos: `app/difficulty-selector.tsx`, `tests/difficulty-selector.test.mjs`, `docs/difficulty-d6-ui-selector.md`.

Ignorados: logs de baseline/UI/selector/Class/frozen/critical/full/TypeScript/lint/build/Pages, cinco screenshots y `mobile-metrics.json` en `outputs/difficulty-d6/`; `dist/`, `dist-pages/`, `.wrangler/` y outputs de tests existentes (incluido `outputs/difficulty-d5-v4/`). No probes fuera de las rutas ignoradas. Sin normalización masiva de líneas; `app/page.tsx` intacto.

## T. D7 handoff / fuera de alcance

**D7 readiness: YES.** Puede centrarse en Hard Reviewer / MCQ / Build hardening sin más plumbing del selector público. Todos los gates solicitados pasaron; no se detectaron bugs independientes que exigieran ampliar el alcance.

Sin química nueva, generatorVersion 5, recipes nuevas, categorías nuevas, sulfur, R/S, expansión de topología, rediseño Class Seed/CSV, gamification, modo dislexia/discalculia o rediseño Reviewer D7. No commit. No push.

HEAD y branch conservados; cambios sin staging para revisión.

DIFFICULTY D6 COMPLETE — PUBLIC EASY / INTERMEDIATE / HARD UI READY
