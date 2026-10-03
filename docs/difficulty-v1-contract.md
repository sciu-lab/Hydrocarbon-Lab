# Difficulty v1 — D0 chemical contract and capability audit

Fecha: 2026-10-03. Estado: contrato recomendado para implementación por fases; **no implementado**. Evidencia de código: `main`, HEAD `cdf7e2a`. «v1» en el título identifica el producto Difficulty; no significa que se haya cambiado `GENERATOR_VERSION = 1`.

## A. Executive summary

El namer está considerablemente más avanzado que el Exercise Generator. Los 14 grafos del corpus manual producen exactamente los nombres ES indicados y referencias EN disponibles al analizarlos con el motor real. Ninguno es aceptado por DomainProfile actual; ninguno pasa la validación de una respuesta Build actual. El generador no produce función + insaturación ni química multifuncional.

**Hallazgo arquitectónico principal:** Difficulty ya existe en `SessionConfig` y en la identidad determinista como `basic | intermediate | advanced`, pero no modifica el contrato químico de las recetas. Practice y Exam solo admiten `basic`; Class Seed lo fuerza y omite Difficulty del fingerprint. Esta fase exige dar semántica química a un campo existente, ampliar un dominio compartido y migrar contratos, no simplemente añadir un selector.

Recomendación: tres bandas químicas independientes de Category, con Category como ancla verificable; generación por familias de recetas validadas y parámetros sembrados; un dominio versionado compartido por generación, distractores, Build y reconstrucción. Easy restringe recetas existentes; Intermediate amplía recetas y dominio; Hard incorpora familias pequeñas explícitas. La publicación de Hard debe esperar validación Build, MCQ y Reviewer, aunque sus implementaciones se desarrollen en fases distintas.

### Baseline técnico

| Comprobación | Resultado |
|---|---|
| `git status` inicial | `main`, sincronizado con `origin/main`, working tree limpio |
| `git branch --show-current` | `main` |
| HEAD | `cdf7e2a test: make formula integration test line-ending agnostic` — TEST-CRLF-001, confirmado por el archivo del diff |
| Commit previo | `7fd9dc6 fix: prevent duplicate exercises in finite sessions` — PRACTICE-007B, confirmado por código, test y documento |
| Commit previo | `99171cb fix: explain unsaturation fragments in naming reasoning` — REASON-UNSAT-001, confirmado por diff y documento |
| Otros dos commits del baseline | `857c5a2 chore: harden release candidate for public beta`; `e2716ee feat: add session review dashboard` |
| Runtime observado | Node `v24.19.0`; requisito del paquete `>=22.13.0` |
| Versiones actuales | generator 1; exercise domain 1; Class schema/derivation 1; Session Review schema 1 |
| Primera validación focalizada | 107 tests PASS, 0 FAIL, 0 SKIP; 138.19 s |
| Segunda validación focalizada | 106 tests PASS, 0 FAIL, 0 SKIP; 21.85 s |

Primera ejecución: `node --test --test-concurrency=1 tests/exercise-model.test.mjs tests/seeded-rng.test.mjs tests/exercise-seed.test.mjs tests/exercise-domain.test.mjs tests/exercise-chemical-generator.test.mjs tests/practice-007b-duplicate-integrity.test.mjs`.

Segunda ejecución: `node --test --test-concurrency=1 tests/reasoning-name-fragments.test.mjs tests/reasoning-functional-group-coverage.test.mjs tests/practice-structural-answer.test.mjs tests/class-assignment.test.mjs tests/class-assignment-csv.test.mjs`.

El sweep existente del generador verificó 17 categorías × 32 semillas = 544 candidatos aceptados: cero fallos, máximo un retry en halogenated y cero en las otras categorías. Sondeos de diversidad: 9–31 identidades distintas por categoría entre esas 32 semillas; **no** es una enumeración del espacio. El sweep Build existente verificó 136 targets, 272 comparaciones y 136 mutaciones.

Se ejecutaron además sondeos de solo lectura, mediante Node por stdin y el helper existente `loadExerciseChemistry`: constructor local de los 14 nombres; análisis de 14 grafos SMILES explícitos; validación química/domain/Build; pasos Lab y Reviewer; control del caso de valencia inválida. No se crearon scripts ni fixtures nuevos. No se ejecutó suite completa, build de aplicación ni lint global: solo se añade documentación. Los tests incluyeron su propia comprobación del bundle del núcleo.

### Archivos inspeccionados

- Modelo y generación: [exercise-model.ts](../app/exercise-model.ts), [exercise-seed.ts](../app/exercise-seed.ts), [seeded-rng.ts](../app/seeded-rng.ts), [exercise-chemical-candidate.ts](../app/exercise-chemical-candidate.ts), [exercise-chemical-generator.ts](../app/exercise-chemical-generator.ts), [exercise-domain.ts](../app/exercise-domain.ts), [exercise-chemistry-oracles.ts](../app/exercise-chemistry-oracles.ts).
- Química y editor, por secciones focalizadas: [page.tsx](../app/page.tsx), [name-to-molecule.ts](../app/name-to-molecule.ts), [double-bond-stereochemistry.ts](../app/double-bond-stereochemistry.ts), [legacy-english-nomenclature.ts](../app/legacy-english-nomenclature.ts), [chemistry-document-validation.ts](../app/chemistry-document-validation.ts). Adaptador SMILES ejercitado: [openchemlib-adapter.ts](../app/openchemlib-adapter.ts).
- Preguntas, evaluación y revisión: [practice-question.ts](../app/practice-question.ts), [practice-multiple-choice.ts](../app/practice-multiple-choice.ts), [practice-distractor-engine.ts](../app/practice-distractor-engine.ts), [practice-distractor-recipes.ts](../app/practice-distractor-recipes.ts), [practice-structural-answer.ts](../app/practice-structural-answer.ts), [session-answer-evaluation.ts](../app/session-answer-evaluation.ts), [practice-review.ts](../app/practice-review.ts), [practice-review-diagnosis.ts](../app/practice-review-diagnosis.ts), [practice-corrections.ts](../app/practice-corrections.ts), [reasoning-functional-groups.ts](../app/reasoning-functional-groups.ts).
- Sesiones y superficies: [session-question-selection.ts](../app/session-question-selection.ts), [practice-session.ts](../app/practice-session.ts), [exam-session.ts](../app/exam-session.ts), [practice-attempt.ts](../app/practice-attempt.ts), [session-review.ts](../app/session-review.ts), [session-review-question.ts](../app/session-review-question.ts), [session-review-dashboard.tsx](../app/session-review-dashboard.tsx), [practice-panel.tsx](../app/practice-panel.tsx), [exam-panel.tsx](../app/exam-panel.tsx), [practice-build-editor.tsx](../app/practice-build-editor.tsx), [practice-molecule-layout.ts](../app/practice-molecule-layout.ts).
- Class: [class-assignment.ts](../app/class-assignment.ts), [class-assignment-csv.ts](../app/class-assignment-csv.ts); referencia de firmas de preview y del puente hacia ClassVariantsPanel.
- Evidencia/test: los once archivos de test ejecutados arriba; [exercise-chemistry.mjs](../tests/helpers/exercise-chemistry.mjs); secciones de `functional-nomenclature.test.mjs`, `reasoning-hierarchy.test.mjs`, `advanced-name-builder.test.mjs` y `practice-review.test.mjs`; [corpus README](../tests/reference-corpus/README.md); [reason-unsat-001.md](reason-unsat-001.md), [practice-007b-duplicate-integrity.md](practice-007b-duplicate-integrity.md); `package.json` y los diffs de los tres commits requeridos.

La inspección de tests adicionales es evidencia estática; no se presenta como ejecución de esos archivos.

## B. Definitions

### Unidad química que se cuenta

Contar **motivos funcionales reconocidos y su papel nomenclatural**, no heteroátomos, enlaces múltiples de cualquier clase ni el tamaño del array `functionalGroups` indiscriminadamente. Un ácido, éster o amida es un motivo, aunque contenga C=O y varios heteroátomos. C=O y C≡N no cuentan como insaturación C–C. Halógenos y nitro son prefijos no competidores: el detector los incluye como grupos, pero no equivalen a una segunda función de sufijo. Un éter sí es una funcionalidad adicional para este contrato aunque siempre se exprese como alkoxy.

«Una función principal» significa un tipo seleccionado para el sufijo; **una sola instancia** es una condición adicional. Dos alcoholes no son Intermediate solo porque compartan tipo. «Múltiples sufijos» se entiende aquí como multiplicidad funcional, por ejemplo diol/diona, o competencia entre familias; el namer elige un tipo principal, no concatena arbitrariamente sufijos diferentes.

### Easy

Una tarea química principal: hidrocarburo saturado sencillo, **o** un solo C=C/C≡C, **o** una única instancia de funcionalidad sobre esqueleto saturado. Sin función + insaturación, enyne, función secundaria, multiplicidad funcional o E/Z explícito.

Recetas Easy propuestas: cero o una rama metilo simple, sin prefijo complejo ni necesidad de reinterpretar una rama como padre más largo; un alcohol/aldehído/cetona/ácido/amina/amida/nitrilo/éster por molécula; un halógeno sobre cadena saturada sin ramas; un nitro canónico sobre cadena saturada sin ramas; un éter simple entre dos porciones lineales saturadas. Para halogen/nitro/ether no añadir la rama opcional en Easy: su prefijo ya es la tarea central. En éster, las dos porciones forman una única función y son parte de la enseñanza de esa categoría.

Se permite una rama simple con una función o una insaturación únicamente en templates revisados cuyo padre y numeración sigan siendo elementales. La regla no autoriza todas las ramas actuales. Si la cadena elegida por el namer contradice el diseño del template, rechazarlo. El número de carbonos limita presentación y valencia disponible, no define la dificultad.

Monociclo saturado y benceno simple: excepciones topológicas explícitas del temario actual, permitidas como una tarea propia; en Easy, sin sustituyentes o con un único metilo sencillo validado. Los tres dobles Kekulé del benceno no son una triena acíclica. E/Z es Intermediate como mínimo: `ez × Easy` se informa incompatible, sin producir un alqueno sin descriptor como sustitución silenciosa.

### Intermediate

