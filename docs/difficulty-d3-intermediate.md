# Difficulty D3 — Intermediate chemistry

## A. Baseline

HEAD `0729971030068518c4fa14e3ee561bb332961398`, branch `main`, working tree inicialmente limpio; HEAD = origin/main. Historial D0/D1/D2, REASON-UNSAT-001, PRACTICE-007B y TEST-CRLF-001 confirmado. Contratos D0/D1/D2 y solicitud D3 leídos completos antes de implementar. Versión current inicial **2**, versiones soportadas **1/2**.

Baseline de sesiones/compatibilidad antes de activar v3: **24 pass, 0 fail**. La primera ejecución dentro del sandbox se interrumpió tras un timeout de procesos hijos; las mismas dos suites completas pasaron fuera del sandbox. No se cambiaron snapshots esperados para resolverlo. Logs de desarrollo ignorados en `outputs/difficulty-d3`.

## B. Versioning decision

Un current global **3** para sesiones nuevas. Parser/serializador acepta explícitamente **1/2/3**; falta de versión sigue siendo error; falta de difficulty legacy sigue normalizando a basic. IDs internos `basic | intermediate | advanced` intactos.

| Version | basic | intermediate | advanced |
|---|---|---|---|
| 1 | Legacy congelado | Legacy congelado | Legacy congelado |
| 2 | Easy D2 congelado | Legacy D2 congelado | Legacy D2 congelado |
| 3 | Mismo contrato Easy | Familias Intermediate certificadas | Legacy: PLUMBING READY / HARD CHEMISTRY NOT CERTIFIED |

V3-basic es semánticamente idéntico a v2-basic y tiene otro namespace determinista. No alias v2→v3 ni hacks para igualar sus grafos. Perfil/version routing centralizado en `exercise-generation-profile.ts`. Domain metadata continúa en 1 para legacy/Easy; Intermediate usa 2. No cambios de Class derivation/schema ni Review schema.

## C. Intermediate contract

Ancla real de categoría; exactamente una instancia funcional principal (o una feature ether/halo/nitro), sin función secundaria competidora. Como máximo una C=C **o** C≡C; C=O y C≡N no cuentan como C–C insaturación. Aromático monocíclico es la excepción topológica.

Trigger obligatorio: función/feature + una insaturación; hidrocarburos con dos ramas simples; anillos con dos ramas simples; o E/Z explícito verificado. Presupuesto: ≤2 centros de ramas grado C–C 3, cada rama analizada metilo/etilo; ≤1 halo, ≤1 nitro; ≤3 ocurrencias de prefijos/ramas. No grado C–C 4, rama compleja, enyne, diol/diona, funciones competidoras, R/S, cargas arbitrarias ni nuevas topologías.

El padre analizado debe contener la única insaturación C–C y la función de sufijo esperada. Fuera del padre solo ramas C1/C2 y, para ether/ester, una porción O-alquilo C1/C2. Padre acíclico mínimo C6; recetas construyen C6–C9. Validación por grafo, motivos y modelo analizado, sin scoring ni parsing del nombre para clasificar Difficulty.

## D. Architecture

Config normalizada/version → namespace/seed locale-neutral existente → categoría determinista → familia constructiva v3 con slots legales → química/valencia/conectividad → Domain v2 + trigger/budgets Intermediate → referencias ES/EN y evidencia de padre/principal → fórmula/CIP/SMILES round-trip → perfil/padre restaurados → identidad/fórmula/nombres idénticos → target aceptado.

No catálogo de nombres/SMILES como productor, ensamblador funcional genérico ni rechazo masivo. Las subsemillas y límites existentes se conservan. El nuevo dato principal vive en el oracle; no se agrega al payload histórico de preguntas.

## E. Easy separation

`5-metilhex-3-en-2-ol`, halo-alcohol y halo-ketone del corpus: Intermediate true, Easy false, Domain v1 false. Una cadena elemental, butan/hexanol saturado, alqueno/alquino lineal o mono-metilbenceno no cumplen el trigger Intermediate. V3-basic continúa pasando Easy; E/Z basic sigue fallando antes de invocar química.

