# Difficulty D4.2A — Hard functional coverage

Cinco familias de admisión optativas; no recetas de producción. La foundation pasa de ocho a trece anclas de categoría. D5 sigue necesitando D4.2B, producción versionada y sus gates de tipos.

## A. Baseline

HEAD = origin/main `af7edeb8e3580faaa4560f8397dde6f7d2b571ce`, branch `main`, working tree inicialmente limpio. D0–D4.1 y el informe de bloqueo D5 están committeados; los siete documentos se leyeron completos. No AGENTS.md aplicable. Node local 24.19.0; CI conserva Node 22.

Current generator **3**, soportados **1/2/3**. Baseline focalizado domain/Build/foundation: **74 pass / 0 fail / 0 skip**, 64.398 s. TypeScript baseline: **32 diagnósticos existentes**. Los diez grafos nuevos, nombres y canonical identities se capturaron antes de editar el perfil.

DIFFICULTY-D5-SCOPE-001: D5 exigía cobertura sin huecos mayores, pero D4 solo admitía ocho categorías. El informe D5 no certificaba ester/amine/amide/nitrile/nitro ni las cuatro categorías topológicas pendientes. Esta solicitud autoriza únicamente resolver las cinco primeras mediante evidencia independiente.

## B. Scope

Solo **ester, amine, amide, nitrile, nitro**. Para cada una se certifica un enyne acíclico con una sola función/ancla central, padre real C6–C9 y cero o un metilo. Una C=C y una C≡C constituyen el trigger Hard; longitud, rama y nitro por sí solos no lo constituyen. Sin composer funcional ni combinaciones multifuncionales nuevas.

## C. Root-cause audit

| Category | D5 blocker | Layer responsible |
|---|---|---|
| ester | Motivo ausente del registry; porción O-alquilo fuera del padre no admitida | Perfil Hard y presupuesto de componentes fuera del padre; Domain publicado solo admite un eje C–C |
| amine | NH2 certificado únicamente como secundario bajo OH/COOH; esas funciones vencen a amine | Registry y ancla principal real; cambiar la categoría de amino-alcohol sería falso |
| amide | Motivo ausente; N debía seguir primaria, sin extrapolar ketone a CONH2 | Registry; oráculos de motivo/valencia/naming, guard de N y padre |
| nitrile | Motivo ausente; guard global de N exigía enlace simple | Registry y guard Hard de N, que rechazaba C≡N; carbono nitrilo debe formar parte del padre |
| nitro | Cualquier carga y cualquier nitro se rechazaban; anchor D0 #4 es Intermediate | Perfil Hard: motivo N+(=O)O−, cobertura de carga y familia independiente; no era un fallo del namer |

Los diez sondeos previos pasaron química, naming support y round-trip bilingüe, pero todos fallaron Hard. Ester/amine/amide/nitrile: `hard-family-not-certified`; nitro: `hard-charge-not-certified`. Los rechazos tempranos ocultaban los guards adicionales descritos arriba.

## D. Certification architecture

`graph → validateExerciseChemistry → detector + reference real → jerarquía compartida → familia explícita + ancla → motivo N/carga → padre/ubicaciones/ramas → Hard evidence → canonical identity/round-trip → Build hard-foundation`.

Se añaden cinco filas al registry existente: `enyne-ester`, `enyne-amine`, `enyne-amide`, `enyne-nitrile`, `enyne-nitro`. Exactamente un motivo central; exactamente un doble y un triple C–C, no cumulados, ambos en el padre. Sin halo ni funciones adicionales. La fila nitro exige exactamente un nitro y ninguna función de sufijo. Las otras diecisiete filas previas/nuevas no admiten nitro incidental.

Solo se modifica `exercise-advanced-profile.ts` en producción. Classifier y factories Build existentes consumen la capacidad sin cambios. No cambia ExerciseDomainPolicy legacy/intermediate, metadata de dominio 1/2, namer, oráculos, equality, routing o generator. Los defaults Build siguen current.

## E. Ester

Grafo representativo: `COC(=O)C=CC(C)C#CC`. Principal **ester**, acilo C7; locante de función 1, C=C en 2, C≡C en 5, metilo en 4. La porción methyl unida al O está fuera del padre y no cuenta como segunda función.

