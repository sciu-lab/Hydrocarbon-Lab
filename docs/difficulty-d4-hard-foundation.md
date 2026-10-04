# Difficulty D4 — Hard foundation

## A. Baseline

HEAD `e4f9d2f1a4a7371911cf5fc407bb1191c014db87`, branch `main`, working tree limpio, HEAD = origin/main. Historial de doce commits confirma D0, D1, D2, D3 y sus fixtures; también REASON-UNSAT-001, PRACTICE-007B y TEST-CRLF-001. Los cuatro documentos D0–D3 se leyeron antes de codificar. No AGENTS.md local.

Current generator **3**, versiones soportadas **1/2/3**. Baseline focalizado domain/Build/D3: **66 pass, 0 fail, 0 skip**, 109.416 s. Captura previa a cambios de producción: 14 grafos D0 y 78 preguntas v3. Logs/probes en outputs/difficulty-d4, ignorados por Git.

## B. Versioning decision

Generator permanece **3**: D4 añade capacidad explícita para grafos manuales y no conecta nuevas recetas. Generador, candidatos, políticas legacy/Intermediate, seeds, MCQ y defaults no se modifican. Domain metadata generado permanece 1/2; no se añade una versión de generación ni de persistencia para esta capacidad optativa.

V1 conserva los tres snapshots D1; v2 conserva D2-basic y D3-all-levels; v3 conserva D3-Intermediate y el nuevo freeze de los tres niveles. Igualdad exacta de plan, generationIndex, structuralIdentity y payload SHA256, incluidos IDs/orden/provenance MCQ y targets Build. No se reemplaza ningún fixture previo.

## C. Hard foundation contract

Admisión por familias explícitas, no score ni producto cartesiano. Grafo conectado válido C/O/N/F/Cl/Br/I; Hard inicial acíclico, neutro, sin R/S ni E/Z marcado. Padre real del namer de C6–C9, todas las funciones de sufijo/secundarias sobre él y todos los C–C múltiples en él. Excepción: una porción methoxy/ethoxy saturada fuera del padre, solo en alkoxy-alcohol.

Máximo una rama metilo, grado C–C ≤3, sin ramas complejas; multiplicidades exactamente dos en carbonos distintos para diol/diona. Funcionalidades y órdenes múltiples limitados por cada fila del registry: 0–1 C=C o C≡C para diol; 0–1 C=C para diona/amino/alkoxy/hydroxy; exactamente una C=C + una C≡C para enyne. Sin ejes cumulados. D4 no certifica diene/diyne. Halo: un Br opcional solo en hydroxy-ketone, y un Br obligatorio en la variante amino-alcohol-enyne. Nitro + Hard sigue pendiente de fixture propio, según D0; no se abre carga genérica.

Trece familias: diol, dione, amino-alcohol, alkoxy-alcohol, hydroxy-aldehyde, hydroxy-ketone, hydroxy-acid, amino-acid, amino-hydroxy-acid, enyne-alcohol, enyne-acid, enyne-hydrocarbon y amino-alcohol-enyne-bromo. Los límites son scope de certificación; longitud no determina Difficulty.

## D. Classification architecture

`classifyMinimumExerciseDifficulty(graph, category, oracles)` devuelve el tipo canónico `basic | intermediate | advanced` o `unsupported`. Reutiliza perfil/padre Easy y Intermediate existentes, y después la admisión Hard explícita. Advanced nunca significa «todo lo que los anteriores rechazan». No hay routing de producción hacia esta API ni parsing de nombres para clasificar.

Controles: butan-2-ol → basic; cadena C12 lineal → basic, no advanced por tamaño; D0 #1–4 → intermediate; #5–14 → advanced; límites no certificados → unsupported. Un oracle con nombres opacos conserva la clasificación del mismo grafo/análisis.

## E. Functional priority

Se reutiliza `resolveFunctionalHierarchy` y `FUNCTIONAL_GROUP_FORMS` de legacy-english-nomenclature, que ya comparte el namer. El oracle expone los grupos/locantes/inclusión en el padre del modelo ya calculado; no añade análisis químico nuevo ni campos a payloads históricos.

Evidencia Hard: principalGroup, principalInstances, secondaryGroups, repeatedFunctions, dos conteos C–C, parent, branchCount y explicitEZ. Acid vence OH/NH2; aldehyde vence OH; ketone vence OH; ether se expresa como alkoxy bajo alcohol. La prioridad no se infiere del texto.