## F. Hard separation

Negativos por grafo: ether+alcohol, amino-alcohol, hydroxy-aldehyde, hydroxy-ketone, acid+OH+NH2, diona, diol, enyne funcional, diene/diyne. Ninguno entra en Intermediate ni en la expansión Build. El triple+halo de valencia 5 se rechaza como `invalid-valence`. Los nombres manuales de D0 se conservan exactamente.

## G. Category matrix

| Category | v3 Intermediate | Recipe / required features | Forbidden features / notes |
|---|---|---|---|
| alkane | CERTIFIED | C6–C9 saturado, dos metilos interiores | Funciones/insaturación; cadena más larga sola no basta |
| alkene | CERTIFIED | Una C=C + dos metilos fuera de extremos múltiples | C≡C, función, E/Z implícito |
| alkyne | CERTIFIED | Una C≡C + dos metilos fuera de extremos múltiples | C=C, función, rama sobre triple |
| halogenated | CERTIFIED | Un F/Cl/Br/I en C2 + una C=C/C≡C, metilo opcional | Función principal adicional; halo siempre presente |
| alcohol | CERTIFIED | Un OH C2 + una C=C/C≡C, metilo/halo opcional | Diol, amino/ether; halo Cl/Br en tail saturado |
| aldehyde | CERTIFIED | CHO terminal + una C=C/C≡C, metilo opcional | Hydroxy/amino/segundo carbonilo |
| ketone | CERTIFIED | Una C=O C2 + una C=C/C≡C, metilo/halo opcional | Diona/hydroxy; carbonilo no solapa C–C múltiple |
| carboxylic-acid | CERTIFIED | Un COOH terminal + una C=C/C≡C, metilo opcional | Hydroxy/amino/segundo ácido |
| ether | CERTIFIED | Un O, padre C6–C9 insaturado + O-alquilo C1/C2, metilo opcional | Alcohol u otra función; O-alquilo saturado |
| ester | CERTIFIED | Un éster, insaturación en acilo C6–C9, O-alquilo C1/C2 | Insaturación alkoxy, otra función |
| amine | CERTIFIED | NH2 primaria C2 + una C=C/C≡C, metilo opcional | N-sustitución/segunda función |
| amide | CERTIFIED | CONH2 terminal + una C=C/C≡C, metilo opcional | N-sustitución/segunda función |
| simple-carbocycle | CERTIFIED | C5/C6 saturado, dos ramas metilo/etilo distintas | Funciones, ring unsaturation, polycycles |
| aromatic | CERTIFIED | Un benceno + dos ramas metilo/etilo distintas | Funciones, hetero/polyaromáticos |
| ez | CERTIFIED | C6–C9 lineal, una C=C interna con E o Z explícito | Nueva stereo funcional, R/S, varias C=C |
| nitrile | CERTIFIED | Un C≡N terminal + una C=C/C≡C, metilo opcional | Segunda función; C≡N no cuenta como C–C triple |
| nitro | CERTIFIED | Un N+(=O)O− C2 + una C=C/C≡C, metilo opcional | Función principal añadida en generación |

Todas las filas están soportadas; no fallback Easy/Hard. El corpus D0 #4 alcohol+nitro pasa perfil/domain/oráculos/Build, pero no se añade esa variante combinada al productor D3. No implica certificación de todas las permutaciones admitidas por el envelope de comparación.

## H. Question type capability

Las 17 filas: **Naming / MCQ / Build certificados para estas recetas**. Naming: entrega real de referencia en ES/EN, 34 casos. MCQ: 34 targets (dos seeds/fila), mismos grafos y opciones deterministas. Build: 272 targets, copias/remappings/rotaciones y equivalencia canónica; E/Z se compara por separado. La elegibilidad MCQ sigue fallando de forma explícita si no existen tres distractores seguros; no se degrada el target ni el tipo.

## I. Certified recipe families

