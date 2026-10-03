# Difficulty D2 — Easy chemistry

## A. Baseline

HEAD `6e84e39`, branch `main`, working tree limpio antes de editar. D0/D1, REASON-UNSAT-001, PRACTICE-007B y TEST-CRLF-001 estaban committeados. D0 y D1 leídos completos. Generator antes de D2: **1**. Baseline focalizado: **120 pass, 0 fail, 0 skip**, 49.534 s.

## B. Versioning decision

Easy cambia targets/probabilidades y requiere **generatorVersion 2**. Nuevos builders Practice/Exam/Class usan v2; normalización/serialización conserva versiones explícitas **1 o 2**. Versión ausente sigue siendo inválida, como antes; difficulty ausente sigue siendo basic. V1 mantiene recetas, RNG, framing, aceptación y payload. V2 intermediate/advanced usan recetas legacy: **PLUMBING READY / CHEMISTRY NOT YET CERTIFIED**.

## C. Easy contract implemented

Hidrocarburo saturado, una C=C, una C≡C o un motivo funcional en esqueleto saturado. C=O/C≡N no son insaturación C–C. Ácido/éster/amida cuentan una vez por motivo del detector, no por heteroátomo. Hidrocarburos admiten 0–1 metilo en sitios revisados; sin etilo, varias ramas ni ramas sobre enlaces múltiples. El padre analizado incluye todo salvo el metilo terminal y conserva la insaturación. Funcionales conservan recetas lineales actuales. Sin E/Z explícito, R/S, función+insaturación ni multifunción.

## D. Architecture

SessionConfig/version → seed locale-neutral existente → categoría determinista → receta legacy o Easy → química/conectividad → dominio actual + invariantes Easy por grafo/motivos → referencia del motor real + padre estructural → fórmula/stereo/SMILES round-trip → invariantes y padre restaurados → identidad/fórmula/nombres iguales → aceptación.

El padre se obtiene del modelo ya calculado para EN; sin cambios del namer ni clasificación por regex de nombres. No se añade al payload persistido v1. Easy valida targets; Build/distractores conservan DomainProfile v1.

## E. Category matrix

| Category | Easy support | Rules | Result |
|---|---|---|---|
| alkane | Sí | Saturado; 0–1 metilo | 16/16 targets válidos |
| alkene | Sí | Una C=C; 0–1 metilo fuera de sus extremos | 16/16 targets válidos |
| alkyne | Sí | Una C≡C; 0–1 metilo fuera de sus extremos | 16/16 targets válidos |
| halogenated | Sí | Un halo; sin ramas ni C–C insaturación | 16/16 targets válidos |
| alcohol | Sí | Un OH; saturado lineal | 16/16 targets válidos |
| aldehyde | Sí | Un CHO; saturado lineal | 16/16 targets válidos |
| ketone | Sí | Una cetona; saturado lineal | 16/16 targets válidos |
| carboxylic-acid | Sí | Un COOH, motivo único; saturado lineal | 16/16 targets válidos |
| ether | Sí | Un éter, dos porciones lineales unidas por extremos | 16/16 targets válidos |
| ester | Sí | Un éster, motivo único; dos porciones lineales saturadas | 16/16 targets válidos |
| amine | Sí | Una amina primaria; saturado lineal | 16/16 targets válidos |
| amide | Sí | Una amida primaria, motivo único; saturado lineal | 16/16 targets válidos |
| simple-carbocycle | Sí | C5/C6 saturado; 0–1 metilo | 16/16 targets válidos |
| aromatic | Sí | Benceno; 0–1 metilo; excepción aromática | 16/16 targets válidos |
| ez | No | Incompatible con Easy explícito | unsupported-request |
| nitrile | Sí | Un C≡N; sin C–C múltiple ni ramas | 16/16 targets válidos |
| nitro | Sí | Un N+(=O)O− canónico; saturado sin ramas | 16/16 targets válidos |

## F. E/Z policy

Toda configuración v2 basic con `ez` falla antes de consultar química, incluso mezclada con otros temas. Sin filtrar/sustituir categorías. Practice/Exam usan sus errores seguros existentes. Los 17 IDs y el checkbox actual se conservan; sin UI/copy nueva ni selector de Difficulty. V1 en los tres niveles y v2 intermediate/advanced conservan E/Z.

## G. Historical v1 compatibility

Fixtures D1 basic y nonbasic intactos: **26 preguntas por nivel**, comparadas exactamente con structuralIdentity, tipo, generationIndex, hash de payload completo, IDs/orden/provenance MCQ y targets Build. Entradas de fixtures/sweeps históricos fijadas explícitamente a v1; ningún esperado histórico reemplazado.