ES: **4-metilhept-2-en-5-inoato de metilo**. EN legacy: **methyl 4-methyl-2-hepten-5-ynoate**. Identidad: `dmTD@@QIev]jZn@@`. Minimum advanced; Build optativo EQUIVALENT tras redraw y round-trip.

Segundo fixture: porción ethyl y acilo sin rama. Solo se admite un O-alquilo saturado C1/C2, ligado mediante el oxígeno del motivo ester al carbono del padre. O-propyl, insaturación alkyl, hydroxy ester y repeated ester se rechazan. No se alteran acyl/alkyl semantics ni nombres.

## F. Amine

Grafo: `CC(N)C=CC(C)C#CC`. Una **NH2 primaria principal**, C2; padre C8, C=C en 3, C≡C en 6 y metilo en 5. ES: **5-metiloct-3-en-6-in-2-amina**. EN: **5-methyl-3-octen-6-yn-2-amine**. Identidad: `def@@@RYv^ijx@@`. Minimum advanced; Build optativo EQUIVALENT.

Variante sin rama: amina terminal en padre C7. No se usa amino-alcohol para fingir category amine: OH y COOH vencen a NH2 y sus anclas reales permanecen. Amina secundaria/terciaria, diamina y combinación con OH continúan fuera de esta familia.

## G. Amide

Grafo: `NC(=O)C=CC(C)C#CC`. **CONH2 principal terminal**, padre C7 incluido el carbonilo, C=C en 2 y C≡C en 5; el C=O no cuenta como eje C–C. ES: **4-metilhept-2-en-5-inamida**. EN: **4-methyl-2-hepten-5-ynamide**. Identidad: ``defH@DAImYvfk`@``. Minimum advanced; Build optativo EQUIVALENT.

Variante sin metilo; N sigue teniendo un único vecino carbono por enlace simple. N-substitution y hydroxy amide son negativos. No se modifica la detección/nomenclatura de amide ni se trata como ketone.

## H. Nitrile

Grafo: `N#CC=CC(C)C#CC`. **Nitrile principal**, carbono C≡N terminal incluido como C1 del padre C7; C=C en 2 y C≡C en 5. ES: **4-metilhept-2-en-5-inonitrilo**. EN: **4-methyl-2-hepten-5-ynenitrile**. Identidad: `diF@@@RUY~Zn@@`. Minimum advanced; Build optativo EQUIVALENT.

Variante sin metilo. El nitrógeno terminal tiene un solo vecino por triple; su carbono tiene únicamente N≡ y un enlace simple al siguiente carbono del padre. C≡N no se suma al triple C–C. Hydroxy nitrile, repeated nitrile y carbono nitrilo sobrevalente se rechazan.

## I. Nitro

Grafo: `CC([N+](=O)[O-])C=CC(C)C#CC`. **Nitro obligatorio como única feature funcional**, sin principal de sufijo. Padre C8; la dirección real favorece ejes 2/5, no el locante nitro: C=C 5, C≡C 2, metilo 4, nitro 7. ES: **4-metil-7-nitrooct-5-en-2-ino**. EN: **4-methyl-7-nitro-5-octen-2-yne**. Identidad: `dcvDAHAHeNR[gYvjZn@@`. Minimum advanced; Build optativo EQUIVALENT.

Variante sin metilo. Solo N+(=O)O−, con un vecino C por enlace simple y oxígenos terminales. Se verifican motif IDs, N/O charges y cobertura de todos los átomos cargados; ninguna otra carga se admite. Dos nitro, nitro+suffix, cargos ausentes/trasladados y orden incorrecto se rechazan. El anchor D0 #4 conserva Intermediate; la mención de ese anchor como Hard en la solicitud no cambia D0/D3/D4.

## J. Category semantics

Ester/amine/amide/nitrile requieren la función principal real según `resolveFunctionalHierarchy`, la misma fuente del namer. Nitro exige su feature y aquí no añade otro sufijo. Los nuevos grafos no se admiten bajo otra categoría funcional ni bajo alkene/alkyne: esas anclas foundation requieren hidrocarburo sin grupos. No hay reassignment de sesiones ni categoría universal nueva.

## K. Difficulty separation

| Fixtures | Easy | Intermediate | Hard | Minimum |
|---|---|---|---|---|
| ester, 2 grafos | false | false | true | advanced |
| amine, 2 grafos | false | false | true | advanced |
| amide, 2 grafos | false | false | true | advanced |
| nitrile, 2 grafos | false | false | true | advanced |
| nitro, 2 grafos | false | false | true | advanced |