Cero o una instancia de función de sufijo, sin otra función competidora ni éter añadido. Puede haber **como máximo un** enlace C–C múltiple: un C=C **o** un C≡C, nunca ambos. Son elegibles rama(s) alquilo simples, un halógeno y/o un nitro no competidor, en templates acíclicos verificados. Halogen/nitro pueden ser el ancla sin función de sufijo. Un éter como única funcionalidad es elegible; éter + alcohol ya es Hard.

Para la primera implementación, limitar a dos ramas metilo/etilo simples, máximo un halo y un nitro, máximo tres ocurrencias de prefijos en total. Estos son presupuestos de alcance de recetas que se deben validar en D3, **no** una fórmula de puntuación pedagógica ni pesos RNG. Se debe exigir al menos una complejidad Intermediate observable: función + insaturación, sustitución/orientación adicional a Easy, múltiples prefijos simples o E/Z explícito. Evitar llamar Intermediate a una cadena lineal más larga con la misma tarea Easy.

Los fixtures 1–4 son ejemplos centrales. E/Z puede ampliarse a una única C=C configurada en una receta aprobada, conservando semántica de estereoquímica explícita. Sus verificaciones Build/MCQ/Review forman parte de la habilitación; no se infiere configuración del dibujo.

### Hard

Química multifuncional **o** complejidad de insaturación múltiple: al menos dos instancias de funcionalidad, iguales o diferentes, incluida una función como prefijo; **o** al menos dos enlaces múltiples C–C, con enyne/diene/diyne. Este segundo criterio hace Hard a los fixtures 12 y 13 aun cuando tengan una sola función. Sin él, el contrato solicitado dejaría estos casos fuera de las tres bandas.

Los halógenos/nitro por sí solos no convierten una molécula en Hard. Una cadena con un alcohol, un C=C y un nitro sigue siendo Intermediate. Alcohol + amino, alcohol + ether, aldehído + hydroxy, ketone + hydroxy, acid + hydroxy/amino, diol y diona sí satisfacen Hard. Pueden coexistir ramas, halo/nitro y enlaces múltiples dentro de cada template aprobado. Una molécula Hard no necesita reunir todas las features.

Scope inicial recomendado: máximo tres instancias funcionales, máximo dos enlaces múltiples C–C, máximo dos ramas alquilo simples y dos prefijos halo/nitro combinados. Las familias concretas de S son la lista de admisión; estos máximos no autorizan su producto cartesiano. Complejidad por competencia funcional, multiplicadores, locantes y orden alfabético; sin ponderaciones aleatorias de dificultad.

## C. Difficulty invariants

1. Category describe contenido/ancla; Difficulty describe la envolvente química. Tipo de pregunta, idioma y política Practice/Exam no reclasifican el grafo.
2. Una única banda por sesión v1. No mezclar niveles sin un futuro contrato de distribución, fingerprint y reporte.
3. La admisión se verifica contra el **grafo final analizado**, no contra el nombre de la receta ni la longitud prevista del padre.
4. Las bandas de targets son distinguibles: Easy sin triggers superiores; Intermediate con trigger estructural y sin trigger Hard; Hard con trigger multifuncional o multiinsaturación. La capacidad de nombrar una molécula no la asigna automáticamente a una banda.
5. Ninguna banda relaja valencia, conectividad, soporte bilingüe, identidad, round-trip ni precisión del grading.
6. Cambiar Difficulty puede cambiar la secuencia; misma configuración normalizada, banda, semilla, versión e índice reproduce preguntas, targets y opciones. Los retries consumen subsemillas deterministas aisladas.
7. Locale cambia presentación, no química. La identidad de sesión completa puede seguir siendo locale-sensitive conforme a v1.
8. No sustituir categoría, tipo ni nivel para completar una sesión. Combinaciones no soportadas fallan de forma explícita antes del inicio; agotamiento durante selección conserva su fallo seguro.
9. Dedupe usa tipo de pregunta + identidad del target final. Difficulty no se añade a esa clave para permitir repetir el mismo ejercicio.
10. Las respuestas Build químicamente válidas pero equivocadas no deben convertirse en «inválidas» por no satisfacer la banda del target. Separar dominio de comparación seguro de constraints pedagógicos de generación.
11. Ninguna referencia, explicación, fórmula del target Build ni diagnóstico del grader se expone antes de entregar Exam. El selector de Difficulty solo comunica el alcance elegido.
12. Esta fase solo crea este documento; no modifica código, tests, versiones ni UI, y no crea commit/push.

## D. Category semantics

Hoy Category es una **mezcla comprobable**:

| Familia actual | Semántica efectiva en el validador |
|---|---|
| alcohol, aldehyde, ketone, acid, ester, amine, amide, nitrile | Motivo obligatorio, exactamente una instancia y ningún otro grupo; generalmente función de sufijo |
| ether, nitro, halogenated | Feature/patrón obligatorio, aunque no selecciona sufijo; halogenated admite varias instancias |
| alkane, alkene, alkyne | Familia de hidrocarburo con restricciones de insaturación y sin grupos detectados |
| simple-carbocycle, aromatic | Topología obligatoria y sin grupos funcionales |
| ez | Feature estereoquímica explícita obligatoria de una C=C acíclica |

Además, la categoría selecciona una recipe family. No es solo una etiqueta del UI: `validateExerciseDomain` vuelve a verificarla. No existe actualmente `ExerciseGenerationContext` con ese nombre; el contexto está distribuido entre `SessionConfig`, `QuestionIdentity`, argumentos de generación y `generation` metadata.

**Evolución mínima recomendada:** conservar los 17 IDs; añadir internamente política de ancla por categoría y contexto de admisión con Difficulty/version. Categorías de sufijo obligan a que el namer seleccione esa función principal. Las categorías prefijo/topología/stereo exigen la feature y un template compatible. Conservar recipe family como mecanismo de producción, no como significado pedagógico único.

Alcohol + Hard: alcohol debe seguir siendo el sufijo principal; admite diol, amino/alkoxy subordinados y enyne. No generar ácido + hydroxy bajo Alcohol: debe pertenecer a `carboxylic-acid`. Ketone + Hard puede tener diona, hydroxy o amino, pero no un ácido que relegue ketone a oxo. Esta regla conserva el contenido central de la pregunta y evita que una categoría desaparezca del sufijo sin advertencia.

Halogenated y nitro pueden tener una función principal distinta si mantienen su feature requerida; ether puede tener otra función y pasar a alkoxy en Hard. Alkene/alkyne pueden ampliar a polyene/enyne hidrocarburos sin función de sufijo. `alkane` conserva hidrocarburo saturado: Hard no tiene template v1 con el trigger químico propuesto. Simple-carbocycle/aromatic Hard quedan pendientes de auditoría y fuera del release inicial. Ortogonalidad conceptual no implica que todas las 51 celdas sean soportadas.

El mismo grafo puede satisfacer anclas distintas. No intentar asignarle categoría universal única; el selector ya puede deduplicarlo por estructura y tipo independientemente de su recipe family.

## E. Feature matrix

«Sí» significa permitido por contrato, sujeto a recetas y validación; no generación disponible hoy. «Central» significa posible trigger Hard, no obligación de todas las preguntas. Hard inicial se restringe además por S.

| Feature | Easy | Intermediate | Hard |
|---|---|---|---|
| saturated chain | Sí | Sí, con trigger adicional | Sí, si multifuncional |
| branching | 0–1 metilo simple en template elemental | Ramas metilo/etilo simples acotadas | Simples y acotadas v1; complejas excluidas |
| C=C | Uno, sin función adicional | Uno, puede acompañar una función | Sí |
| C≡C | Uno, sin función adicional | Uno, puede acompañar una función | Sí |
| C=C + C≡C | No | No | Central, enyne |
| multiple C=C | No; benceno es excepción topológica | No; benceno es excepción topológica | Central, diene acíclico v1 |
| multiple C≡C | No | No | Central, diyne acíclico v1 |
| one functional group | Sí, esqueleto saturado | Sí, con complejidad adicional | Sí, si multiinsaturación |
| repeated same functional group | No | No | Central: diol/diona iniciales |
| multiple different functional groups | No | No, salvo prefijos no competidores halo/nitro | Central; familias admitidas |
| halogens | Uno como contenido central | Sí, prefijo no competidor | Sí, sin ser trigger por sí solo |
| nitro | Uno como contenido central | Sí, prefijo no competidor, carga canónica | Sí, con motivo validado |
| amino | Una amina principal, sin otras funciones | Una amina principal, sin otras funciones | Prefijo subordinado a función superior |
| hydroxy prefix | No | No | Sí, bajo aldehyde/ketone/acid aprobados |
| alkoxy | Un éter simple como contenido central | Éter como única funcionalidad | Ether + función distinta: Hard |
| oxo | No | No | Potencial; acid/aldehyde + ketone requiere auditoría antes de v1 |
| E/Z | No explícito | Una C=C explícita verificada | Potencial; expansión multifuncional diferida inicialmente |
| suffix competition | No | No | Central para familias diferentes |
| functional priority | Reconocer sufijo único | Sufijo antes de insaturación/prefijos no competidores | Elegir función principal entre familias |
| multiplicative suffixes | No | No | Central: diol/diona; otros diferidos |

## F. Current generator capability

Fuente constructiva: `buildExerciseChemicalCandidate`; fuente de aceptación: `validateExerciseDomain`. Los rangos son **codificados para construcción**, no límites del padre que el namer finalmente seleccione. Todos generan conectividad única; ningún target funcional se ramifica hoy, salvo halogenated, que usa las ramas hidrocarbonadas.

### Las 17 categorías: grafo y features actuales

`FG` cuenta motivos del detector; para ether/halogen/nitro se especifica que son prefijos. `C=C/C≡C` en la tabla son enlaces carbono–carbono, no C=O ni C≡N. `B` significa ramas alquilo simples metilo/etilo, hasta tres sitios interiores. No hay funciones + insaturación ni funciones distintas en ninguna fila.