Ejemplo basic `PRACTICE-PHASE3`, Naming, generationIndex 0: identidad `gJP@DjZh@`; SHA256 `32721d5a075b536ede7e6a816aac07a9390fa5d1c01207e876f9286ee5abaa8f`, idénticos antes/después. Reconstrucción/Corrections/Review v1 también probados.

## H. New v2 determinism

Nuevo fixture `difficulty-d2-easy-session.json`: 26 preguntas Practice Naming/mixed y Exam mixed. Dos procesos ES y uno EN repiten exactamente el fixture; generación con Math.random/Date.now prohibidos. Sweep de 16 categorías repite cada contexto por seed/índice/locale. Los 17 temas v2 intermediate/advanced repiten exactamente las recetas legacy bajo namespaces distintos.

## I. Practice

Seis preguntas mixtas v2 basic, respuestas correctas/incorrectas, finalización exacta. Finitas preservan tipo+grafo canónico y generationIndex real; no reducen el count ni aceptan duplicados para completar.

## J. Exam

Plan/drafts/Previous/Next/locale preservados; cero attempts antes de submit. Grading atómico de seis preguntas, submit idempotente y Review del plan congelado. Sin nuevas pistas de categoría/difficulty pre-submit.

## K. Endless

24 preguntas v2 basic Easy; recentIdentities y usedExerciseKeys ≤8. Sin memoria ilimitada ni cambio de política.

## L. MCQ

Dos seeds por cada categoría compatible: **30 MCQ aceptadas, 2 aromáticas sin distractores suficientes**. Target intacto; payload validado por el validador actual. No nuevas recipes por nivel. Benceno/metilbenceno pueden agotar MCQ con recetas actuales: fallo seguro, sin añadir complejidad.

## M. Build

Targets mixtos validan/evalúan con dominio y equivalencia anteriores; Corrections v2 prueba un Build inicialmente incorrecto y corregido. Sin cambios de editor, Lab ni dominio de submission.

## N. Reconstruction

SessionConfig/AttemptRecord existentes preservan versión/difficulty/índice originales en JSON, Corrections y Review. V1 nunca se redirige a v2. Sin schema churn de attempts ni contaminación del archivo `.quimica`.

## O. Corrections

V1/v2 reconstruyen el error original tras locale switching, conservan intentos/score iniciales, agregan attemptNumber 2 y actualizan mastery. No usan configuración actual del panel para reconstruir.

## P. Locale

ES/EN preservan grafo/seed/structuralIdentity/índices/plan/IDs y orden MCQ/Build. Solo proyección de nombres/UI; sin labels localizados en seeds/fingerprints.

## Q. Class Seed

`CHEM-4B-2026`, participant `001`, v1 basic/omitted: fingerprint/participant seed completos idénticos al fixture D1. Fingerprint: `["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],1]`. V2 reutiliza el campo version existente y distingue las tres difficulties; tres participantes repiten planes Easy en ambos idiomas. schemaVersion y derivationVersion permanecen **1**.

Misma selección anterior y participant; SHA256 del seed completo (la prueba compara también el string literal):

| Configuración | Seed SHA256 |
|---|---|
| v1 basic antes | `0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427` |
| v1 basic después | `0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427` |
| v2 basic | `a471c87b8da1343ebf2e30c57372d45f824e113aaabb91ebdf506dd9aefaf567` |
| v2 intermediate | `2da396172e466eb18d14dde9d6cf04aa53b81954bf73ad6b904b2461f0e5b978` |
| v2 advanced | `56f590cf932881b7fda94157af9a40543aae2d624fd359ad073418d412320498` |

## R. CSV

Bytes históricos v1: SHA256 `08fbce3413b9930618ec00a9f3b7fd93bee54f3a8e884c662ad501164e3c4e85`, intacto. V2 reconstruye version/difficulty usando las 12 columnas D1 (difficulty en fingerprint canónico). BOM UTF-8, CRLF, quote-all, protección spreadsheet y orden preservados. Sin columna/importer/schema bump.

## S. Duplicate integrity

PRACTICE-007B conserva clave tipo+grafo canónico, sin difficulty/version/seed/locale. Sweep: rechazos de duplicados contabilizados, cero duplicados admitidos. Fixtures históricos no regenerados.

## T. Safe exhaustion

9/64 sesiones agotan con `insufficient-unique-questions`: 4 aromáticas (dos grafos), 4 cíclicas (cuatro grafos C5/C6 ± metilo) y 1 amida por búsqueda acotada. Sin cambio de tema/count/difficulty/límites. Exam no comete intentos ni plan parcial al fallar. La tabla Accepted cuenta candidatos únicos antes del posible rollback del plan Exam, no sesiones completadas.