La pérdida de cualquiera de los dos ejes en cada grafo devuelve Intermediate y es una respuesta Build válida incorrecta. El trigger son dos ejes C–C sobre el padre, no nombre, chain length, C=O/C≡N, rama ni número de heteroátomos.

## L. Functional priority

Sin nueva tabla de prioridad ni pairings multifuncionales. Los cuatro sufijos tienen una sola instancia reconocida; nitro tiene suffixEligible false. Tests comparan jerarquía, principal, locantes y coverage del modelo real. Controles OH+NH2 y COOH+NH2 rechazan category amine. Los pairings D4 y sus expected históricos siguen intactos.

## M. Valence

Los diez positivos pasan schema/conectividad y el oracle real, antes de naming, y revalidan al importar el round-trip. Negativo nuevo: añadir un enlace C al carbono terminal C≡N produce `invalid-valence`. D0 triple+Br sigue sobrevalente/rechazado. N primaria, amide N, carbonilo/O ester y nitro canónico se verifican sin relajar valencia. Los veinte negativos estructurales adicionales cubren combinaciones fuera del scope; mutaciones separadas prueban charge/stereo/oracle fail-closed.

## N. Domain/oracles

Se expande solo la admisión optativa Hard. Dominio de producción permanece frozen: cada positivo nuevo rechaza legacy e Intermediate. Sin aceptar cualquier grafo nombrable. Motifs del detector y del English model, parent, principal, namingSupported, ES/EN disponibles y heteroátomos cubiertos siguen obligatorios. Fallos de reference/valence/detector o evidencia contradictoria cierran admisión.

## O. Build

Diez targets × copia/redraw/round-trip: EQUIVALENT. IDs nuevos, arrays/enlaces invertidos, rotación/escala/translación conservan identidad y nombres; el original no se muta. Veinte cambios de bond order siguen siendo submissions válidas, incorrectas `DIFFERENT_BOND_ORDERS`; cinco isómeros de locante dan `DIFFERENT_STRUCTURE`. Eliminar nitro deja un enyne hidrocarbonado seguro y devuelve `DIFFERENT_ELEMENTS`.

La validación neutral no recibe target ni impone difficulty del target al alumno. Current validator rechaza los diez targets y current evaluator devuelve UNSUPPORTED_COMPARISON. Sin cambiar editor, igualdad OCL, estereo explícito, tolerancias o comparación por nombre/coordenadas.

## P. Namer ES/EN

Diez expected exactos, congelados desde grafos independientes previos al cambio. ES local-systematic y EN iupac-1979-legacy; sin templates de nombres de generación ni conversión textual de referencias. Ambos idiomas y fórmula coinciden tras round-trip; canonical identities son estables. Fixture permanente: [difficulty-d4-2a-hard-functional.json](../tests/fixtures/difficulty-d4-2a-hard-functional.json), incluidos todos los nombres, grupos/locantes, parent count, ejes y Build support.

## Q. Reviewer compatibility

Los diez grafos entran manualmente a ReviewModel en ES/EN, con identidad Question/Attempt coherente, status CORRECT, cero issues, principal/prefijos consistentes, dos pasos de insaturación, highlights válidos y ninguna enseñanza E/Z sin flag. Nitro aparece como prefix; ester conserva su porción O-alquilo en la evidencia existente.

No se presentan estas preguntas manuales como sesiones Hard producidas. DIFFICULTY-D4-REASON-001 sigue pendiente D7: links textuales EN legacy de enyne; tampoco se añade diagnóstico pedagógico de Hard. No bug independiente nuevo corregido silenciosamente. Los errores iniciales de tests nuevos fueron comparación de undefined omitido por JSON y params.name localizado; corregidos sin tocar química ni expected names.

## R. Frozen generation

| Version | Evidence | Result |
|---|---|---|
| 1 | D1 tres niveles, 26 preguntas/nivel | Exactos |
| 2 | D2 Easy y D3 freeze tres niveles | Exactos |
| 3 | D3 Intermediate y D4 freeze tres niveles ES/EN fresh-process | Exactos; D4 fresh-process 57.014 s |