## F. Same-function multiplicity

Diona y diol: dos motivos reales en carbonos distintos del padre, grupo principal repetido y locantes preservados [2,6]. La diona conserva C=C en 3; el diol C≡C en 3. Triol, trione, geminal OH, dos ácidos/aldehídos/aminas no entran.

## G. Multiple different functions

Alcohol + NH2; alcohol + ether; aldehyde + OH; ketone + OH; acid + OH; acid + NH2; acid + ambos. Dos fixtures complementarios certifican hydroxy-acid y amino-acid por separado, además del anchor de tres funciones. Sin N-sustitución, funciones en ramas complejas ni oxo bajo acid/aldehyde.

## H. Unsaturation

C=O y C≡N no cuentan como ejes C–C. Se admite el eje único aprobado por cada familia y enyne en cuatro familias concretas. La variante hidrocarbonada permite evaluar como DIFFERENT una respuesta enyne que omite OH; no obliga a una respuesta segura a conservar la banda/función del target. Valencia del estado final sigue siendo obligatoria.

## I. Category semantics

Categorías de sufijo requieren el principal real: hydroxy-aldehyde pasa aldehyde y falla alcohol; acid+OH+NH2 pasa carboxylic-acid. Feature categories exigen presencia: alkoxy-alcohol puede verificarse bajo alcohol o ether; hydroxy-ketone+Br bajo ketone o halogenated. No se asigna categoría universal al grafo ni se cambia una categoría de sesión.

**Frontera nitro:** D4 enumera el anchor #4 dentro de su corpus de foundation, pero D0/D3 lo definen expresamente Intermediate. Se preserva esa clasificación y se usa como control de frontera: nitro no compite por sufijo. D4 no debilita D3 para hacerlo Hard.

## J. Domain expansion

Antes: comparación neutral legacy ∪ Intermediate, una instancia funcional y como máximo un C–C múltiple. Ahora: esa misma política por defecto, más una capacidad **optativa** `hard-foundation` con las trece familias. No se amplía `ExerciseDomainPolicy` usado por generación/distractores; no se reinterpreta v1/v2/v3.

Los dos factories Build reciben segundo argumento opcional. Sin argumento siguen exactamente el comportamiento D3. Con Hard, prueban primero la unión anterior y luego la familia certificada. Validación neutral no recibe target ni determina corrección; el evaluador usa la categoría solo para admitir la referencia. Editor/UI sin cambios.

## K. Unsupported boundaries

S; R/S; E/Z nuevo multifuncional; iones/cargas arbitrarias; salts/disconnected; heterociclos; rings funcionalizados, fused/bridged/spiro/polycycles; multiplicidad >2; funciones ester/amide/nitrile combinadas; oxo-acid; cumulenes, trienes, diynes/dienes funcionales; Hard + nitro; N secundaria/terciaria y ramas complejas. Se mantienen las capacidades current de monociclo/benceno/EZ; Hard no agrega topologías.

No tautomer, neutralización, salts ni equivalencia por fórmula/nombre. Un grafo válido pero fuera de las familias permanece unsupported.

## L. Manual fixtures

Clasificación desde el grafo; los strings ES/EN son expected nomenclature. Identidades, motivos y locantes están congelados en difficulty-d4-hard-foundation.json. Los nombres ES suministrados no se cambiaron.