## U. Sweeps

Sweep químico: **256 targets**, 16 categorías ×8 seeds ×2 índices, repetidos en ES/EN; química/motivos/parent/Easy válidos, cero retries/rechazos/violaciones. Incluye halos F/Cl/Br/I y ramas revisadas. Semántica: 19 positivos, 14 grafos D0 complejos negativos, diol/diona/enyne/multifunción/ramas/EZ negativos; triple+halo de valencia 5 inválido.

Sweep finito: cinco Naming solicitadas, Practice/Exam ×2 seeds por categoría.

| Category | Sessions | Candidates | Accepted | Easy-contract rejects | Duplicate rejects | Exhaustions | Violations |
|---|---:|---:|---:|---:|---:|---:|---:|
| alkane | 4 | 21 | 20 | 0 | 1 | 0 | 0 |
| alkene | 4 | 21 | 20 | 0 | 1 | 0 | 0 |
| alkyne | 4 | 21 | 20 | 0 | 1 | 0 | 0 |
| halogenated | 4 | 21 | 20 | 0 | 1 | 0 | 0 |
| alcohol | 4 | 23 | 20 | 0 | 3 | 0 | 0 |
| aldehyde | 4 | 26 | 20 | 0 | 6 | 0 | 0 |
| ketone | 4 | 23 | 20 | 0 | 3 | 0 | 0 |
| carboxylic-acid | 4 | 21 | 20 | 0 | 1 | 0 | 0 |
| ether | 4 | 23 | 20 | 0 | 3 | 0 | 0 |
| ester | 4 | 23 | 20 | 0 | 3 | 0 | 0 |
| amine | 4 | 23 | 20 | 0 | 3 | 0 | 0 |
| amide | 4 | 29 | 18 | 0 | 11 | 1 | 0 |
| simple-carbocycle | 4 | 36 | 15 | 0 | 21 | 4 | 0 |
| aromatic | 4 | 24 | 7 | 0 | 17 | 4 | 0 |
| nitrile | 4 | 25 | 20 | 0 | 5 | 0 | 0 |
| nitro | 4 | 21 | 20 | 0 | 1 | 0 | 0 |
| TOTAL | 64 | 381 | 300 | 0 | 81 | 9 | 0 |

## V. Performance

Sondeos focalizados: químico ~15.42 s (tres generaciones/contexto); finito ~8.62 s. Todos los candidatos químicos aceptados en intento 0; max retries de pregunta aceptada 3. Límites preservados: químicos **16**, ordinarios **4**, MCQ **12**, Endless **8**. Easy se construye directamente. Duraciones dependen de máquina/carga; no son un benchmark comparativo.

## W. Regression tests

PRACTICE-007B, PRACTICE-008, REASON-UNSAT-001 (`reasoning-name-fragments`) focalizados verdes. También model/seed/generator v1, Class/CSV, Practice/Exam/Build/corrections, Review e integración/UI. Sin cambios de namer/reasoning/highlights.

## X. Validation

Focalizados: compatibilidad **120 pass**, Easy **56 pass**, lifecycle/sweeps **8 pass**, regresiones **198 pass**, Build/distractores históricos **28 pass** y éteres históricos **15 pass**: total **425 pass**, 0 fail, 0 skip. ESLint focalizado de producción modificada/tests nuevos: 0 errores/warnings.

Audit TSC contra HEAD con seis fuentes reemplazadas en memoria: **32 baseline = 32 actuales**, cero diagnósticos agregados/eliminados. DIFFICULTY-D1-AUDIT-001 permanece preexistente; sin cleanup. Evidencias locales ignoradas en `outputs/difficulty-d2`.

La primera tentativa `npm test` se interrumpió al detectar un fixture NOM-ETHER-001 que dependía implícitamente del antiguo default v1. Se fijó su entrada a version 1, sin modificar nombres esperados; sus 15 tests pasaron focalizadamente. La ejecución integral final, completada una vez tras la corrección, pasó: **2.228 tests, 2.223 pass, 0 fail, 5 skip preexistentes**, 1.850,566 s (~30 min 51 s). La tentativa interrumpida se conserva en `outputs/difficulty-d2/interrupted-fixture-run.log`; la final en `full-suite.log`.