Se comparan planes, generationIndex, structuralIdentity y payload SHA completos, que incluyen orden/IDs/provenance MCQ y targets Build. Ningún expected histórico cambiado. V1 basic índice 0 conserva fixture `gJP@DjZh@`, SHA256 `32721d5a075b536ede7e6a816aac07a9390fa5d1c01207e876f9286ee5abaa8f`; la validación final verifica igualdad real. No se introduce version 4.

## S. Practice/Exam

Routing/candidates/session/UI sin diff. Advanced de v1/v2/v3 sigue legacy; current generator **3**. Freeze y lifecycle originales protegen finite/Endless, mixed Naming/MCQ/Build, locale/reconstruction/corrections/Review, drafts/nav, revisión neutral pre-submit y grading atómico. No nueva pista de category/difficulty, selector o target en editor Exam. PRACTICE-007B y PRACTICE-008 permanecen en critical/full; REASON-UNSAT-001 se ejecuta focalizado/full.

## T. Class Seed / CSV

Sin cambios de fuentes, fingerprints, participant seed derivation o export. **DerivationVersion = 1, schemaVersion = 1**, doce columnas, BOM UTF-8, CRLF, quote-all, protección de fórmula y orden preservados. Tests D4 comparan nueve configs CHEM-4B-2026, seeds/fingerprints completos, reconstruction y dieciocho hashes CSV ES/EN v1/v2/v3.

V1 basic fingerprint histórico: `["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],1]`. Participant 001 SHA256 `0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427`; CSV ES `08fbce3413b9930618ec00a9f3b7fd93bee54f3a8e884c662ad501164e3c4e85`. Expected y fixtures anteriores intactos; resultados finales en Y.

## U. D4.1 safety gate

Workflow y package.json sin cambios: main → critical → full → Pages build → Pages validate → upload → deploy. El test crítico existente de cobertura de familias añade cinco smoke checks al mismo test; no se agrega archivo al critical ni se infla el número de 156 tests. El nuevo archivo funcional detallado corre en full. No se ejecuta deploy local/remoto ni se rediseña CI.

Critical final: **156 pass / 0 fail / 0 skip**, exit 0, **498543.5172 ms** (8 min 19 s). Incluye los fixtures congelados, Class/CSV, PRACTICE-007B/008 y Exam.

## V. Category coverage

| Category | Before D4.2A | After D4.2A | Hard mechanism | ES | EN | Build | READY |
|---|---|---|---|---|---|---|---|
| ester | NOT READY | READY | Enyne en acilo + ester principal | exacto | exacto | opt-in ✓ | Sí |
| amine | NOT READY | READY | Enyne + NH2 principal | exacto | exacto | opt-in ✓ | Sí |
| amide | NOT READY | READY | Enyne + CONH2 principal | exacto | exacto | opt-in ✓ | Sí |
| nitrile | NOT READY | READY | Enyne + C≡N principal incluido en padre | exacto | exacto | opt-in ✓ | Sí |
| nitro | NOT READY | READY | Enyne + nitro obligatorio, sin sufijo | exacto | exacto | opt-in ✓ | Sí |

READY significa foundation estructural y Build optativo, no producción MCQ/sesiones. La prueba combinada reutiliza todos los grafos D4 y los diez nuevos: exactamente trece anclas admitidas.

## W. Remaining D4.2B blockers

Solo **alkane, simple-carbocycle, aromatic, ez** carecen de ruta Hard. Alkane necesita una definición Hard compatible con saturación; anillos/aromáticos requieren familias topológicas; E/Z requiere certificación explícita. No se implementa ninguna aquí. No se reinterpretan ramas simples o enlaces aromáticos como trigger Hard para completar la tabla.

## X. TypeScript/lint

TSC baseline/final: exit 2, **32 existentes / 0 nuevos**, logs textualmente idénticos. DIFFICULTY-D1-AUDIT-001 permanece fuera de scope; no cleanup ni suppressions. ESLint focalizado de perfil/tests: exit 0, sin errores/warnings. `npm run lint`: exit **0**, **0 errors / 11 warnings preexistentes**, todos en archivos sin cambios; ningún warning nuevo.

## Y. Full validation

Focalizados finales: **95 pass / 0 fail / 0 skip**, 228.484 s, en difficulty-hard-functional (35 tests), difficulty-intermediate, practice-distractor-engine y reasoning-name-fragments. Incluye REASON-UNSAT-001. Los 41 tests de foundation previa/modificada también pasaron en critical/full; no se suman estas ejecuciones superpuestas como tests únicos. Baseline inicial 74/0.