Alcohol, ketone, aldehyde, acid, amine primaria, amide primaria y nitrile con una C=C/C≡C; halo y nitro con una C=C/C≡C; ether insaturado en la porción larga; ester insaturado solo en acilo; hidrocarburos ramificados; monociclo saturado/benceno dialquilo; alqueno E/Z lineal explícito.

C–C múltiple construido en C3–C4 o C4–C5. OH/NH2/ketone/halo/nitro en C2; CHO/COOH/CONH2/C≡N/ether/ester en C1. Tail metilo fuera de ambos extremos múltiples y carbonilo/nitrile. Halo opcional solo alcohol/ketone, en tail saturado con valencia disponible. Los números finales los determina el namer; esos slots no escriben nombres esperados.

## J. E/Z

Una C=C interna estereogénica con E/Z sembrado y marcado explícitamente. Domain exige stereogenic/configuration; round-trip conserva descriptor, graph identity y nombres. Sin combinación E/Z + función nueva. Un dibujo sin flag no obtiene obligación E/Z por geometría.

## K. Domain changes

`validateExerciseDomain` mantiene default legacy. Política Intermediate habilita exactamente un motivo funcional + un C–C múltiple y prefijos halo/nitro no competidores, con cobertura de heteroátomos/cargas. Nitro se valida por motivo balanceado, también en alcohol+nitro D0 #4. Primary N, elementos/topología, valencia y explícito E/Z mantienen sus guards.

Target constraints están en `validateIntermediateExercise` + `validateIntermediateParent`. Comparison es la unión segura del dominio anterior y la expansión monofuncional; no exige trigger Difficulty a respuestas del alumno/distractores. No abre química Hard. Distractores v1/v2 siguen usando su policy legacy; v3 usa el envelope nuevo y sus verificaciones de modelo existentes.

## L. Valence

Construcción elige posiciones legales antes de añadir átomos; evita carbonilos/C≡N/extremos triples. Rama+halo sobre tail utiliza como máximo valencia C=4. Oracle de producción y round-trip siguen obligatorios. Caso D0 inválido `CC(O)C#C(Br)C(C)CC` rechazado por química y Build. No relax/bypass.

## M. Namer/oracles

Cinco anchors estructurales bilingües exactos, incluidos D0 #1–4 y alcohol+triple válido. Sweep de 272 targets revalida perfil, padre, naming support, fórmula/round-trip, identidad, locale y ambos ejes por familia funcional. Todos aceptados en intento 0. Caso de numeración `hept-4-en-2-ol` prueba que OH C2 vence la dirección opuesta con C=C en C3.

No se modifica el namer ni se inventan referencias EN modernas: se conserva el perfil 1979 (`5-methyl-3-hexen-2-ol`).

## N. Practice

Mixta de seis preguntas, Naming/MCQ/Build, grading/locale/attempts/completion/corrections/Review. Finite conserva clave tipo+grafo final e índices reales. Endless de 24 preguntas conserva ventanas ≤8; sin memoria ilimitada. UI sigue creando basic sin selector.

## O. Exam

Plan congelado, drafts, Previous/Next, disponibilidad/timing y cambio EN conservados. Cero attempts antes de submit; grading atómico, submit idempotente y Review post-submit. Sin nuevas pistas de Category/Difficulty ni contenido del target en validación neutral. Regresión de UI/privacidad incluida.

## P. MCQ

34/34 MCQ en sweep aceptadas; target igual al generado químico, opciones únicas, una referencia correcta, IDs/orden/provenance repetibles ES/EN. Se reutilizan las recipes actuales; los cambios son el dominio seguro versionado, no un framework de distractores por nivel. Los límites/errores existentes se preservan.

## Q. Build

Editor/model/equivalencia sin cambios. Validator neutral primero prueba el dominio legacy completo y después la expansión, evitando coste adicional para respuestas legacy válidas. Evaluador admite references Intermediate y compara elementos, cargas, órdenes y constitución canónica; E/Z separado. Respuesta elemental equivocada válida recibe DIFFERENT_*, sin constraints pedagógicos del target. Ningún target/hash especial-cased.

## R. Reviewer

