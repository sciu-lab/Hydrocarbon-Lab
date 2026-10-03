# Difficulty D1 — plumbing y compatibilidad

## A. Baseline

- HEAD: `36fa14b` (`docs: define difficulty v1 contract`). Branch: `main`. Working tree inicialmente limpio.
- D0 estaba committeado. Historial verificado: reasoning `99171cb`, dedupe `7fd9dc6`, CRLF `cdf7e2a` y D0 `36fa14b`.
- Baseline focalizado: model, exercise-seed, Practice, Exam, Class Assignment y CSV: **79 pass, 0 fail, 0 skip**.

## B. Existing Difficulty architecture

`ExerciseDifficulty = basic | intermediate | advanced` ya era el tipo canónico en `exercise-model.ts`. `SessionConfig`, su serialización de orden fijo y `deriveQuestionIdentity` ya incluían Difficulty. `deriveGenerationIdentity` conserva Difficulty y proyecta locale a ES para compatibilidad química. No se creó otro tipo ni otro sistema de seeds.

El recorrido queda: `Difficulty → SessionConfig → question/generation seed → generator/question plan → attempts + config original → correction/reconstruction/Review`. Class añade `selection → normalized config → fingerprint → participant seed → SessionConfig`; su fingerprint viaja también en CSV.

## C. Previous hardcodes

Los builders `createPracticeConfig` y `createExamConfig` forzaban `basic`; `startPractice` y `createExamQuestionPlan` rechazaban los otros niveles. Class normalizaba y construía sesiones con `basic`; fingerprint y stale-preview signature omitían el nivel.

## D. Changes implemented

- Un normalizador reutiliza el catálogo canónico; solo la ausencia del campo legacy produce `basic`.
- Ambos builders aceptan un sexto argumento opcional Difficulty, conservando `basic` por defecto. Los guards de sesión siguen validando el modo y permiten los tres IDs.
- Class normaliza/persiste Difficulty y lo propaga al participante. Para non-basic extiende fingerprint/signature con `["difficulty", ID]`; basic conserva su framing histórico.
- La reconstrucción desde fila CSV recupera el nivel de ese fingerprint y verifica el fingerprint completo y la semilla contra la configuración. No confía únicamente en el sufijo.
- Tests focalizados y un fixture capturado **antes** de editar producción congelan los contratos. No se reemplazaron expected seeds históricos.

## E. SessionConfig

Los tres IDs son válidos; config JSON nuevo serializa Difficulty explícitamente. JSON legacy sin campo normaliza a `basic` con exactamente la serialización y namespace basic anteriores. `easy`, `hard`, `expert`, vacío, labels traducidos, null y undefined explícito en objetos son inválidos. Los argumentos opcionales de builders usan su default normal de TypeScript/JavaScript.

## F. Practice

Basic, intermediate y advanced están probados programáticamente con Naming, MCQ y Build, locale switching, intentos, feedback, completion, corrections y Review. Endless non-basic conserva el límite existente de ocho claves recientes. UI sigue omitiendo el argumento y creando basic.

## G. Exam

Los tres niveles recorren plan congelado, drafts, Previous/Next, locale switching, revisión neutral, grading atómico, resultados y post-review. No se añadieron labels/pistas pre-submit ni se modificó Dashboard.

## H. Determinism

| Difficulty | Same seed repeat | Result |
|---|---|---|
| basic | Fixture anterior frente a ejecución D1 | Idéntico: 26 preguntas |
| intermediate | Dos procesos nuevos ES + uno EN | Plans, índices, targets y MCQ idénticos |
| advanced | Dos procesos nuevos ES + uno EN | Plans, índices, targets y MCQ idénticos |

Los snapshots deshabilitan `Math.random` y `Date.now` durante generación. La identidad distingue Difficulty usando el framing de sesión existente. Que cambie un target por cambiar la semilla no implica nuevas restricciones químicas.

`tests/fixtures/difficulty-d1-nonbasic-session.json` congela 26 preguntas por nivel. Cada proceso nuevo se compara también con estos fixtures D1, además de los otros procesos y locale.

## I. Legacy basic compatibility