- `npm run build`: exit 0; Worker ESM `default.fetch` y hosting manifest verificados. Advertencias habituales de vinext/chunks; sin errores.
- `npm run lint`: exit 0, **0 errores, 11 warnings preexistentes** en archivos sin cambios de D2.
- El wrapper Bash falló dentro del sandbox por permisos al crear su runtime. Build/lint se ejecutaron con acceso aprobado fuera del sandbox y PATH temporal a Git Bash/GNU timeout; scripts intactos. No fue necesario fallback ESLint.
- `git diff --check`: exit 0; solo avisos habituales LF→CRLF en dos tests, sin whitespace errors.
- `git status`: `main`, up to date con origin/main, sin staging; **32 archivos modificados + 5 nuevos** de D2. HEAD final `6e84e39e0362d55aff6d7f5573ad292974ec5990`.
- `git diff --ignore-cr-at-eol --stat`: **32 archivos existentes, 137 inserciones / 111 eliminaciones**; no incluye los cinco archivos nuevos.

## Y. Files changed

- [app/exam-session.ts](../app/exam-session.ts)
- [app/exercise-chemical-candidate.ts](../app/exercise-chemical-candidate.ts)
- [app/exercise-chemical-generator.ts](../app/exercise-chemical-generator.ts)
- [app/exercise-chemistry-oracles.ts](../app/exercise-chemistry-oracles.ts)
- [app/exercise-easy-profile.ts](../app/exercise-easy-profile.ts)
- [app/exercise-model.ts](../app/exercise-model.ts)
- [app/practice-session.ts](../app/practice-session.ts)
- [docs/difficulty-d2-easy.md](../docs/difficulty-d2-easy.md)
- [tests/class-assignment-integration.test.mjs](../tests/class-assignment-integration.test.mjs)
- [tests/class-assignment.test.mjs](../tests/class-assignment.test.mjs)
- [tests/difficulty-easy-session.test.mjs](../tests/difficulty-easy-session.test.mjs)
- [tests/difficulty-easy.test.mjs](../tests/difficulty-easy.test.mjs)
- [tests/difficulty-plumbing.test.mjs](../tests/difficulty-plumbing.test.mjs)
- [tests/ether-nomenclature.test.mjs](../tests/ether-nomenclature.test.mjs)
- [tests/exam-session.test.mjs](../tests/exam-session.test.mjs)
- [tests/exam-ui.test.mjs](../tests/exam-ui.test.mjs)
- [tests/exercise-model.test.mjs](../tests/exercise-model.test.mjs)
- [tests/exercise-seed.test.mjs](../tests/exercise-seed.test.mjs)
- [tests/fixtures/difficulty-d2-easy-session.json](../tests/fixtures/difficulty-d2-easy-session.json)
- [tests/helpers/class-session-process.mjs](../tests/helpers/class-session-process.mjs)
- [tests/helpers/difficulty-session-snapshot.mjs](../tests/helpers/difficulty-session-snapshot.mjs)
- [tests/helpers/exam-plan-process.mjs](../tests/helpers/exam-plan-process.mjs)
- [tests/helpers/session-hardening-sweep.mjs](../tests/helpers/session-hardening-sweep.mjs)
- [tests/helpers/session-review-fixtures.mjs](../tests/helpers/session-review-fixtures.mjs)
- [tests/practice-008-reference-answer.test.mjs](../tests/practice-008-reference-answer.test.mjs)
- [tests/practice-attempt-session.test.mjs](../tests/practice-attempt-session.test.mjs)
- [tests/practice-build-session.test.mjs](../tests/practice-build-session.test.mjs)
- [tests/practice-correction-session.test.mjs](../tests/practice-correction-session.test.mjs)
- [tests/practice-distractor-engine.test.mjs](../tests/practice-distractor-engine.test.mjs)
- [tests/practice-mcq.test.mjs](../tests/practice-mcq.test.mjs)
- [tests/practice-review-ui.test.mjs](../tests/practice-review-ui.test.mjs)
- [tests/practice-review.test.mjs](../tests/practice-review.test.mjs)
- [tests/practice-session.test.mjs](../tests/practice-session.test.mjs)
- [tests/practice-structural-answer.test.mjs](../tests/practice-structural-answer.test.mjs)
- [tests/practice-ui.test.mjs](../tests/practice-ui.test.mjs)
- [tests/session-hardening.test.mjs](../tests/session-hardening.test.mjs)
- [tests/session-review-integration.test.mjs](../tests/session-review-integration.test.mjs)

## Z. Out of scope confirmation

Sin química Intermediate/Hard, multifunción, selector/badges públicos, recipes nuevas MCQ, expansión Build, cambios de naming/reasoning ni cleanup tsc ajeno. D0/D1 conservados. Sin commit, sin push; HEAD/branch iniciales conservados.

DIFFICULTY D2 COMPLETE — EASY CHEMISTRY CERTIFIED