Se verifican parent, función/sufijo, número, insaturación y sustituyente con highlights y links semánticos ES/EN. Dos bugs independientes aislados:

- **DIFFICULTY-D3-REVIEW-001:** Reviewer infería configuración E/Z de coordenadas para enlaces no marcados. Fix mínimo: exigir el flag antes de mostrar el paso E/Z; positivo explícito y negativo no marcado.
- **DIFFICULTY-D3-REASON-002:** el nombre EN legacy con locante previo al root no enlazaba la insaturación. Fix de presentación, limitado a una insaturación y un output local disponible exacto: copia los dos spans escritos de locante/morfema con el mismo ID semántico. Regresión double/triple y rechazo de texto no verificado. No modifica nombres, química, scoring ni explicaciones generales.

## S. Reconstruction

V1 fixtures D1 intactos: 26 preguntas/nivel. V2 fixture D2 intacto y nuevo freeze de **26 preguntas por cada nivel**, capturado en HEAD antes del routing D3. Payload SHA incluye molécula, context/generation, MCQ/options/provenance y Build.

Nuevo fixture v3: 26 preguntas, dos procesos ES + uno EN, con Math.random/Date.now prohibidos durante generación. Primera Naming: generationIndex 0, identity `diD@@Ldbbjjjh@@`, SHA256 `c645c135aff0e842b5391d8530edaf0d7050fc26e07c10471fb1ce02b13dd29a`.

Replay explícito ordinal 7/generationIndex 11 bajo v1/v2/v3 reproduce el original en Correction y Review. Usar versión equivocada falla la verificación. No replay histórico a través del current.

## T. Corrections / Attempt Log / Review

Config original serializable determina Difficulty/version; attempts permanecen con su schema existente. Se conservan first attempt/initial results, attemptNumber 2 y mastery; no regrade en Review. Practice reconstruye; Exam usa su plan congelado. AttemptRecord standalone continúa necesitando SessionConfig: no nuevo campo redundante.

## U. Locale independence

272 contextos químicos repetidos en ES/EN; fixture mixto fresh-process; MCQ conserva options/IDs/orden; Class participant plans ES/EN iguales en grafos/índices. Solo cambia proyección de reference.name/UI. IDs `basic/intermediate/advanced` locale-neutral; no labels en seeds.

## V. Class Seed

CHEM-4B-2026, participant 001, Exam 15, alkane/alcohol, Naming/MCQ/Build. Fingerprint mantiene tuple `class-config-v1`, version y tag non-basic existentes. Seis namespaces version2/3 × difficulty distintos; tres participantes v3 Intermediate repiten planes bilingües.

| Config | Participant seed SHA256 |
|---|---|
| v1 basic antes/después | `0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427` |
| v2 basic antes/después | `a471c87b8da1343ebf2e30c57372d45f824e113aaabb91ebdf506dd9aefaf567` |
| v2 intermediate antes/después | `2da396172e466eb18d14dde9d6cf04aa53b81954bf73ad6b904b2461f0e5b978` |
| v2 advanced antes/después | `56f590cf932881b7fda94157af9a40543aae2d624fd359ad073418d412320498` |
| v3 basic | `5524df95d8efa630e03aaa3475899712d1381a31b4140f2a5ff00fc0e9beda52` |
| v3 intermediate | `11dd1a6449c8b3cd0da01b498a37636d1bd90fb6d310616c8105a14ecbbbd36b` |
| v3 advanced | `8ff52c53157bbf3babc95624f9dd5772fb32ad997fe1c31d3000936ffa1f02f5` |

Fingerprint v1 basic antes/después: `["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],1]`. V2 basic conserva ese tuple con version 2. V3 Intermediate: `["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],3,["difficulty","intermediate"]]`.

SHA/fingerprints completos también en `outputs/difficulty-d3/class-seed.json` y tests. schemaVersion/derivationVersion **1**; sin cambios de archivos Class.

## W. CSV