`tests/fixtures/difficulty-d1-basic-session.json` se capturó en HEAD `36fa14b` antes del plumbing: Practice Naming 10 y mixed 6 con `PRACTICE-PHASE3`, Exam mixed 10 con `EXAM-PROCESS`. Conserva type, structural identity, generationIndex y SHA-256 del payload completo; este incluye grafos, Build targets y MCQ IDs/orden/provenance. Solo el nombre mostrado se proyecta a ES para comparación locale-neutral.

Ejemplo antes/después, primera Naming: structural identity `gJP@DjZh@`, generationIndex `0`, payload SHA-256 `32721d5a075b536ede7e6a816aac07a9390fa5d1c01207e876f9286ee5abaa8f`: **idénticos**. Todos los 26 registros se comparan por igualdad exacta.

## J. Reconstruction

Los tests reconstruyen ordinal 7 / generationIndex 11 con config JSON original intermediate/advanced: preservan Difficulty e identidad estructural. Pasar basic por error al replay non-basic falla la comprobación de identidad. No se alteraron los módulos de reconstruction.

## K. Corrections

Usan la config original. Se verifican los argumentos recibidos por el generator, el target original, conservación del primer intento/initial score y segundo intento/mastery. Sin cambios en numbering, scoring ni schema de AttemptRecord.

## L. Session Review

El model conserva SessionConfig completo y su normalizador aplica el default legacy. Practice reconstruye con el config original; Exam reutiliza el plan congelado sin regenerar. Se probó el Reviewer real. AttemptRecord no añade Difficulty: un record aislado ya necesita SessionConfig para replay y no constituye un formato standalone de sesión reproducible.

## M. Locale independence

ES/EN preservan química, type ordering, generationIndex, MCQ IDs/order y Build targets para non-basic en procesos nuevos. Los tests básicos existentes conservan la misma garantía. Solo nombres/copy cambian; ninguna identidad usa labels traducidos.

## N. Class Seed

Fixture: `CHEM-4B-2026`, participante `001`, Exam 15, categorías alkane/alcohol, Naming/MCQ/Build. Fingerprint legacy/basic antes/después:

```json
["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],1]
```

La semilla completa se compara exactamente con el fixture. SHA-256 de esa semilla antes/después: `0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427`.

Intermediate añade `["difficulty","intermediate"]`, advanced añade `["difficulty","advanced"]` al tuple. SHA-256 de sus semillas: `97e8cb566b3e680db09e2765b9e766a76edf1471d24d0e66eeb673c07c954105` y `795c14cc78cd2fb466e4147b0fd47402ccae8016656285688734b009fc77d7dc`, respectivamente. Fingerprints, seeds y preview signatures son deterministas y distintos. Config omitida y basic explícito producen el mismo manifest histórico.

## O. CSV

Se mantienen las 12 columnas y `schemaVersion = 1`. El token canónico non-basic viaja en la columna existente `config_fingerprint`; por ello no hace falta columna ni schema nuevo. Los consumidores históricos siguen recibiendo bytes basic idénticos; para interpretar los nuevos niveles necesitan reconocer el sufijo del fingerprint.

BOM UTF-8, CRLF, quote-all, protección spreadsheet injection y orden de columnas permanecen intactos. CSV basic de participantes 001/002 tiene el mismo SHA-256 antes/después: `08fbce3413b9930618ec00a9f3b7fd93bee54f3a8e884c662ad501164e3c4e85`.

No hay importer público de archivos CSV: existe reconstruction desde filas del export manifest, usada en tests. El tuple legacy de seis elementos significa basic; unknown IDs, tags inválidos y manipulación de config/seed son rechazados. No se inventó importer. La decisión D1 resuelve las opciones de versionado que D0 dejó abiertas, sin reescribir D0.

## P. generatorVersion

`generatorVersion`, Class `schemaVersion`, `derivationVersion` y Review schema permanecen **1**. El algoritmo de generación y la derivación de participantes no cambiaron.

## Q. PRACTICE-007B regression

La clave de dedupe sigue siendo questionType + canonical target graph; Difficulty no participa. Regresión focalizada y suite completa incluidas en la validación.

## R. PRACTICE-008 regression

Se conserva evaluación de referencias exactas, caracteres invisibles, corrections y grading Exam. Regresión focalizada y suite completa incluidas.

## S. REASON-UNSAT-001 regression