| Fixture | Principal group | Secondary groups | Unsaturation | Easy | Intermediate | Hard foundation | Domain | Namer ES | Namer EN | Build |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. 5-metilhex-3-en-2-ol | alcohol | — | 1 C=C / 0 C≡C | No | Sí | No | v2 ✓ | Exacto | 5-methyl-3-hexen-2-ol | ✓ |
| 2. 4-bromo-5-metilhept-3-en-2-ol | alcohol | halo | 1 C=C / 0 C≡C | No | Sí | No | v2 ✓ | Exacto | 4-bromo-5-methyl-3-hepten-2-ol | ✓ |
| 3. 5-cloro-4-metilhex-3-en-2-ona | ketone | halo | 1 C=C / 0 C≡C | No | Sí | No | v2 ✓ | Exacto | 5-chloro-4-methyl-3-hexen-2-one | ✓ |
| 4. 4-metil-5-nitrohex-2-en-1-ol | alcohol | nitro | 1 C=C / 0 C≡C | No | Sí | No | v2 ✓ | Exacto | 4-methyl-5-nitro-2-hexen-1-ol | ✓ |
| 5. 3-etoxi-4-metilhex-1-en-2-ol | alcohol | alkoxy | 1 C=C / 0 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 3-ethoxy-4-methyl-1-hexen-2-ol | ✓ |
| 6. 4-amino-3-metilhex-2-en-1-ol | alcohol | amino | 1 C=C / 0 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 4-amino-3-methyl-2-hexen-1-ol | ✓ |
| 7. 4-hidroxi-3-metilhex-2-enal | aldehyde | hydroxy | 1 C=C / 0 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 4-hydroxy-3-methyl-2-hexenal | ✓ |
| 8. 6-bromo-5-hidroxi-4-metilhept-3-en-2-ona | ketone | hydroxy, halo | 1 C=C / 0 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 6-bromo-5-hydroxy-4-methyl-3-hepten-2-one | ✓ |
| 9. ácido 5-amino-4-hidroxi-3-metilhex-2-enoico | carboxylicAcid | hydroxy, amino | 1 C=C / 0 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 5-amino-4-hydroxy-3-methyl-2-hexenoic acid | ✓ |
| 10. 3-metilhept-3-en-2,6-diona | ketone ×2 | — | 1 C=C / 0 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 3-methyl-3-hepten-2,6-dione | ✓ |
| 11. 5-metilhept-3-in-2,6-diol | alcohol ×2 | — | 0 C=C / 1 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 5-methyl-3-heptyn-2,6-diol | ✓ |
| 12. 5-metiloct-3-en-6-in-2-ol | alcohol | — | 1 C=C / 1 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 5-methyl-3-octen-6-yn-2-ol | ✓ |
| 13. ácido 4-metilhept-2-en-5-inoico | carboxylicAcid | — | 1 C=C / 1 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 4-methyl-2-hepten-5-ynoic acid | ✓ |
| 14. 4-amino-5-bromo-3-metilhept-2-en-6-in-1-ol | alcohol | amino, halo | 1 C=C / 1 C≡C | No | No | Sí | Hard opt-in ✓ | Exacto | 4-amino-5-bromo-3-methyl-2-hepten-6-yn-1-ol | ✓ |

Cuatro controles Intermediate y diez anchors Hard. Tres fixtures adicionales congelados: hydroxy-acid, amino-acid y enyne-hydrocarbon; cubren las trece familias sin producción aleatoria.

## M. Valence

Todos los anchors positivos pasan schema/conectividad/oracle real de valencia, perfil y round-trip. El triple+Br `CC(O)C#C(Br)C(C)CC` conserva rechazo invalid-valence (carbono sp usado 5). Importer SMILES ya rechaza amonio/alkoxide; mutaciones de carga en grafos también se rechazan. Ninguna tabla de valencia copiada ni guard relajado.

## N. Chemistry oracles

Reutilización de analyzeMolecule, detectFunctionalGroups, valence oracle, English model y naming-supported guard reales. Única metadata nueva: copia de model.functionalGroups ya disponible. Hard verifica coherencia de motivos del detector/modelo, prioridad, cobertura de heteroátomos, parent y resultado bilingüe. Fallos de oracle cierran admisión.

## O. Namer

Sin cambios de namer ni parser/constructor por nombre. ES sistemático y EN 1979 exactos en los catorce anchors; diol/diona y locantes de función/insaturación conservados. Grafos independientes por SMILES, no generación por catálogo de nombres o servicio remoto. Nombre e identidad repiten tras round-trip.

## P. Build

`createBuildSubmissionValidator(oracles, "hard-foundation")` y `createStructuralAnswerEvaluator(oracles, "hard-foundation")` admiten los targets manuales. Comparación existente: constitución canónica OCL de elementos/cargas/órdenes + E/Z separado; sin nombre/SMILES textual/coords/orientación.

Copias, IDs remapeados, arrays invertidos, rotación/escala y reconstrucción SMILES → EQUIVALENT. Remover rama, mover OH, cambiar C=C o quitar función → DIFFERENT para grafos dentro del dominio seguro. Respuesta elemental equivocada permanece válida. Invocación por tipo Build y creación de AttemptRecord/Review probadas sin iniciar sesiones Hard.

## Q. Reviewer / reasoning