Mismas 12 columnas/schema 1, BOM UTF-8, CRLF, quote-all, injection protection y orden. Difficulty sigue en fingerprint, version en su columna existente. V1 CSV SHA congelado D1 `08fbce3413b9930618ec00a9f3b7fd93bee54f3a8e884c662ad501164e3c4e85`, idéntico. Los seis hashes v2 (tres difficulties × ES/EN) fueron obtenidos con el modelo de HEAD cargado en memoria y se comparan exactamente en el fixture nuevo. V2 basic ES: `3de5faba7d0393e5407b80ab048f71501dec544060ae74803695ae4db87407b6`.

V3 reconstruye difficulty/version desde las mismas filas. Sin nuevo importer público; se usa el reconstructor existente del export manifest. Sin schema bump ni edición del exporter.

## X. Duplicate integrity / exhaustion

Clave tipo+canonical target graph intacta; no Difficulty/version/locale en dedupe. Cross-type policy y finite/endless history intactas. Se mantiene fallo seguro, sin cambiar categoría/tipo/nivel ni aceptar duplicados. El primer sweep de anillos solo dimetilo agotó 7/8 sesiones: se mejoró diversidad con dos ramas C1/C2 aprobadas por D0. Sweep final sin agotamientos; no implica garantía para cualquier seed/count ni elegibilidad MCQ universal.

## Y. Sweeps

17 categorías × Practice/Exam × dos seeds, cinco Naming por sesión. Accepted cuenta candidatos únicos; duplicate rejects se excluyen del plan. Todos los targets químicos aceptados pasan también ambos oráculos/round-trip.

| Category | Sessions | Candidates | Accepted | Profile rejects | Chemistry rejects | Duplicate rejects | Exhaustions | Violations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| alkane | 4 | 22 | 20 | 0 | 0 | 2 | 0 | 0 |
| alkene | 4 | 23 | 20 | 0 | 0 | 3 | 0 | 0 |
| alkyne | 4 | 25 | 20 | 0 | 0 | 5 | 0 | 0 |
| halogenated | 4 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| alcohol | 4 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| aldehyde | 4 | 21 | 20 | 0 | 0 | 1 | 0 | 0 |
| ketone | 4 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| carboxylic-acid | 4 | 21 | 20 | 0 | 0 | 1 | 0 | 0 |
| ether | 4 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| ester | 4 | 21 | 20 | 0 | 0 | 1 | 0 | 0 |
| amine | 4 | 23 | 20 | 0 | 0 | 3 | 0 | 0 |
| amide | 4 | 21 | 20 | 0 | 0 | 1 | 0 | 0 |
| simple-carbocycle | 4 | 24 | 20 | 0 | 0 | 4 | 0 | 0 |
| aromatic | 4 | 22 | 20 | 0 | 0 | 2 | 0 | 0 |
| ez | 4 | 24 | 20 | 0 | 0 | 4 | 0 | 0 |
| nitrile | 4 | 21 | 20 | 0 | 0 | 1 | 0 | 0 |
| nitro | 4 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **68** | **368** | **340** | **0** | **0** | **28** | **0** | **0** |

Rechazos oracle/domain: **0**. Sweep químico independiente: **272 targets**, 17×8×2; MCQ **34 aceptadas**. Artefactos ignorados: chemical/session/mcq-sweep.json.

## Z. Performance

Construcción directa; todos los candidatos químicos de sweeps aceptados en intento 0. No se aumenta ningún límite: químicos 16, ordinarios 4, MCQ 12, Endless 8. Máximo retry de selección aceptada 3. En la ejecución integral: sweep químico repetido/locale/Build ~54.32 s; finito ~24.62 s. Estas duraciones incluyen comprobaciones adicionales y dependen de carga; no constituyen benchmark comparativo.

## AA. Regression suite

Compatibilidad/model/seed/domain/Easy/D1/Class/CSV/Practice/Build: **178 pass**. PRACTICE-007B, PRACTICE-008, REASON-UNSAT-001/navigation, Reviewer, Exam UI y distractors: **96 pass**. Certificación D3 + nueva regresión EN + Build: **81 pass**; tres tests añadidos de prioridad/self-accept/replay: **3 pass**. Total de esas ejecuciones focalizadas **358 pass**, 0 fail (incluye cobertura que se repite entre suites). Las corridas de desarrollo anteriores aislaron los errores corregidos; no se presentan como corridas finales verdes.