| Category | Estructuras producidas / carbonos construidos | FG | Ramificación / sustituyentes | C=C | C≡C | Función + insaturación | >1 función | E/Z |
|---|---|---|---|---|---|---|---|---|
| alkane | Cadena C1–10; total C1–16 con B | 0 | B, 0–3 | No | No | No | No | No |
| alkene | Cadena C2–10; total hasta C16 | 0 | B, evita ambos carbonos del doble | Exactamente 1 | No | No | No | No explícito |
| alkyne | Cadena C2–10; total hasta C16 | 0 | B, evita ambos carbonos del triple | No | Exactamente 1 | No | No | No |
| halogenated | Cadena C2–10; total hasta C16; halo en sitios con valencia disponible | 1–3 halogen | B + F/Cl/Br/I, admite repetición de sitio y elemento | No | No | No | Solo varios halo, no sufijos múltiples | No |
| alcohol | Cadena lineal C2–10, OH en cualquier carbono | 1 alcohol | Sin ramas ni otros prefijos | No | No | No | No | No |
| aldehyde | Lineal C2–10, carbonilo terminal | 1 aldehyde | Ninguno | No | No | No | No | No |
| ketone | Lineal C3–10, carbonilo interior | 1 ketone | Ninguno | No | No | No | No | No |
| carboxylic-acid | Lineal C2–10, COOH terminal | 1 acid | Ninguno | No | No | No | No | No |
| ether | Dos cadenas lineales C1–6 y C1–4 conectadas por O; total C2–10 | 1 ether, prefix-only | Alkoxy inherente; sin ramas de carbono | No | No | No | No | No |
| ester | Porción acilo C2–6 y O-alquilo C1–4; total C3–10 | 1 ester | O-alquilo inherente; sin ramas | No | No | No | No | No |
| amine | Lineal C2–10, NH2 en cualquier carbono | 1 amine | Solo primaria; sin N-sustitución | No | No | No | No | No |
| amide | Lineal C2–10, CONH2 terminal | 1 amide | Solo primaria; sin N-sustitución | No | No | No | No | No |
| simple-carbocycle | Anillo saturado C5/C6 + 0–3 alquilos C1/C2; total C5–12 | 0 | 0–3 metilo/etilo en sitios distintos | No | No | No | No | No |
| aromatic | Benceno C6 + 0–3 alquilos C1/C2; total C6–12 | 0 | 0–3 metilo/etilo en sitios distintos | 3 Kekulé, no alquenos independientes | No | No | No | No |
| ez | Lineal C4–10, doble interno en posición índice 1…length−3 | 0 | Ninguno | Exactamente 1 | No | No | No | Exactamente 1 explícito, E o Z |
| nitrile | Lineal C2–10; carbono terminal incluido en C≡N | 1 nitrile | Ninguno | No | No C–C triple | No | No | No |
| nitro | Lineal C2–10, N+(=O)O− sobre cualquier carbono | 1 nitro, prefix-only | Ninguno adicional | No | No | No | No | No |

Las cotas superiores con B son posibles en construcción, no una afirmación de frecuencia ni de aceptación exhaustiva. `branches()` usa sitios internos y puede generar una elección de padre distinta de la cadena construida; por eso Easy exige observar la cadena analizada.

### Encaje actual en las bandas y gaps por categoría

«Subset» exige filtrar recetas actuales; «Parcial» son ejemplos estructurales Intermediate posibles hoy, sin política que los separe. Hard es No en todas las filas bajo B: múltiples halógenos no son química multifuncional competidora.

| Category | Easy actual | Intermediate actual | Hard actual | Qué falta |
|---|---|---|---|---|
| alkane | Subset sin ramas o rama elemental | Parcial: múltiples ramas/orientación | No | Constraints y prueba de padre; Hard v1 no disponible |
| alkene | Subset sencillo | Parcial: ramas/locantes | No | Constraints; halo/nitro combinados; polyene/enyne aprobados |
| alkyne | Subset sencillo | Parcial: ramas/locantes | No | Constraints; sustitución compatible; diyne/enyne |
| halogenated | Subset, un halo sin ramas | Parcial: ramas y varios halos | No | Admisión con función/insaturación; no tratar halo repetido como diol |
| alcohol | Sí, monofuncional saturado | No combinación central | No | Ramas + insaturación + prefijos; diol/amino/alkoxy/enyne |
| aldehyde | Sí | No combinación central | No | Ramas + insaturación; hydroxy subordinado |
| ketone | Sí | No combinación central | No | Ramas + insaturación + halo; diona/hydroxy |
| carboxylic-acid | Sí | No combinación central | No | Ramas + insaturación; hydroxy/amino/enyne |
| ether | Sí, éter lineal único | No trigger actual | No | Ramas/insaturación auditadas; alkoxy bajo alcohol |
| ester | Sí, función única con dos porciones | No trigger actual | No | Ramas y acilo insaturado; multifuncional diferido |
| amine | Sí, primaria única | No trigger actual | No | Ramas/insaturación; repeticiones/multifuncional como sufijo pendientes |
| amide | Sí, primaria única | No trigger actual | No | Ramas/insaturación; multifunction y N-sustitución pendientes |
| simple-carbocycle | Subset básico | Parcial: múltiples ramas | No | Constraints; anillos funcionalizados fuera de v1 |
| aromatic | Subset básico | Parcial: múltiples ramas | No | Constraints; funciones de anillo fuera de v1 |
| ez | No | Sí, tarea stereo independiente | No | Policy mínima Intermediate; stereo con funciones y Hard pendiente |
| nitrile | Sí | No trigger actual | No | Ramas/insaturación auditadas; multifunction pendiente |
| nitro | Sí, único sin ramas | No trigger actual | No | Integración no competidora con otras categorías y motivo de cargas |

### Category × Difficulty conceptual

Etiquetas: **SUPPORTED NOW** = existe al menos una receta actual que produce esa familia; no indica que hoy se pueda seleccionar la banda en Practice. **NAMER ONLY** = evidencia directa o tests inspeccionados del namer, sin receta de ejercicio. **NEEDS GENERATOR WORK** = se requiere receta/dominio incluso si componentes básicos existen. **UNKNOWN / REQUIRES AUDIT** = no se habilita por extrapolación. Cada celda indica lo disponible y lo propuesto, sin garantizar todas las combinaciones.