Diez targets Hard manuales → ReviewModel correcto en ES/EN, referencias coherentes, prioridad/locantes/multiplicidad, highlights/bonds válidos y pasos por cada eje. Ningún paso E/Z por coordenadas no marcadas. Sin cambios de Reviewer, reasoning o i18n.

**DIFFICULTY-D4-REASON-001 — D7 follow-up, preexistente:** nombres EN legacy enyne de #12–14 no emiten links semánticos individuales en el texto del nombre; el adaptador D3 deliberadamente cubre una sola insaturación. ES enyne, EN de eje único y las contribuciones estructuradas/highlights de ambos idiomas siguen correctos. Evidence en reasoning-audit.json. No se oculta el gap ni se publica Hard; D7 debe extender ese mapping con provenance antes de release. Reviewer completo de prioridad/multiplicadores/prefijos y diagnóstico causal también sigue siendo D7.

## R. Generation freeze

| Version | Captures compared | Result |
|---|---|---|
| 1 | D1 basic + intermediate + advanced, 26 preguntas/nivel | Exactos |
| 2 | D2 basic + D3 all-levels, 26 preguntas/nivel | Exactos |
| 3 | D3 Intermediate + D4 all-levels, 26 preguntas/nivel, procesos nuevos ES/EN | Exactos |

Math.random/Date.now prohibidos durante captures. Ejemplo v1 basic Naming índice 0: identity `gJP@DjZh@`, payload SHA256 `32721d5a075b536ede7e6a816aac07a9390fa5d1c01207e876f9286ee5abaa8f`, idéntico. V3 Intermediate índice 0: `diD@@Ldbbjjjh@@`, SHA256 `c645c135aff0e842b5391d8530edaf0d7050fc26e07c10471fb1ce02b13dd29a`, idéntico. Fixture expectations históricos intactos.

## S. Practice / Exam

Finitas/mixed, Endless 24 con ventana ≤8, drafts/Previous/Next, neutral pre-submit review, grading atómico, locale, corrections/replay ordinal 7/index 11 y Session Review pasan regresiones D1/D2/D3. Sin cambio de UI ni filtración pre-submit.

Todos los versions advanced siguen routed a legacy; prueba explícita de output/domain legacy para los 17 temas y snapshots mixtos exactos. **HARD FOUNDATION READY / HARD GENERATION NOT CERTIFIED**. Targets manuales no se presentan como sesiones advanced reproducibles: D5 necesita sus recetas/version nuevo.

## T. MCQ

Políticas y recipes sin cambios. Sweep v3 Intermediate **34/34** aceptadas, **0** agotamientos. Opciones/IDs/orden/provenance bilingües y targets congelados en v1/v2/v3. No generación MCQ Hard ni ampliación accidental de distractor domain.

## U. Class Seed

Fuentes model/Class/CSV comprobadas iguales a HEAD al capturar el freeze. Nueve configuraciones CHEM-4B-2026, participantes 001/002, fingerprints/semillas completos exactos; basic omitido = explícito. No cambia derivationVersion **1**. Antes/después:

| Configuration | Participant 001 seed SHA256 | CSV ES SHA256 | Before/after |
|---|---|---|---|
| v1 basic | 0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427 | 08fbce3413b9930618ec00a9f3b7fd93bee54f3a8e884c662ad501164e3c4e85 | Idénticos |
| v1 intermediate | 97e8cb566b3e680db09e2765b9e766a76edf1471d24d0e66eeb673c07c954105 | 4b7557f94be34ea38cceca40b6f14bf0b51b67b0154e53912d76676f805b09c4 | Idénticos |
| v1 advanced | 795c14cc78cd2fb466e4147b0fd47402ccae8016656285688734b009fc77d7dc | 597041e5de03e133f5870e4746a7cb4c00c0e3a310817cee7ecd3e9042cc1447 | Idénticos |
| v2 basic | a471c87b8da1343ebf2e30c57372d45f824e113aaabb91ebdf506dd9aefaf567 | 3de5faba7d0393e5407b80ab048f71501dec544060ae74803695ae4db87407b6 | Idénticos |
| v2 intermediate | 2da396172e466eb18d14dde9d6cf04aa53b81954bf73ad6b904b2461f0e5b978 | 80180766ab8fceaff00308c0ff67be1bf25e0c3a4de7f10cdd01f676b8bdc98d | Idénticos |
| v2 advanced | 56f590cf932881b7fda94157af9a40543aae2d624fd359ad073418d412320498 | f00ee86a231c7328f22e127c2faf8c99bb4c80936a0f593f6c0c85b6f2a9840a | Idénticos |
| v3 basic | 5524df95d8efa630e03aaa3475899712d1381a31b4140f2a5ff00fc0e9beda52 | b82a83eeb4600a20d28cf4a20ff004d65888fd95e7c68eeffb6a8557f6a2a0bd | Idénticos |
| v3 intermediate | 11dd1a6449c8b3cd0da01b498a37636d1bd90fb6d310616c8105a14ecbbbd36b | 12130924808d9f16fc775e8f3720ef3de41d21e530483191e0f7a6f99e268b42 | Idénticos |
| v3 advanced | 8ff52c53157bbf3babc95624f9dd5772fb32ad997fe1c31d3000936ffa1f02f5 | b77cd09728d19188aa56b9e570f6baa237421dc8c6f4f5babfba6c9cf6638644 | Idénticos |