Fixtures históricos no reemplazados. D2 lifecycle inputs fijados a v2 explícito; tests de current ahora esperan 3 y unknown version 4. D0/D1/D2 docs intactos.

## AB. Full validation

`npm test`: **2.271 tests, 2.266 pass, 0 fail, 5 skips preexistentes, 0 cancelled**; `1217392.2793 ms` (~20 min 17 s). Una ejecución integral completa, tras focalizados finales verdes. Los skips son los cinco casos ESTER silver ya conocidos sin exact naming oracle; ninguna prueba D3 se omite.

`npm run build`: exit **0**, Worker ESM `default.fetch` y hosting manifest verificados. Avisos habituales de vinext/Node/chunk; sin errores.

`npm run lint`: exit **0**, **0 errors / 11 warnings preexistentes** en archivos sin cambios D3. Ningún warning nuevo. `git diff --check`: exit **0**; solo avisos de la conversión Git LF→CRLF de tres tests, sin whitespace errors ni normalización ajena.

Git final: `main`, HEAD `0729971` = origin/main, sin staging; **17 modificados + 8 nuevos**, exactamente AC. Stat de archivos existentes: **147 inserciones / 49 eliminaciones**; los ocho nuevos no entran en ese stat. Docs D0–D2, fixtures D1/D2 y `app/page.tsx` sin diff.

Los wrappers originales se ejecutaron fuera del sandbox con acceso autorizado y PATH temporal a Git Bash/GNU timeout. El baseline había demostrado problemas del sandbox con procesos hijos. Sin cambios de scripts ni fallback ESLint para el gate global.

ESLint focalizado: exit 0. Audit TypeScript compiler-host contra HEAD: **32 baseline = 32 actuales**, added/removed 0; DIFFICULTY-D1-AUDIT-001 continúa fuera de scope. Se corrigió únicamente el tipo de orden de enlace introducido por D3.

## AC. Files changed

- `app/exercise-model.ts`
- `app/exercise-generation-profile.ts` (nuevo)
- `app/exercise-intermediate-candidate.ts` (nuevo)
- `app/exercise-intermediate-profile.ts` (nuevo)
- `app/exercise-domain.ts`
- `app/exercise-chemical-generator.ts`
- `app/exercise-chemistry-oracles.ts`
- `app/practice-distractor-engine.ts`
- `app/practice-distractor-recipes.ts`
- `app/practice-structural-answer.ts`
- `app/practice-review.ts`
- `app/reasoning-name-fragments.ts`
- `tests/difficulty-intermediate.test.mjs` (nuevo)
- `tests/difficulty-intermediate-session.test.mjs` (nuevo)
- `tests/fixtures/difficulty-d3-frozen-v2-session.json` (nuevo)
- `tests/fixtures/difficulty-d3-intermediate-session.json` (nuevo)
- `tests/difficulty-easy.test.mjs`
- `tests/difficulty-easy-session.test.mjs`
- `tests/difficulty-plumbing.test.mjs`
- `tests/exercise-model.test.mjs`
- `tests/exercise-seed.test.mjs`
- `tests/class-assignment.test.mjs`
- `tests/practice-session.test.mjs`
- `tests/reasoning-name-fragments.test.mjs`
- `docs/difficulty-d3-intermediate.md` (nuevo)

## AD. Out of scope / final state

Sin química Hard, generación multifuncional arbitraria, en+in, diol/diona, selector público Difficulty, nuevas recipes MCQ, dominio Hard Build, sulfur/heterocycles/R/S ni cleanup TypeScript ajeno. Namer, editor, identity/equality, i18n, `.quimica`, `app/page.tsx` y scripts no modificados. Sin commit, sin push; HEAD/branch conservados.

DIFFICULTY D3 COMPLETE — INTERMEDIATE CHEMISTRY CERTIFIED