Se conservan múltiples fragmentos de insaturación y enlaces semánticos bilingües. Se ejecutan las regresiones de `reasoning-name-fragments.test.mjs`; reasoning/highlights no se modificaron.

## T. Test results

Focalizados de model/seed/Class/CSV/Difficulty: **69 pass, 0 fail**; normalizador tras aclarar el test de argumento opcional: **1 pass**; nuevos fixtures non-basic en procesos frescos: **2 pass**. Practice/Exam/Class integration/Session Review y las tres regresiones: **76 pass, 0 fail, 0 skip**.

`npm test`: **2164 tests, 2159 pass, 0 fail, 5 skip, 0 cancelled**; duración `1673422.3744 ms` (27 min 53 s). Los cinco skips existentes son ESTER-0007/0012/0014/0015/0016, tier silver, sin exact naming oracle; ningún test de D1 está omitido. La suite completa se ejecutó una sola vez. El primer intento de wrapper falló creando `.sites-runtime` por permisos del sandbox antes de ejecutar tests; el retry autorizado fuera del sandbox completó build y suite.

## U. Build / lint / diff-check

`npm run build`: **PASS**, incluyendo validación del Worker ESM `default.fetch` y manifest. `npm run lint`: **PASS**, **0 errors, 11 warnings** en archivos sin cambios D1; no hay warnings en los archivos de esta fase. `git diff --check`: **PASS**.

Git Bash estaba instalado fuera de PATH; se añadió solo al PATH del proceso. Sus wrappers necesitaron ejecución autorizada fuera del sandbox por el error de creación de `.sites-runtime`. Se ejecutaron los scripts originales, sin cambios ni fallback ESLint. Los avisos de vinext sobre Node imports/chunk size no impidieron construir y validar el artefacto.

Evidencia local ignorada: `outputs/difficulty-d1/full-suite.log`, `final-build.log` y `final-lint.log`.

## V. Files changed

1. `app/exercise-model.ts`
2. `app/practice-session.ts`
3. `app/exam-session.ts`
4. `app/class-assignment.ts`
5. `app/class-assignment-csv.ts`
6. `tests/exercise-model.test.mjs`
7. `tests/practice-session.test.mjs`
8. `tests/difficulty-plumbing.test.mjs`
9. `tests/helpers/difficulty-session-snapshot.mjs`
10. `tests/fixtures/difficulty-d1-basic-session.json`
11. `tests/fixtures/difficulty-d1-nonbasic-session.json`
12. `docs/difficulty-d1-plumbing.md`

## W. Findings

**DIFFICULTY-D1-AUDIT-001:** `npx tsc --noEmit --incremental false` detecta 32 errores preexistentes fuera de D1. Un compiler-host audit sustituye en memoria los cinco archivos de producción por sus fuentes HEAD `36fa14b`: baseline y D1 producen exactamente los mismos 32 diagnósticos. No se corrigieron ni se ocultaron. Evidencia local: `outputs/difficulty-d1/typecheck-audit.json` (ignorado por Git). TypeScript global no es un script/gate de `npm test` o build en este repo.

Las restricciones basic y la omisión Class eran los hallazgos D0 dentro de D1. El coste nuevo es validación/metadata y framing: no hay scans químicos, candidatos ni retries adicionales.

## X. Out of scope confirmation

Sin diferenciación química por nivel: generator recipes, probabilities, longitudes, substituciones, dominio Build, structural equivalence, namer, reasoning, highlights, 17 Category IDs y `.quimica` permanecen sin cambios. Sin selector público, badges, i18n nuevo, nuevas métricas ni funcionalidad de futuras fases. No es necesario browser audit porque no se cambió UI.

## Y. Final state

Branch final `main`, HEAD `36fa14b`, sin commit ni push. Working tree contiene únicamente los 12 archivos de V (7 modificados, 5 nuevos sin staging). `git diff --ignore-cr-at-eol --stat` informa 56 inserciones / 20 eliminaciones en los 7 archivos existentes; no incluye los 5 nuevos.

La config está preparada para restricciones químicas posteriores; intermediate/advanced continúan usando el catálogo químico actual.

DIFFICULTY D1 COMPLETE — PLUMBING READY FOR EASY CONSTRAINTS