Fixture basic histórico: `["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],1]`. V3 solo conserva version 3 en ese campo existente; non-basic conserva su tag Difficulty existente.

## V. CSV

**18 hashes** (v1/v2/v3 × tres IDs × ES/EN) iguales. Mismas 12 columnas, schemaVersion **1**, UTF-8 BOM, CRLF, quote-all, spreadsheet protection y orden. Reconstruction desde filas conserva config/version/difficulty y participante. Sin columna nueva, importer nuevo ni edición del exportador.

## W. D3 sweep regression

Químico: **272 targets**, 17×8×2, repeticiones ES/EN/Build/reference. Finito: **68 sesiones**, **368 candidatos**, **340 únicos aceptados**, **28 duplicados rechazados**, **0 profile/chemistry/oracle rejects**, **0 exhaustions**, **0 violations**. Límites 16/4/12/8 intactos; no memoria ilimitada. Métricas copiadas a outputs/difficulty-d4.

## X. Required regressions

PRACTICE-007B: misma dedupe por questionType + canonical target graph, sin Difficulty en la clave. PRACTICE-008: self-accept bilingual, corrections y grading intactos. REASON-UNSAT-001 y TEST-CRLF-001 verdes en focalizados/full; navegación existente sin modificaciones D4. Fixtures anteriores no regenerados.

## Y. Performance

Sweep químico focalizado antes **43.109 s**, después **35.334 s**; finito después **16.284 s**. Medidas con carga de esta máquina, no benchmark estable; no regresión observada. Generación añade únicamente copia pequeña de metadata ya calculada, sin nuevo análisis/candidatos/retries. El camino Build current tiene la misma validación y cortocircuitos; análisis Hard solo al opt-in. Sin búsqueda funcional combinatoria ni algoritmo nuevo O(n!).

## Z. TypeScript delta

Compiler-host audit contra HEAD: **32 baseline = 32 actuales**, **0 added / 0 removed**. DIFFICULTY-D1-AUDIT-001 sigue preexistente y fuera de scope. No cleanup ni suppressions. Artifact: typecheck-audit.json.

## AA. Full validation

Baseline **66 pass**. Hard final **43 pass, 0 fail, 0 skip**, 50.251 s. Regresiones focalizadas **253 pass, 0 fail, 0 skip**, 516.964 s; algunas se superponen con Hard/freeze. ESLint focalizado exit 0 sin errores/warnings. Corrida inicial Hard aisló comprobaciones de test equivocadas (importer ya rechaza carga; bondIds del API) y la necesidad del dominio enyne-hydrocarbon; no se cambiaron anchors para volver verde.

`npm test` final: **2.314 tests, 2.309 pass, 0 fail, 0 cancelled, cinco skips preexistentes**, exit **0**. Duración del runner: **3.153,471 s** (52 min 33 s). Skips históricos ESTER-0007/0012/0014/0015/0016; ninguno añadido por D4. La segunda integral también pasó las 35 pruebas del archivo afectado por EBUSY en la primera.

`npm run build` final: exit **0**, Worker ESM `default.fetch` y hosting manifest verificados. `npm run lint` final: exit **0**, **0 errors / 11 warnings preexistentes**, sin nuevos warnings D4. `git diff --check`: exit **0**. Sin scripts modificados. Logs full-suite.log, final-build.log y final-lint.log.