| Category | Easy | Intermediate | Hard |
|---|---|---|---|
| alkane | SUPPORTED NOW: lineal/rama elemental; filtrar | SUPPORTED NOW: ramas múltiples acotadas | UNKNOWN / REQUIRES AUDIT: sin trigger Hard v1 compatible; deshabilitado |
| alkene | SUPPORTED NOW: un C=C simple | SUPPORTED NOW: ramas; NEEDS GENERATOR WORK: halo/nitro | NAMER ONLY: diene/enyne hidrocarburos; NEEDS GENERATOR WORK |
| alkyne | SUPPORTED NOW: un C≡C simple | SUPPORTED NOW: ramas; NEEDS GENERATOR WORK: halo/nitro | NAMER ONLY: diyne/enyne hidrocarburos; NEEDS GENERATOR WORK |
| halogenated | SUPPORTED NOW: mono-halo saturado | SUPPORTED NOW: múltiples prefijos; NAMER ONLY: halo + función + C=C (#2/#3) | NAMER ONLY: halo con funciones múltiples/enyne (#8/#14); NEEDS GENERATOR WORK |
| alcohol | SUPPORTED NOW: un OH saturado | NAMER ONLY: OH + C=C + rama/halo/nitro (#1–4); NEEDS GENERATOR WORK | NAMER ONLY: diol, amino/alkoxy alcohol, enyne (#5/#6/#11/#12/#14); NEEDS GENERATOR WORK |
| aldehyde | SUPPORTED NOW: un CHO saturado | NAMER ONLY: aldehído insaturado, tests de nomenclatura/reasoning; NEEDS GENERATOR WORK | NAMER ONLY: hydroxy-aldehído (#7); NEEDS GENERATOR WORK |
| ketone | SUPPORTED NOW: una C=O interior | NAMER ONLY: cetona + C=C/halo/rama (#3); NEEDS GENERATOR WORK | NAMER ONLY: diona/hydroxy-cetona (#8/#10); NEEDS GENERATOR WORK |
| carboxylic-acid | SUPPORTED NOW: un COOH | NAMER ONLY: ácido insaturado/ramificado, componentes de #9/#13; NEEDS GENERATOR WORK | NAMER ONLY: amino/hydroxy ácido y enyne ácido (#9/#13); NEEDS GENERATOR WORK |
| ether | SUPPORTED NOW: un enlace éter simple | NEEDS GENERATOR WORK: éter único con rama/insaturación; combinación concreta UNKNOWN / REQUIRES AUDIT | NAMER ONLY: ether como alkoxy bajo alcohol (#5); NEEDS GENERATOR WORK |
| ester | SUPPORTED NOW: éster simple | NAMER ONLY: éster ramificado (test funcional); acilo insaturado UNKNOWN / REQUIRES AUDIT; NEEDS GENERATOR WORK | UNKNOWN / REQUIRES AUDIT: éster + funciones/repetición; excluido inicialmente |
| amine | SUPPORTED NOW: NH2 único | NAMER ONLY: amina ramificada (tests); amina + C=C UNKNOWN / REQUIRES AUDIT por receta; NEEDS GENERATOR WORK | NAMER ONLY: multiplicidad del namer en tests; familias concretas bajo amina UNKNOWN / REQUIRES AUDIT; excluidas inicialmente |
| amide | SUPPORTED NOW: CONH2 único | NEEDS GENERATOR WORK: ramas/insaturación; combinación concreta UNKNOWN / REQUIRES AUDIT | UNKNOWN / REQUIRES AUDIT: amida con otras funciones; excluida inicialmente |
| simple-carbocycle | SUPPORTED NOW: anillo básico | SUPPORTED NOW: anillo con varias ramas | NAMER ONLY: dioles/cetonas cíclicos en tests; envelope Hard UNKNOWN / REQUIRES AUDIT y excluido inicialmente |
| aromatic | SUPPORTED NOW: benceno/monosustituido | SUPPORTED NOW: varios alquilos | NAMER ONLY: polioles/funciones aromáticas en tests; envelope Hard UNKNOWN / REQUIRES AUDIT y excluido inicialmente |
| ez | No compatible con Easy | SUPPORTED NOW: una C=C explícita | UNKNOWN / REQUIRES AUDIT: E/Z en Hard con nuevas funciones; diferido |
| nitrile | SUPPORTED NOW: C≡N único | NEEDS GENERATOR WORK: ramas/insaturación; combinación concreta UNKNOWN / REQUIRES AUDIT | UNKNOWN / REQUIRES AUDIT: cyano subordinado/repeticiones; excluido inicialmente |
| nitro | SUPPORTED NOW: motivo único saturado | NAMER ONLY: nitro no competidor con alcohol/C=C (#4); NEEDS GENERATOR WORK | NEEDS GENERATOR WORK: añadir motivo a familia Hard aprobada; combinación concreta UNKNOWN / REQUIRES AUDIT |

No se deduce que todos los IDs tengan que estar disponibles en el primer release Hard. La matriz de compatibilidad es un contrato de producto además de una tabla de recetas.

## G. Namer vs generator capability

| Capa | Evidencia / capacidad | Límite relevante |
|---|---|---|
| NAMER SUPPORT | Detecta funciones, elige principal, expresa amino/hydroxy/alkoxy, multiplica diol/diona, nombra enyne; 14/14 grafos del corpus con ES exacto y EN disponible | No garantiza toda química; `localNamerCannotSafelyName` excluye ciertas funciones dentro de ramas que requieren numeración propia. Los perfiles ES sistemático y EN legacy no tienen idéntica sintaxis |
| EDITOR SUPPORT | Grafo común editable con C/O/N/halo, órdenes 1–3, cargas nitro, control de valencia y E/Z explícito; usuario verificó construcción manual | Drawability no implica dominio de ejercicio ni validez de submission Build. UI completa por nombre tiene resolución avanzada externa y fallback local |
| EXERCISE GENERATOR SUPPORT | Las 17 familias restrictivas de F; validación previa al namer y round-trip posterior | Rechaza todas las 14 combinaciones; Difficulty no introduce receta alguna |
| REVIEWER SUPPORT | Pasos estructurados para padre, principal, numeración, insaturaciones, prefijos, alfabeto y montaje; pasos producidos para los 14 grafos en el sondeo | No equivale al razonamiento Lab; selección de prioridad y multiplicidad no tienen explicaciones específicas completas; diagnóstico Hard no validado |

El sondeo del **parser local** `buildHydrocarbonFromIupacName` aceptó solo fixtures 1, 2, 3, 11, 12 y 13. Los otros ocho devolvieron «no pude interpretar». Esto no contradice la evidencia manual de la aplicación: `constructFromName` intenta `resolveNameStructure` (OPSIN/resolución avanzada, integración y adaptador OCL) y usa el constructor local como fallback. No se llamó a servicios externos durante D0. No confundir constructor local, UI completa de construcción por nombre y namer local.

El generador recomendado debe construir **grafos**, con validadores/oráculos locales; no depender de que una llamada remota pueda construir un nombre Hard. Un éxito en el constructor por nombre no es evidencia de una recipe de Practice.

### Respuestas explícitas a las 15 preguntas de la solicitud

1. **Intermediate real hoy:** sí en problemas estructurales de hidrocarburos/halo/anillos y E/Z; no en su núcleo de una función + insaturación + sustitución adicional. Practice actual no lo ofrece como banda.
2. **Porcentaje conceptual:** no hay denominador químico único defendible. Como proxy de familias, 7/17 categorías (41.2%) tienen al menos targets estructurales Intermediate actuales: alkane, alkene, alkyne, halogenated, simple-carbocycle, aromatic y ez. Esto no es 41.2% de moléculas ni del proyecto. Integración de función de sufijo + C–C insaturación: 0/8 categorías de sufijo; corpus manual Intermediate: 0/4 generable y admitido hoy. Estos contadores son más útiles que un porcentaje intuitivo de implementación.
3. **Algún Hard hoy:** no bajo este contrato. Halogenated produce varios grupos del detector, pero no el trigger Hard; aromatic no es polyene acíclico.
4. **Namer más avanzado:** sí, comprobado directamente por 14/14 y rechazo de dominio.
5. **Familias seguras candidatas:** diol, diona, amino-alcohol, alkoxy-alcohol, hydroxy-aldehyde, hydroxy-ketone, hydroxy/amino-acid y enyne/polyunsaturación acíclica acotada. «Candidatas» exige promoción por templates y tests, no habilitación automática.
6. **Excluir inicialmente:** funcionalidades dentro de ramas complejas, anillos funcionalizados/fused/spiro/bridged/heterociclos, N-sustitución, R/S, múltiples centros E/Z, combinaciones arbitrarias de éster/amida/nitrilo, oxo bajo función superior aún sin corpus propio.
7. **Category:** evolucionar la mezcla actual a anclas verificables; recipe family permanece como implementación.
8. **SessionConfig:** sí; ya tiene el campo. Cambiar semántica/IDs con estrategia explícita de compatibilidad.
9. **Class fingerprint:** sí; hoy falta, y el puente fuerza basic.
10. **generatorVersion bump:** D0 no. Un cambio solo de etiqueta visual no lo necesita. La implementación propuesta cambia targets/framing bajo configuraciones previamente válidas: sí requiere frontera versionada al publicar, salvo que se conserve byte a byte el camino v1 y se introduzca un contrato nuevo inequívoco. No bump por cada refactor.
11. **Easy mediante constraints:** casi, salvo semántica/defaults y recetas derivadas de padres simples; `ez × Easy` debe rechazarse. Constraints y retries arbitrarios pueden agotar, por lo que conviene construir subconjuntos sencillos directamente.
12. **Intermediate:** ampliar familias actuales con templates compositivos; dominio y Build/distractores también cambian. No basta ampliar rangos ni cambiar semillas.
13. **Hard recipe-based:** sí; híbrido acotado con composición de sitios previamente validados.
14. **Mayor riesgo químico:** sobrevalencia y reconocimiento/papel funcional incorrectos al combinar motivos, especialmente sobre carbonos múltiples, carbonilos y nitro cargado.
15. **Mayor riesgo de regresión:** ampliación del dominio compartido en D4, seguida de integración D6/D7 y migración determinista/Class en D1. Build y distractores hoy dependen del mismo validador restrictivo.

## H. Manual evidence corpus

La evidencia aportada por el usuario incluye constructor por nombre y construcción manual del mismo grafo. Se conserva como evidencia del **namer**, sin inferir generación. D0 añadió una verificación local independiente de grafos explícitos por SMILES: los 14 son químicamente válidos, `namingSupported = true`, ES exacto y EN disponible; 14/14 rechazados por dominio y por Build submission actual. La clasificación propuesta es química, no el valor legacy `difficulty` de SessionConfig.

| # | Fixture ES | Banda | Razón | SMILES usado en sondeo D0 | Primer rechazo de domain actual |
|---|---|---|---|---|---|
| 1 | 5-metilhex-3-en-2-ol | Intermediate | Un OH + un C=C + metilo | `CC(O)C=CC(C)C` | unsupported-combination |
| 2 | 4-bromo-5-metilhept-3-en-2-ol | Intermediate | Un OH + un C=C + halo/metilo | `CC(O)C=C(Br)C(C)CC` | category-group-mismatch |
| 3 | 5-cloro-4-metilhex-3-en-2-ona | Intermediate | Una cetona + un C=C + halo/metilo | `CC(=O)C=C(C)C(Cl)C` | category-group-mismatch |
| 4 | 4-metil-5-nitrohex-2-en-1-ol | Intermediate | Un OH + un C=C; nitro no compite por sufijo | `OCC=CC(C)C([N+](=O)[O-])C` | unsupported-charge |
| 5 | 3-etoxi-4-metilhex-1-en-2-ol | Hard | Alcohol + éter/alkoxy; además C=C | `C=C(O)C(OCC)C(C)CC` | category-group-mismatch |
| 6 | 4-amino-3-metilhex-2-en-1-ol | Hard | Alcohol principal + amina como amino | `OCC=C(C)C(N)CC` | category-group-mismatch |
| 7 | 4-hidroxi-3-metilhex-2-enal | Hard | Aldehído principal + alcohol como hydroxy | `O=CC=C(C)C(O)CC` | category-group-mismatch |
| 8 | 6-bromo-5-hidroxi-4-metilhept-3-en-2-ona | Hard | Cetona + alcohol subordinado + halo | `CC(=O)C=C(C)C(O)C(Br)C` | category-group-mismatch |
| 9 | ácido 5-amino-4-hidroxi-3-metilhex-2-enoico | Hard | Ácido + alcohol + amina, tres funciones | `O=C(O)C=C(C)C(O)C(N)C` | category-group-mismatch |
| 10 | 3-metilhept-3-en-2,6-diona | Hard | Dos cetonas y sufijo multiplicativo | `CC(=O)C(C)=CCC(=O)C` | category-group-mismatch |
| 11 | 5-metilhept-3-in-2,6-diol | Hard | Dos alcoholes y sufijo multiplicativo | `CC(O)C#CC(C)C(O)C` | category-group-mismatch |
| 12 | 5-metiloct-3-en-6-in-2-ol | Hard | Una función pero C=C + C≡C | `CC(O)C=CC(C)C#CC` | unsupported-combination |
| 13 | ácido 4-metilhept-2-en-5-inoico | Hard | Una función pero C=C + C≡C | `O=C(O)C=CC(C)C#CC` | unsupported-combination |
| 14 | 4-amino-5-bromo-3-metilhept-2-en-6-in-1-ol | Hard | Alcohol + amino, enyne, halo y metilo | `OCC=C(C)C(N)C(Br)C#C` | category-group-mismatch |

El orden de validación explica el primer rechazo; no agota todas las causas. Ejemplo #4: una nitro válida solo admite sus cargas bajo `category === nitro` hoy, por lo que alcohol + nitro falla antes de comprobar grupos/insaturación.

EN es el perfil actual `iupac-1979-legacy-en`, no una traducción del nombre ES: #1 produce `5-methyl-3-hexen-2-ol`; #10 `3-methyl-3-hepten-2,6-dione`; #14 `4-amino-5-bromo-3-methyl-2-hepten-6-yn-1-ol`. No adoptar fixtures EN modernos inventados ni cambiar el grading para acomodarlos.

**Caso inválido excluido:** `4-bromo-5-metilhept-3-in-2-ol`. En C4: triple C3≡C4 (3) + C4–C5 (1) + C4–Br (1) = valencia usada 5. El parser local lo rechaza por superar 4; el grafo `CC(O)C#C(Br)C(C)CC` también fue rechazado por `validateExerciseChemistry` como `invalid-valence`. Nunca usarlo como fixture positiva. Su variante válida #2 tiene C=C; no existe autorización para intercambiar `en`/`in` sobre el mismo grafo con sustitución adicional.

## I. Reasoning readiness

REASON-UNSAT-001 está resuelto; no se propone rehacerlo. [El documento existente](reason-unsat-001.md) distingue la elección de numeración (03) de la contribución de cada enlace al nombre (07), con IDs semánticos independientes del idioma. Tests ejecutados en D0 confirman las contribuciones individuales y múltiples en ES/EN.

Separar el razonamiento interactivo del **Lab** (`buildIupacReasoningSteps`, `buildEnglishReasoningSteps`, functional/name fragments) del **Practice Reviewer** (`buildPracticeReviewSteps`, diagnóstico restringido). Un paso generado no prueba por sí solo que explique todo lo que exige Hard.

| Explicación | Lab | Practice/Exam Reviewer | Trabajo necesario antes de Hard |
|---|---|---|---|
| Padre simple, ramas y locantes Easy | READY | READY en dominio actual | Reusar y verificar templates nuevos |
| Función única antes de C=C/C≡C y prefijos Intermediate | READY, jerarquía y vínculos existentes | PARTIAL: campos y pasos presentes, combinaciones fuera del corpus de ejercicios | Tests de targets combinados, diagnóstico de locantes compuesto |
| Contribución individual de C=C/C≡C al nombre | READY | READY como paso estructural por enlace | Probar nuevos targets y referencias legacy |
| En + in; diene/diyne | READY en corpus Lab, incluidos tests ejecutados | PARTIAL: cada enlace tiene paso, pero numeración combina locantes sin el desempate doble/triple completo del Lab | Portar/compartir evidencia del criterio decisivo sin renombrar |
| Elegir función principal entre varias familias | READY para corpus auditado: compara etiquetas de funciones de sufijo y declara prioridad | PARTIAL: identifica principal y locantes, no explica comparación de familias | Evidencia explícita de elección; no solo «este es el grupo» |
| Sufijo principal vs amino/hydroxy/alkoxy como prefijos | READY para corpus auditado, provenance funcional | PARTIAL: prefijos se presentan como sustituyentes genéricos | Papel funcional subordinado y vínculos, sin inferir del texto |
| Dos OH / dos C=O y diol/diona | PARTIAL: sufijo agrupado y átomos cubiertos; texto específico del multiplicador funcional no completo | PARTIAL: función y locantes agrupados, sin explicación específica de di- funcional | Explicar número de motivos, multiplicador y locantes correspondientes |
| Orden alfabético y multiplicadores de prefijos | READY para simples | READY para simples; diagnóstico restringido | Verificar combinación de prefijos funcionales en ambos perfiles |
| Diagnóstico causal de función principal equivocada | PARTIAL como explicación de referencia | MISSING diagnóstico especializado (`WRONG_FUNCTIONAL_GROUP` no diagnostica aún) | Mantener fallback honesto o incorporar recipe/diagnóstico verificado |
| Diagnóstico de múltiples errores o nombre Hard arbitrario | MISSING como inferencia de respuesta estudiantil | MISSING; fallback UNKNOWN ya existe | No prometer parser general ni explicación causal sin evidencia |
| E/Z explícito en función nueva/Hard | PARTIAL: engine stereo existe, familia no barrida | PARTIAL: inspección puede inferir geometría sin exigir flag explícito | Verificación específica de marcado y prioridad CIP |

Hallazgo del sondeo: grafos SMILES sin `/` o `\` y sin descriptor explícito producen un paso `ez:n` en algunos Reviews. `buildPracticeReviewSteps` llama a `inspectDoubleBondStereochemistry` directamente; las coordenadas pueden dar configuración aunque el nombre no la incluya. El mismo fixture #1 construido por el parser local no añadió ese paso en el sondeo. Documentar y probar la distinción antes de ampliar stereo. No se modificó este comportamiento en D0.

Readiness global: Easy READY dentro del dominio; Intermediate PARTIAL por integración; Hard PARTIAL para explicación de la referencia y MISSING para diagnósticos específicos de competencia funcional. La UI de Lab ya tiene más evidencia semántica que el Reviewer; aprovecharla en fases futuras, sin duplicar reglas químicas.

## J. Valence / chemistry validation

### Pipeline real actual

`normalize config → derive locale-neutral question seed → deterministic category → candidate sub-seed → construct recipe → validateExerciseChemistry → validateExerciseDomain → reference/analyze/name ES+EN → supported family/name checks → SMILES/OCL formula and stereo checks → restore graph → domain again → identity/formula/bilingual naming equality → accept`.

No es un pipeline que confíe solo en la receta. Las recetas toman precauciones constructivas y **después** validan. La química se valida dos veces antes del namer, porque el validador de dominio también llama al químico; además se revalida el round-trip.

| Validador / mecanismo existente | Uso actual | Gap para Difficulty |
|---|---|---|
| `validateExerciseChemistry` | IDs, coordenadas finitas, enlaces/órdenes, endpoints, duplicados, conectividad; oracle real de valencia; errores fail closed | No clasifica Difficulty ni comprueba familia funcional pretendida; eso corresponde al siguiente paso |
| `findMoleculeValenceViolation` y helpers de bond/atom en page | Suma órdenes frente al límite efectivo; commit/editor, oracle del generator, import | Es control de sobrevalencia, no una garantía de estabilidad química ni nomenclatura soportada |
| `validateExerciseDomain` / EXERCISE_DOMAIN_VERSION | DomainProfile de Practice/Exam: elementos, topología, grupos, N primaria, nitro, insaturación, stereo | Codifica «una función y ninguna combinación». Necesita política por contexto/ancla y separación de admisión vs comparación |
| `detectFunctionalGroups` | Identifica motivo ácido/éster/amida antes de alcohol/ether, reclama heteroátomos; detector de todo el pipeline | No usar simple longitud del array como nivel. Verificar cobertura y rol por instancia; no contar OH de ácido como alcohol |
| `reference` + `localNamerCannotSafelyName` | Analyze real, nombres ES/EN, unsupported guard, family | Excluye ciertas funciones en ramas; no basta que un nombre no esté vacío |
| SMILES round-trip + fórmula + OCL identity | Coincidencia exacta de identidad, fórmula y nombres bilingües; evita R/S inducido | Debe seguir funcionando con múltiples funciones y motivos nitro, sin fijar texto ES en EN |
| `createBuildSubmissionValidator` | Química, límite 120 átomos/150 enlaces, algún dominio de categoría válido | Rechaza hoy todos los fixtures; no debe aplicar constraints de nivel del target al alumno |
| `createStructuralAnswerEvaluator` | Valida reference y submission; compara constitución, cargas/orden y E/Z explícito | Reference usa dominio actual; stereo solo admite una C=C configurada |
| `chemistry-document-validation` | Import/persistencia de estructuras portables, schema/charge/rings/formula/valencia | No sustituye admisión de ejercicio; tiene otro alcance y límites |
| Validación distractor | Dominio, modelo de análisis esperado, referencia real, identidad distinta | Domain/ancla demasiado estrechos para Hard, y ciertas alternativas válidas cambian ancla |

### Contrato deseado

`construct candidate from approved template → validate graph/valence/shared domain → analyze/name → verify required anchor and difficulty features against analysis → verify supported bilingual result/round-trip/identity → accept`.

Separar tres políticas: dominio químico/nomenclatural compartido; constraints de target por ancla/nivel; dominio de comparación/distractor seguro. No duplicar tablas de valencia dentro de recipes. Mantener oráculos reales inyectados; no importar React/page desde el núcleo ni inventar nombres para aceptar un candidato.

Para nitro coexistente, validar por **motivo reconocido y cobertura de cargas**, no por `category === nitro`; eso no autoriza amonios ni otras cargas. Para enlaces múltiples, cada sitio requiere valencia disponible tras todas las adiciones. Comprobar que funciones secundarias queden en padre o gramática de prefijo soportada, y que el grupo detectado coincida con la intención del template.

## K. Determinism

Hoy `serializeSessionConfig` fija orden de claves y catálogo; `difficulty` participa en `deriveQuestionIdentity`. `deriveGenerationIdentity` normaliza locale a `es` como ancla de compatibilidad, conservando mode, count, categories, types, seed y difficulty. Cambiar `basic` a `advanced` ya cambia la semilla y puede cambiar la molécula, **pero no sus features permitidas**. No cambiar accidentalmente esa diferencia histórica entre identidad completa y proyección química.

RNG actual: FNV-1a de UTF-16 → Mulberry32, integer rejection sampling y shuffle determinista. `deriveSeed` usa tuples completos y la identidad conserva contexto sin reducirlo al hash de 32 bits. No introducir reloj/Math.random, orden de Map no definido por contrato, locale sorting o selección de template por resultados de servicios remotos.

Contexto propuesto, conceptual: configuración normalizada + versión + ancla + banda + índice de generación; template elegido desde catálogo versionado y orden estable, seguido por parámetros sembrados y retry local. Los campos derivados template/features pueden guardarse como evidencia, pero no crear otra fuente de verdad independiente del grafo. El catálogo/order y las reglas de aceptación también forman parte del determinismo.

Reconstruction utiliza `generationIndex`, no ordinal visible: skips de dedupe/MCQ ya los separan. Debe reconstruir mismo target, referencia bilingüe y options/provenance con el config original y el path de versión original. Un cambio en constraints que altera qué intento se acepta también puede cambiar la secuencia, aun conservando RNG.

### IDs y compatibilidad

Tipo objetivo conceptual: `Difficulty = "easy" | "intermediate" | "hard"`. No añadir otro campo paralelo a `ExerciseDifficulty` sin contrato. Opción mínima: mantener tokens legacy en storage/version antigua y mapear etiquetas `basic → Easy`, `advanced → Hard`; ese mapping visual **no** declara los targets v1 clasificados químicamente. Opción limpia recomendada para versión nueva: IDs easy/intermediate/hard, parser versionado que conserva la lectura y regeneración legacy. `normalizeSessionConfig` hoy rechaza versiones distintas de la constante, por lo que replay multiversión requiere trabajo real; no está disponible por defecto.

**Version bump condicionado, no automático:** D0/renombrar etiquetas no lo requieren; un refactor que conserve salida tampoco. D2/D3/D5 cambiarán outputs o aceptación de configuraciones v1; el comentario de `GENERATOR_VERSION` y los frozen vectors incluyen cambios de generación/canonicalization. Por tanto, publicar el comportamiento propuesto requiere una frontera nueva (previsiblemente generator 2 y domain 2) o preservar un dispatcher v1 exacto con un contrato nuevo inequívoco. No reutilizar generator 1 para reinterpretar `basic` histórico. No hacer un bump distinto por fase interna si todavía no se publicó.

Practice/Exam y locale son ortogonales **al significado químico** de Difficulty; mode y questionCount actualmente influyen en las semillas. D0 no recomienda eliminarlos ni prometer mismo target entre modes/counts si v1 no lo promete.

## L. Class Seed implications

`ClassAssignmentConfig` no tiene difficulty; normalización y `participantSessionConfig` fuerzan basic. `classConfigFingerprint` incluye mode, count, categorías, tipos y generatorVersion; locale está deliberadamente ausente. `classVariantInputSignature` tampoco incluye banda. CSV tiene columnas fijas y reconstruye el config sin banda.

Contrato nuevo: `CHEM-4B-2026 + Easy` y `CHEM-4B-2026 + Hard` deben producir **fingerprints y participant seeds diferentes**, aunque compartan roster/categories/types. ES/EN delivery mantiene fingerprint y semillas; el grafo participante permanece químicamente idéntico, con nombres localizados.

Actualizar como unidad: selección Class, configuración normalizada/serializada, whitelist, framing del fingerprint, firma de stale-preview, manifest, `participantSessionConfig`, CSV, reconstrucción y versiones de esquema/derivación pertinentes. La banda debe ser un token canónico en CSV y fingerprint, nunca un label traducido. El fingerprint nuevo no se obtiene editando texto sobre una fila legacy.

Los manifests/CSV v1 deben conservar lectura reproducible como `basic` legacy usando su framing original, o fallar con incompatibilidad explícita según decisión U. No tratar la ausencia de columna como Easy químico moderno. Mantener protección de texto spreadsheet, BOM, quoting, Unicode y neutralidad locale. Class CSV exporta configuración, sin targets/respuestas ni plan de Exam.

## M. Practice / Exam implications

Practice config builder fuerza basic y `startPractice` rechaza otras bandas; Exam config builder y plan hacen lo mismo. Cambiar solo `SessionConfig` o agregar radio buttons no habilita generación.

| Superficie | Plumbing requerido | Invariante preservada |
|---|---|---|
| SessionConfig | Banda canónica/versionada; normalización estricta | Config completo conservado |
| Generation context | Propagar banda/ancla a recipe y admisión | Streams independientes; locale-neutral |
| Practice | Builder acepta nivel, preflight de compatibilidad, start/retry/corrections lo conservan | Feedback, attempts y timing no dependen de Difficulty |
| Exam | Builder/plan admite nivel solo si todos los tipos/familias soportados; plan congelado antes del examen | Fallo del plan no crea intentos; grading solo en submit |
| Question identity | Banda sigue en framing/versionado | No aliasing de preguntas/reconstruction |
| Session Review | Ya conserva config completo: allí vive la banda | Usa grafo/semilla/índice y resultado congelado, no regrade |
| Dashboard | Mostrar banda en detalles de sesión; no rediseño ni filtro multinivel v1 | Métricas históricas permanecen |
| Attempt Log | No tiene difficulty directo; registros se entienden junto al SessionConfig | No mutar registros viejos ni introducir un campo redundante sin necesidad |
| Exports | Class CSV necesita token y esquema nuevo; futuros exports de resultados deben llevar config/version | Un AttemptRecord suelto no es un replay completo |

No hay export CSV de resultados de Session Review auditado en estos módulos; no prometer extender uno inexistente. Review schema conserva SessionConfig, pero cambiar parser/IDs puede exigir lectura versionada aunque el shape del ReviewModel no cambie. Grade/timing actuales se reusan; una pregunta más lenta no obtiene tiempo artificial diferente por su banda.

En Exam, Build submission validation es neutral y puede correr antes de entregar; nunca comparar al target, revelar función del target, número de motivos o corrección anticipadamente. Mantener `hideCategory`, drafts separados, acceso post-submit al Reviewer y frozen plan. Naming seguirá usando reference matcher del perfil existente; Difficulty no introduce tolerancias ni equivalencias de respuesta.

### UI: solo propuesta

Un radio group o select nativo en la configuración compartida de Practice/Exam, junto a temas/tipos antes de iniciar. ES: `Dificultad`, `Fácil`, `Intermedia`, `Difícil`; EN: `Difficulty`, `Easy`, `Intermediate`, `Hard`. Ayuda breve por nivel describe tarea única, función con complejidad adicional y multifuncionalidad/múltiples insaturaciones.

Single-select, una banda por sesión; estado confirmado en resumen/config y detalles del Dashboard. Keyboard, label/legend, selected state anunciado, ayuda vinculada con `aria-describedby`, incompatibilidad textual y sin depender de color. No cambiar dificultad de una sesión iniciada: volver a configurar crea otra identidad. No deseleccionar temas incompatibles silenciosamente.

Default recomendado para usuarios nuevos: Easy, porque la mayoría de recetas funcionales actuales son tareas de una función y porque un default accesible evita introducir prioridad multifuncional accidentalmente. Trade-off: usuarios actuales con múltiples ramas o E/Z pueden percibir una reducción de alcance. Recordar selección explícita en futuras sesiones sería razonable; migrar una sesión existente no aplica el default nuevo. Para `ez` seleccionado con Easy, mostrar incompatibilidad y permitir elegir Intermediate. La decisión final sobre default/compatibilidad requiere aprobación pedagógica (U), no una suposición oculta.

## N. MCQ implications

Current engine exige cuatro opciones: referencia + tres distractores seguros, bilingües, inequívocos y con provenance. No se acepta un MCQ con menos distractores ni se degrada a Naming. La búsqueda de target elegible es distinta de los 16 intentos químicos.

Recetas actuales: extensión de padre; mover/eliminar rama simple; mover grupo único alcohol/amine/ketone; mover insaturación en alkene/alkyne; invertir E/Z bajo categoría ez. Comparan modelos estructurados, rechazan cambio de padre/renumeración/competencia incidental y reusan `validateExerciseDomain`.

La taxonomía de MCQ también limita lo que se puede admitir: `WRONG_FUNCTIONAL_GROUP` está marcado `NOT_SAFE_AS_DISTRACTOR`; los cinco `VERIFIED_GRAPH_RECIPES` no incluyen errores de prioridad. Una receta nueva de ese tipo requiere extender el contrato de transformation/verification y su diagnóstico, no solo generar otra opción y asignarle un código existente. Algunos códigos declarados `SUPPORTED_WITH_RESTRICTIONS` tampoco tienen productor activo; catálogo de tipos no equivale a generación de distractores.

**Hard MCQ necesita trabajo nuevo.** Con dominio actual, los targets Hard producen cero distractores válidos. Tras ampliar el dominio, parent-length/missing-simple-substituent pueden reusarse en templates concretos, pero no existe garantía de tres alternativas. Mover función está condicionado a `model.functionalGroups.length === 1`; no cubre diol/diona ni competencia. Mover C=C/C≡C está ligado a categorías hidrocarbonadas. E/Z inversion está ligado a `ez`.

| Riesgo Hard | Decisión recomendada |
|---|---|
| Cambiar locante crea sobrevalencia o otro principal/padre | Generar alternativa válida, analizar y verificar diff de modelo previsto |
| Función principal equivocada | Recipe específica con alternativa verificable; no editar sufijos de texto libre |
| Omitir hydroxy/amino/alkoxy | Verificar grafo/provenance; al eliminar el ancla puede cambiar categoría, así que dominio de alternativa no debe confundirse con admisión de target |
| Variante en/in | Validar órdenes y valencia; el contraejemplo H impide sustitución textual ingenua |
| Multiplicidad de sufijos | Diagnóstico y transformation estructurados que indiquen instancia/locantes modificados |
| Tres nombres seguros solo en ES o solo en EN | Elegibilidad bilateral obligatoria; collisions en cualquiera de los idiomas rechazan |

No filtrar distractores por exigirles el mismo trigger de dificultad del target: uno que omite un prefijo puede tener menor complejidad y ser una alternativa legítima. Sí exigir química y namer soportados, diferencia real y explicación honesta. No expandir DomainProfile indiscriminadamente para fabricar alternativas. D7 debe certificar matriz categoría/familia/tipo; no habilitar Hard MCQ hasta pasar esa puerta.

## O. Build implications

Hipótesis «solo cambia target generation; editor no cambia» es **incompleta**. El grafo/editor común ya representa los 14 ejemplos y controla valencia, y `PracticeBuildEditor` solo recibe draft del estudiante. Pero el validador de submission y reference usan DomainProfile v1, así que rechazan estos targets. Los 14 son `INVALID_SUBMISSION` hoy en el sondeo.

Constitución se compara con canonicalización OCL de elementos, carga y órdenes; no usa nombres ni fórmula sola, y no necesita rediseño para funcionalidad múltiple acíclica. Necesita ampliar y probar dominio seguro de comparación, conservar constraints de target separados y verificar round-trip/cargas. Un alumno que entrega una molécula segura con número de funciones equivocado debe recibir DIFFERENT_STRUCTURE, no invalidez por Difficulty.

Stereo actual usa constitución NOSTEREO + `|ez:unspecified/E/Z`. `stereo()` solo soporta una C=C configurada; review reconstruction valida ese mismo formato. Una C=C explícita con funciones nuevas exige auditoría CIP/round-trip, aunque la comparación conceptual pueda reusarse. Más de una configuración requiere identidad por centros, nuevo formato snapshot y migración; excluirla de v1 evita una expansión no necesaria.

No introducir ayudas derivadas del target dentro del editor; Exam sigue ocultando scaffolding antes de submit. Layout no decide equivalencia. Validar invariancia ante atom IDs, orden de arrays, rotación y coordenadas para familias nuevas, y explícito vs sin especificar debe seguir siendo distinto.

## P. Duplicate / exhaustion implications

PRACTICE-007B sigue siendo obligatorio. La clave de ejercicio literal es `[questionType, exerciseStructuralIdentity(finalMolecule)]`; el selector calcula identidad del target presentado y exige concordancia con referencia cacheada. Locale, difficulty, nombre de receta, seed y número visible no justifican duplicar el mismo target del mismo tipo.

Finite Practice y Exam retienen **todas** las claves aceptadas; Naming X + Naming X falla, Naming X + Build X/MCQ X sigue permitido. Endless solo retiene ocho claves: no prometer ausencia global de repeticiones en una sesión infinita. Corrections/Session Review reconstruyen preguntas aceptadas sin volver a aplicar dedupe.

Límites actuales: 16 intentos químicos por target; cuatro candidatos para selección ordinaria; doce para MCQ. Retry determinista no prueba agotamiento matemático del espacio: significa que terminó la búsqueda acotada. Easy puede reducir diversidad; Hard puede reducirla por slots/valencia/namer/MCQ elegibilidad aunque parezca combinar más features.

No aumentar límites a ciegas, reiniciar historial ni aceptar duplicados para alcanzar count. Preservar `generationIndex` real, error seguro y resultados ya logrados en Practice; Exam debe fallar el plan sin comenzar parcialmente ni crear intentos. Añadir sweeps por banda/familia/count/seed y medir aceptación/rechazos/diversidad/exhaustion, incluyendo categorías pequeñas. Un límite de count por combinación solo sería decisión posterior con evidencia, no deducido del rango de carbonos.

No usar difficulty como parte de structural identity: la molécula sigue siendo la misma. No alterar equivalencia de nitro o estereoquímica para aumentar diversidad aparente.

## Q. Hard generator strategy

| Alternativa | Ventaja | Coste / riesgo | Recomendación |
|---|---|---|---|
| A. Combinatorial graph mutation | Cobertura potencial amplia | Producto functions × sites × chains × prefixes × unsaturation; alta tasa inválida, padre inesperado, complejidad/determinismo difíciles de auditar | No para targets Hard v1 |
| B. Validated recipe families | Scope explícito, fixtures y reproducibilidad; encaja con candidate actual | Puede limitar diversidad; requiere parametrización química cuidadosa | Base de v1 |
| C. Hybrid | Templates validados + composición acotada de slots/variantes; reutiliza helpers | Debe prohibir combinaciones no revisadas y verificar resultado analizado | **Recomendada: B como contrato, C solo dentro de cada familia** |

Cada template declara ancla, bandas/tipos admitidos, patrón principal/secundario, locantes/sitios elegibles, exclusiones, máximo de funciones/insaturaciones, y evidencia esperada de análisis. Selección seeded del template y parámetros; construir grafo; validar; comprobar features/ancla/padre y referencias; round-trip; aceptar o retry determinista. Variantes internas pueden mover un OH a uno de varios sitios certificados; no mutar indiscriminadamente cualquier carbono.

Empezar por funciones directamente sobre padre acíclico. Dar slots separados a enlaces triples, carbonilos, terminales y prefijos; comprobar valencia del estado final y patrones funcionales, no solo sumar reservas previas. Para nitro preservar cargas explícitas canónicas. Oráculos reales siguen siendo el filtro de aceptación, no un sustituto de recipes químicamente sensatas.

La dificultad se obtiene de predicates de features con provenance; no de un score arbitrario. El análisis debe identificar que una recipe «ketone + OH» realmente conserva ketone como principal y OH como hydroxy. Si el namer selecciona un padre que deja función fuera de gramática segura, rechazar y reportar motivo; no reparar mediante un nombre escrito a mano.

## R. Risks

| Riesgo | Evidencia actual | Mitigación / fase |
|---|---|---|
| Sobrevalencia al colocar prefijos sobre C≡C o C=O | Caso inválido H; recetas hoy evitan endpoints de múltiples | Slots validados + oracle obligatorio, D3–D5 |
| Confundir conteo de grupos con complejidad | Halogen/nitro/ether figuran en detector; ácido/éster tienen varios heteroátomos | Features por rol/motivo, D2/D4 |
| Cambiar todos los consumidores al ensanchar dominio | Generator, distractors y Build comparten validateExerciseDomain | Separación target/comparison/distractor y regresiones, D4 |
| Targets del nivel mal clasificados por padre reescogido | Ramas se construyen sin fijar cadena definitiva | Comprobar análisis, no longitudes constructivas, D2/D3 |
| Replay rompe con IDs/constraints/version | Frozen vectors; parser solo acepta constante vigente | Versionar y conservar/rechazar legado explícitamente, D1/publicación |
| Class CSV misma semilla para bandas diferentes | Difficulty ausente y basic forzado | Fingerprint/schema/bridge/preview juntos, D1 |
| Nitro combinado se rechaza o abre cargas generales | Gating actual por category nitro | Validar cada motivo y cobertura de carga, D3/D4 |
| Reviewer cuenta geometría como E/Z pedido | Paso ez observado para SMILES sin descriptor | Exigir explicit stereo para enseñanza de configuración, D7 |
| Reviewer Hard aparenta explicación causal no demostrada | Principal/prefix genéricos; UNKNOWN para funciones erróneas | Evidencia semántica y fallback honesto, D7 |
| MCQ no tiene tres distractores o cambia función involuntariamente | Recipes únicas/categorías restrictivas | Eligibility bilateral + templates certificados, D7 |
| Espacio finito pequeño / latencia de retries | Sweep baseline y agotamiento documentado en PRACTICE-007B | Sweeps y límites acotados, D2/D8 |
| Exam filtra target mediante validación/editor | Bridge draft-only e hideCategory actuales | Integración y pruebas pre-submit, D6/D8 |
| Sintaxis EN legacy difiere de ES | Sondeo de 14 nombres bilingües | Verificar ambos oráculos/profile y matcher, todas las fases |

Mayor riesgo químico: composición de sitios con valencia/papel funcional incorrectos. Mayor superficie de regresión: D4 al cambiar el dominio compartido; no tratarla como un archivo aislado del generator. Riesgo de compatibilidad más temprano: D1 si se reescriben IDs/framing antes de acordar lectura legacy.

## S. Recommended v1 scope

Esta es una lista de familias a certificar, no permiso para generar su producto cartesiano. Cada nueva familia necesita al menos grafo independiente, nombres ES/EN reales, análisis de rol/locantes, round-trip, identidad y pruebas de tipo. Hasta entonces sigue deshabilitada.

### Incluir en Hard v1, con promoción por familia

1. **Diol acíclico:** exactamente dos OH en carbonos distintos, ambos del padre; saturado o un C=C/C≡C aprobado; una rama simple opcional. Incluye el patrón #11.
2. **Diona acíclica:** exactamente dos C=O interiores distintos del padre; saturado o un C=C aprobado; una rama simple opcional. Incluye #10.
3. **Amino-alcohol:** OH principal + una NH2 primaria como amino sobre padre; saturado o un C=C; ramas simples. #6; variante enyne + un halo certificada aparte reproduce #14.
4. **Alkoxy-alcohol:** OH principal + un éter simple como methoxy/ethoxy; una C=C opcional y rama simple. #5 es evidencia positiva del namer y caso obligatorio de auditoría de sitio; no extrapolar a cadenas alkoxy complejas.
5. **Hydroxy-aldehyde:** CHO principal + un OH subordinado, directamente sobre padre; una C=C opcional y rama simple. #7.
6. **Hydroxy-ketone:** una cetona principal + un OH subordinado; una C=C opcional, rama simple y un halo aprobado. #8.
7. **Hydroxy/amino-acid:** un COOH principal + un OH o NH2; extensión de ambos simultáneamente como template explícito de tres funciones. Una C=C y rama simple opcionales. #9 fija el caso de tres funciones.
8. **Multiinsaturación acíclica:** dos C–C múltiples máximo: enyne, diene o diyne; hidrocarburo sin función, o un OH/COOH principal en templates aprobados. #12/#13 para enyne funcional; diene/diyne funcional requieren promoción adicional y no se suponen admitidos por el solo test del hidrocarburo.
9. **Variantes simples halo/nitro:** añadir solo mediante variante específica de una familia 1–8 certificada; no nuevas funciones competidoras ni cambios de ancla. #14 fija halo en familia amino-alcohol; combinación Hard + nitro todavía requiere su fixture propio de carga y referencia.

Todos sin R/S explícito ni E/Z explícito nuevo; alkenes no especificados no adquieren obligación E/Z por coordenadas. Conservar categoría ez en Intermediate. Habilitar categoría hard solo cuando exista al menos una familia compatible **y** todos los tipos elegidos estén certificados.

### Excluir inicialmente

- Hard alkane: sin trigger Hard compatible con hidrocarburo saturado; no reclasificar simple ramificación como química multifuncional.
- Hard simple-carbocycle/aromatic, anillos funcionalizados, heterociclos, fused/spiro/bridged y múltiples anillos, aunque el Lab nombre ejemplos.
- R/S, más de una C=C configurada, y E/Z explícito en nuevas familias Hard hasta auditoría dedicada.
- Secundarias/terciarias N y N-sustitución de amidas; salts, cargas arbitrarias y elementos fuera de C/O/N/F/Cl/Br/I.
- Ésteres/amidas/nitrilos multifuncionales, dicarboxylic/dialdehyde/diamine, triol/trione y multiplicidades >2: algunos tienen tests de namer, pero no corpus suficiente de generación/Review/comparación para este release.
- Ketone como oxo bajo acid/aldehyde y otros prefijos de funciones superiores; evidencia concreta pendiente, no inventar lista de compatibilidad.
- Funciones alojadas dentro de ramas complejas o un padre cuya selección requiera gramática de prefijo no soportada; sustituyentes complejos arbitrarios y disconnected graphs.
- Más de dos enlaces múltiples, allenes/cumulenes o ubicaciones funcionales no certificadas. La existencia de un triene/triyne nombrable no amplía el scope inicial.
- Generación por nombres remotos, sustitución textual de sufijos y combinatoria abierta.

El roadmap puede entregar familias antes de otras manteniéndolas deshabilitadas en UI hasta su gate. El corpus manual es un mínimo de casos de aceptación/nomenclatura y límites; no es por sí solo corpus de generación ni validación científica independiente de todas las variantes.

## T. Implementation roadmap

### D1 — Compatibilidad y plumbing determinista

- **Objective:** decidir tokens/version/legado; propagar banda existente; actualizar contrato Class/fingerprint/CSV sin activar targets nuevos. Mantener fixtures v1 y definir parser/dispatcher si se soporta replay antiguo.
- **Files likely involved:** exercise-model/seed, class-assignment/csv, builders practice-session/exam-session y contexto de generation; tests exercise-model/seed, class-assignment/csv/integration, session-review/reconstruction.
- **Tests required:** normalización set-like; mismos configs reproducen; Easy ≠ Hard framing; ES/EN misma química; fingerprints/participant seeds distintos por banda; CSV nuevo + lectura/rechazo explícito v1; fresh-process replay y frozen vectors antiguos.
- **Chemistry risk:** bajo si no se activa receta. Riesgo de compatibilidad alto.
- **Expected scope:** modelo/adaptadores/versionado pequeños; sin UI ni generación ampliada. No abrir start a bandas sin capacidad.

### D2 — Feature policy y Easy constraints

- **Objective:** describir motivos/roles y predicates por grafo; separar envelope elemental de longitud; construir subconjuntos Easy de recipes actuales; preflight para ez × Easy.
- **Files likely involved:** exercise-domain, exercise-chemical-candidate/generator, modelo de features compartido pequeño; tests exercise-domain/generator, finite dedupe.
- **Tests required:** una instancia por motivo, éster/ácido no doble conteo; rama simple/padre; exclusión función+C=C/C≡C, polifunción/enyne/explicit EZ; todas las categorías compatibles, seeds pequeños/grandes y agotamiento seguro.
- **Chemistry risk:** bajo–medio; el cambio de aceptación afecta determinismo y diversidad.
- **Expected scope:** constraints y recetas elementales directas; no inferir banda de un contador de carbonos. Elegir frontera de versión de publicación acordada en D1.

### D3 — Intermediate acíclico

- **Objective:** ampliar recipes funcionales primero alcohol/ketone/acid/aldehyde con un C=C o C≡C y prefijos acotados; habilitar halo/nitro combinados. Resto por auditoría individual, sin cubrir 17 combinaciones a la fuerza.
- **Files likely involved:** candidate/generator/domain/features, chemistry-oracles si precisa exponer evidencia analizada sin duplicar engine; tests de cuatro fixtures Intermediate, bilingual/reference/round-trip, Build domain y distractor source.
- **Tests required:** fixtures #1–4, principal único, nitro charges motif-based, colocaciones inválidas incluyendo triple+halo, padre/locantes, locale-neutrality, retry isolation, comparación Build de nuevos motivos.
- **Chemistry risk:** medio; endpoints de múltiples y carbonilo; cambios de rol/padre.
- **Expected scope:** ampliación de families existentes mediante templates; E/Z con función queda gate aparte. Ningún Hard activo.

### D4 — Foundation Hard y dominio compartido

- **Objective:** separar dominio seguro, admisión de target y alternativa/comparación; establecer registry de templates/features/anclas; permitir multiplicidad explícita sin abrir combinatoria. Reviewer/Build audit gates desde el inicio.
- **Files likely involved:** exercise-domain/candidate/generator, practice-structural-answer, practice-distractor-engine/recipes, session-answer-evaluation, session-review-question; tests domain/build/distractor/identity/reconstruction.
- **Tests required:** rechazo de grupos no cubiertos, categorías principales correctas, alumno seguro equivocado recibe DIFFERENT y no INVALID por banda; cargas/orden/identity; ningún cambio en grading v1; máximo stereo actual y invalid/out-of-domain.
- **Chemistry risk:** alto; mayor superficie compartida.
- **Expected scope:** infraestructura y una familia piloto diol/diona; sin publicar Hard general. Cada consumidor recibe política adecuada.

### D5 — Hard multifunctional recipe families

- **Objective:** promover S en incrementos: diol/diona → amino/alkoxy alcohol → hydroxy carbonyl → acid con funciones subordinadas → multiinsaturación y variantes certificadas.
- **Files likely involved:** registry/helpers/candidate/domain/generator; fixtures y tests chemical generator/nomenclature/reasoning/Build.
- **Tests required:** #5–14 por grafos independientes y targets de seeds que alcancen cada familia; invalid triple+halo; role/suffix/prefix/multiplier; `localNamerCannotSafelyName`; ambas referencias; round-trip, dedupe y composición verificada fuera del solo oracle.
- **Chemistry risk:** alto pero acotado por template.
- **Expected scope:** una familia o pequeño lote por cambio revisable; no añadir todas las permutaciones ni tocar namer para aceptar recetas defectuosas.

### D6 — Integración sesión/UI/Class/Review metadata

- **Objective:** usar selección única, preflight de matriz de capacidades y builders reales; conservar banda en sesión/Review; display mínimo, sin Dashboard redesign.
- **Files likely involved:** practice-panel/exam-panel, practice-session/exam-session, class-variants-panel, class-assignment adapters, session-review/dashboard y i18n.
- **Tests required:** accessibility ES/EN, config → plan/attempt/reconstruction; cambios antes vs después de inicio; Class stale-preview por banda; Exam pre-submit leakage; mismos grading/timing/corrections.
- **Chemistry risk:** bajo en UI; riesgo de integración alto.
- **Expected scope:** UI compacta y plumbing. Hard permanece oculto/deshabilitado para tipos no certificados hasta D7; no enviar MCQ incompleto ni Build inválido a sesiones reales.

### D7 — MCQ y Reviewer hardening, gate previo a Hard público

- **Objective:** certificar tres distractores por target admisible o fallo seguro; explicar principal vs prefix y diol/diona; mejorar diagnóstico solo con provenance verificable; corregir enseñanza de stereo implícito antes de ampliar E/Z.
- **Files likely involved:** practice-distractor-engine/recipes/multiple-choice/question, practice-review/diagnosis/review-i18n, reasoning-functional-groups o evidencia compartida, review panel y tests relacionados.
- **Tests required:** funciones/locantes/prefix omisión/enyne en ambas lenguas; opciones únicas y correctOption una; malicious/stale provenance; falta de tres opciones → safe exhaustion; comparación de prioridad, doble/triple tie y multiplicadores; ningún paso E/Z obligado para enlace no marcado; Reviewer no reevalúa intentos.
- **Chemistry risk:** alto para alternativas y diagnóstico, medio para explicación semántica.
- **Expected scope:** recipes verificadas por familia, no parser general de respuestas. Puede adelantarse por familia junto con D3/D5; **debe preceder la activación pública de Hard en D6**.

### D8 — Difficulty sweeps y release hardening

- **Objective:** certificar matriz real release, compatibilidad y rendimiento/exhaustion; activar solo celdas aprobadas.
- **Files likely involved:** tests/helpers de sweeps, exercise/session/class/CSV/Exam/Review tests, documentos de reporte; versión de publicación según D1.
- **Tests required:** categoría × banda × tipo soportados, 5/10/20/30 y finite count mayor/Endless cuando corresponda, semillas deterministas múltiples, ES/EN, fresh process, graph IDs/layout invariance, nitro/valence/round-trip, Class reconstruction, Review/Corrections y Exam sin leakage. Medir duración, rechazo por etapa, duplicados aceptados (cero dentro del contrato finito), failures y skips. Suite completa/build/lint en esta fase de código, no D0.
- **Chemistry risk:** descubrir huecos entre templates/consumidores; no ampliar química al final para salvar métricas.
- **Expected scope:** consolidación y release, con informe de celdas excluidas; no bump automático por todo test adicional.

**Dependencias:** D1 → D2 → D3; D4 antes de familias D5. D6 puede implementarse con capability gates mientras D5/D7 evolucionan, pero habilitar Hard requiere D4 + familia D5 + Build certificado + D7 del tipo seleccionado + D8. Adelantar pruebas de comparación y explicación a cada familia evita descubrir que un target generado no puede enseñarse/evaluarse al final.

## U. Open questions

Solo decisiones humanas de producto/pedagogía/compatibilidad; los hallazgos técnicos no requieren preguntas adicionales para terminar D0.

1. **Default y celdas incompatibles:** aprobar Easy para sesiones nuevas, recordando futura selección explícita; `ez × Easy` y categorías Hard sin familias deben mostrarse incompatibles. Alternativa: Intermediate por defecto para evitar fricción en temarios con E/Z/ramas actuales, con mayor carga inicial para principiantes.
2. **Semántica de anclas:** aprobar función principal obligatoria para categorías de sufijo y feature obligatoria para ether/halo/nitro/ez/topología. Alternativa «cualquier presencia» permitiría practicar Alcohol recibiendo un nombre de ácido con hydroxy, pero cambia la expectativa curricular actual.
3. **Compatibilidad histórica y tokens:** ¿se necesita replay de seeds/CSV v1 en versiones futuras? Recomendación: conservar dispatch v1 y añadir IDs nuevos/versionados; alternativa de menor scope: rechazar claramente contratos antiguos y anunciar que solo el nuevo release reproduce sus propios configs. No reinterpretar legacy basic/advanced silenciosamente.
4. **Release parcial Hard:** aprobar S y celdas no disponibles inicialmente, en lugar de obligar a las 17 categorías a tener Hard desde el primer release. Confirmar que enyne/polyunsaturación cuentan como Hard incluso con una única función; esto resuelve explícitamente fixtures #12/#13.

Estas decisiones no impiden que el contrato sirva de base de implementación; D1 debe resolverlas antes de publicar schema/semillas y D6 antes de exponer selección. No quedan dudas sobre si el generator actual ya soporta el corpus: el dominio lo excluye de forma comprobada.

### Validación documental y alcance final D0

- Tests de auditoría: 213 PASS, 0 FAIL, 0 SKIP en dos ejecuciones focalizadas; corpus grafo local 14/14 ES exacto, namer disponible y química válida; 0/14 domain/Build admitidos hoy.
- Único archivo nuevo autorizado: `docs/difficulty-v1-contract.md`. Ningún archivo existente modificado.
- Validación final: `git diff --check` PASS; archivo nuevo sin trailing whitespace, 21 secciones A–U y enlaces locales válidos. `git diff --stat` no lista archivos untracked; la comparación `--no-index --stat` contra `/dev/null` confirma un único archivo añadido. `--no-index --check` no reporta errores de whitespace; devuelve 1 por la diferencia del archivo nuevo y avisa de la conversión LF→CRLF configurada en Git. `git status` final: main, únicamente este documento untracked; ningún cambio staged.
- No full suite, commit ni push; production code, generator, SessionConfig, generatorVersion, tests, UI e i18n sin cambios.