`npm run test:critical`: **156 pass / 0 fail / 0 skip**, exit 0, 498.544 s. `npm test`: **2349 tests / 2344 pass / 0 fail / 0 cancelled / 5 skips históricos**, exit **0**, **1950680.6882 ms** (32 min 31 s) del runner. Una sola ejecución integral completada, sin rerun ni incidencia EBUSY. Skips ESTER-0007/0012/0014/0015/0016 silver, sin exact naming oracle; ninguno añadido. PRACTICE-007B, PRACTICE-008, REASON-UNSAT-001 y TEST-CRLF-001 verdes. Fixtures D1/D2/D3/D4 intactos.

`npm run build`: exit **0**, Worker ESM `default.fetch` y hosting manifest verificados. `npm run build:pages`: exit **0**, Vite **1.43 s**, dist-pages. `npm run validate:pages`: exit **0**, **3 entries / 3 assets / base /Hydrocarbon-Lab/**. Advertencias habituales de vinext/Node/chunks, sin errores; no Pages failure.

Git Bash se añadió únicamente al PATH de los procesos test/build/lint; wrappers originales fuera del sandbox con acceso autorizado, como D1–D5. Critical y Pages corrieron en el sandbox. Sin script changes, fallback ESLint o instalación de dependencias. `npm run lint`: exit **0**, **0 errors / 11 warnings existentes**.

`git diff --check`: exit **0**, sin errores de whitespace; avisos habituales LF→CRLF. Los tres archivos nuevos también se comprueban contra /dev/null y mediante lectura UTF-8: sin trailing whitespace; informe con 28 secciones A–AB y sin placeholders. Los diff no-index devuelven 1 por archivos nuevos, sin errores de whitespace.

Git final: **main**, HEAD = origin/main `af7edeb8e3580faaa4560f8397dde6f7d2b571ce`, sin staging, dos archivos existentes modificados y tres nuevos. `git diff --ignore-cr-at-eol --stat`: **2 files changed, 57 insertions / 8 deletions**; no incluye los tres nuevos. La lista completa está en Z. Workflow, package/lockfile, fuentes legacy/intermediate, Class/CSV, namer y todos los fixtures anteriores permanecen sin diff.

## Z. Files changed

Archivos tracked existentes modificados:

- `app/exercise-advanced-profile.ts` — cinco familias y guards de motivos/porciones optativos.
- `tests/difficulty-hard-foundation.test.mjs` — cobertura de todas las familias en el smoke crítico existente.

Archivos nuevos no ignorados, sin staging:

- `tests/difficulty-hard-functional.test.mjs` — certificación, negativos, Category, Build, Reviewer y cobertura 13/17.
- `tests/fixtures/difficulty-d4-2a-hard-functional.json` — diez grafos independientes con evidencia congelada.
- `docs/difficulty-d4-2a-hard-functional-coverage.md` — este informe A–AB.

Ignored/temp bajo `outputs/difficulty-d4-2a`: baseline.log, typecheck-baseline.log, probe.mjs, candidates-before.json/log, candidates-after.json/log, write-fixture.mjs, functional-tests.log, functional-final.log, targeted-regressions.log, targeted-lint.log, targeted-lint-final.log, typecheck-final.log, critical.log, full-suite.log, final-build.log, pages-build.log, pages-validation.log y final-lint.log. Build outputs/caches normales y métricas ignoradas D3 permanecen ignorados. No staging de probes, fixture churn histórico, dependencias nuevas o modificaciones de lockfile.

## AA. D5 readiness after D4.2A

Foundation **13/17**, cinco de cinco nuevas categorías certificadas; **no 17/17**. D5 continúa pendiente de D4.2B y de producción determinista versionada, distractores Hard/tipos, wiring/replay y sweeps. No habilitar advanced público a partir de esta foundation manual. D0–D5 anteriores conservados.

## AB. Out-of-scope confirmation

Sin Hard production generation, generatorVersion 4, Hard alkane, rings/aromáticos/EZ Hard, selector público, functional-group composer, nuevas recipes MCQ, namer/Reviewer polish, cambios de Class/CSV o cleanup TypeScript. Sin comportamiento visible nuevo; no browser audit necesario. **No commit, no push, no staging**. Main/HEAD iniciales conservados.

DIFFICULTY D4.2A COMPLETE — FUNCTIONAL HARD COVERAGE READY