**DIFFICULTY-D4-ENV-001 — incidencia ambiental:** primera corrida integral: 2.314 tests, 2.274 pass, 35 fail, cinco skips preexistentes, 0 cancelled; 2.059,891 s. Los 35 fallos provienen de un único before-hook: Windows devolvió EBUSY al optimizer Vite al intentar unlink de node_modules/.vite/deps/react-dom.js.map. El subproceso de ese archivo quedó bloqueado; se verificó su PID/parent/comando y se cerró únicamente ese child para permitir terminar al runner. El mismo archivo aislado pasó 35/35 en 3.791 s, sin cambios. Evidencia first-full-run-ebusy.log y reasoning-failure-isolation.log. Se repitió la integral y pasó el gate final 0 FAIL; esta excepción ambiental explica el segundo npm test. No se borró manualmente caché ni se cambiaron scripts/tests para evitar el fallo.

Wrappers originales con PATH temporal a Git Bash/GNU timeout, ejecución autorizada fuera del sandbox por problemas de procesos hijos/runtime ya comprobados en D1–D3. No cambio de scripts ni fallback inventado. No browser audit: sin cambios visibles.

## AB. Files changed

Existentes modificados:

- app/exercise-chemistry-oracles.ts — evidencia funcional ya calculada.
- app/practice-structural-answer.ts — capacidad Hard optativa, defaults/equivalence intactos.

Nuevos no ignorados:

- app/exercise-advanced-profile.ts — familias, roles, límites y comparison membership.
- app/exercise-difficulty-classification.ts — API central de clasificación mínima.
- tests/difficulty-hard-foundation.test.mjs — corpus, safety, priority, Build y Reviewer.
- tests/difficulty-hard-frozen.test.mjs — procesos nuevos/v3 y Class/CSV v1–v3.
- tests/fixtures/difficulty-d4-hard-foundation.json — 14 anchors + tres extras estructurales.
- tests/fixtures/difficulty-d4-frozen-v3-session.json — 78 preguntas y nueve assignments/18 hashes.
- docs/difficulty-d4-hard-foundation.md — este informe A–AD.

Ignored/temp probes bajo outputs/difficulty-d4 (no Git):

- baseline.log
- capture-baseline.mjs
- capture-baseline.log
- capture-class-and-additional.mjs
- capture-class-and-additional.log
- chemical-sweep.json
- session-sweep.json
- mcq-sweep.json
- hard-tests.log
- hard-profile-final.log
- hard-final.log
- regressions.log
- typecheck.mjs
- typecheck.log
- typecheck-audit.json
- targeted-lint.log
- reasoning-audit.mjs
- reasoning-audit.log
- reasoning-audit.json
- first-full-run-ebusy.log
- reasoning-failure-isolation.log
- full-suite.log
- final-build.log
- final-lint.log
- write-report.mjs

Los tres sweeps D3 se reejecutan usando sus tests originales, que también escriben sus rutas ignoradas outputs/difficulty-d3; D4 guarda copias de sus métricas. Dist/dist-pages/.sites-runtime y caches normales de build siguen ignorados. Sin normalización de app/page.tsx ni archivos ajenos.

## AC. D5 readiness

D5 puede construir un candidate por recipe familiar certificada → química real → validateHardFoundationExercise → referencias/padre/prioridad/multiplicidad → round-trip → Build con capacidad hard-foundation → aceptar. Tiene fixtures independientes, clasificación unsupported explícita y fronteras por familia. Debe introducir recipes deterministas/version nuevo sin mover v1/v2/v3, certificar variantes/slots/seeds y gatear tipos. D4 no garantiza MCQ ni pedagogía completa Hard; D7 conserva sus gates. Nuevas familias/halo/nitro/stereo requerirán su propia evidencia.

## AD. Out of scope / final state

Sin Hard production generation, generatorVersion 4, selector público, arbitrary multifunctional composer, Hard MCQ redesign, Reviewer Hard completo ni cleanup TypeScript. Namer, editor, seeds, generator, Class/CSV, i18n, molecule serialization y docs D0–D3 intactos. Sin commit, sin push, sin staging; HEAD y main conservados. Cambios limitados a los nueve archivos de AB.

DIFFICULTY D4 COMPLETE — HARD FOUNDATION READY FOR CERTIFIED RECIPES
