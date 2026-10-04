# Difficulty D4.2B — Hard structural/topological coverage

Foundation optativa de las cuatro anclas pendientes; sin producción Hard. La solicitud D4.2B autoriza esta extensión puntual de las exclusiones iniciales D0. Los informes históricos se conservan como evidencia de sus fases.

## A. Baseline

HEAD = origin/main `df12e05dacf1d34ea3a6cf9121f9136c3a00810d`, branch `main`, working tree inicialmente limpio. D4.2A committeado; ocho documentos D0–D5/D4.2A leídos completos. Current generator **3**, soportados **1/2/3**; cobertura inicial **13/17**. Sin AGENTS.md local. Baseline domain/Build/D4/D4.2A: **109 pass / 0 fail / 0 skip**, 147.409 s. TSC baseline: 32 diagnósticos existentes. Ocho grafos/nombres/identidades capturados antes de modificar el perfil.

## B. Scope

Solo **alkane, simple-carbocycle, aromatic, ez**. Familias controladas: exactamente tres ramas metilo/etilo en sitios distintos, ambos tipos presentes, con locantes dependientes de la dirección. E/Z añade exactamente una C=C genuinamente estereogénica marcada. Sin composición funcional ni nuevas topologías.

## C. Root-cause audit

| Category | D5 blocker | Structural/naming layer responsible |
|---|---|---|
| alkane | Ningún trigger Hard saturado; el único hidrocarburo D4 era enyne | Registry/ancla Hard; Intermediate limita a dos ramas, no fallo del namer |
| simple-carbocycle | Rechazo global de cualquier ciclo | Perfil Hard; domain/namer/Build ya admiten monociclo C5/C6 sustituido |
| aromatic | Mismo rechazo de ciclos, sin familia de sustitución aromática | Perfil Hard; domain mantiene un benceno y tres enlaces Kekulé |
| ez | Rechazo global de cualquier flag E/Z | Perfil Hard; detector CIP, nombres y Build ya admiten un centro explícito |

No se solucionan las cuatro por un guard relajado general. Cada nueva fila se verifica bajo su categoría y el dominio publicado, y después exige evidencia estructural adicional.

## D. Classification architecture

Se reutiliza `classifyMinimumExerciseDifficulty`: Easy → Intermediate → Hard explícito → unsupported. Solo cambia `exercise-advanced-profile.ts` en producción. Registry ahora **22 familias de admisión**, no recetas: añade mixed-trialkyl-alkane/carbocycle/benzene/ez.

El nuevo predicate usa química/valencia, dominio existente, referencia real, padre ordenado, componentes fuera del padre y locantes derivados del grafo. Tres sitios, ramas C1/C2, dos identidades y dirección con locantes diferentes; sin score, regex, longitud del nombre, IDs de fixture ni lista de nombres como clasificador. Las 18 familias anteriores conservan su camino y presupuestos. Filas estructurales no participan en el matching funcional anterior.

Coste acotado de validación optativa por grafo; no enumerador ni búsqueda combinatoria. Producción conserva sus análisis, candidatos, retries y límites 16/4/12/8. La integral y critical miden validación completa, no un benchmark comparativo de runtime.

## E. Alkane

`CC(C)C(CC)CC(C)CCC`: padre real C8, metilos 2/5 y etilo 3. ES **3-etil-2,5-dimetiloctano**; EN **3-ethyl-2,5-dimethyloctane**. Grafo saturado acíclico, sin grupos. Tres ramas exceden el envelope Intermediate de dos; identidad ethyl/methyl requiere orden alfabético y numeración compite entre [2,3,5] y [4,6,7].

Segundo grafo: ES **4-etil-3,6-dimetiloctano**, EN **4-ethyl-3,6-dimethyloctane**; [3,4,6] vence [3,5,6] en el segundo punto. El padre lo elige el namer; no se fija manualmente ni se implementa otro algoritmo longest-chain. Ambos Build equivalentes tras redraw/round-trip; cadena C12 lineal permanece basic.

## F. Simple carbocycle

`CCC1C(C)CC(C)CC1`: un C6 saturado, etilo 1 y metilos 2/4. ES **1-etil-2,4-dimetilciclohexano**, EN **1-ethyl-2,4-dimethylcyclohexane**. Dirección opuesta desde el mismo origen [1,4,6]. Variante C5: **1-etil-2,3-dimetilciclopentano / 1-ethyl-2,3-dimethylcyclopentane**.

La variante consecutiva prueba también empate [1,2,3] al invertir desde el tercer sitio: ethyl recibe 1 frente a 3. Solo un anillo C5/C6, sin insaturación, funciones, quaternary/geminal, heterociclo, fused/spiro/bridged. Redraw conserva metadata/connectividad de anillo y equivalencia.

## G. Aromatic

`CCc1c(C)cc(C)cc1`: un benceno, etilo 1 y metilos 2/4. ES **1-etil-2,4-dimetilbenceno**, EN **1-ethyl-2,4-dimethylbenzene**. Variante **1-etil-2,3-dimetilbenceno / 1-ethyl-2,3-dimethylbenzene** prueba empate de locantes y asignación alfabética como el C5.

Los tres dobles Kekulé son representación del único benceno, no trigger de poliinsaturación. Hard procede de sustitución mixta y numeración; no funciones principales sobre anillo, heteroaromáticos ni aromáticos policíclicos. Round-trip/redraw conservan identidad.

## H. E/Z

`CC(C)C(CC)/C=C/C(C)CCC` y variante Z: padre real C9, metilos 2/6, etilo 3, doble C4. ES **(4E)/(4Z)-3-etil-2,6-dimetilnon-4-eno**; EN **(4E)/(4Z)-3-ethyl-2,6-dimethyl-4-nonene**. E/Z + tres ramas mixtas + locantes/orden, no tamaño solo.

Ambos endpoints tienen un vecino carbonado y H implícito además del otro carbono del doble; el inspector CIP real confirma stereogenic true, priorityAtomIds y E/Z. Exactamente un flag explícito; descriptor preservado en SMILES, redraw y Review. Terminal no estereogénico, ausencia de flag, función añadida y R/S no se admiten como esta familia.

## I. Category semantics

Alkane conserva hidrocarburo saturado acíclico; carbocycle conserva el monociclo saturado central; aromatic conserva un benceno central; ez requiere estereoquímica genuina. Todos son hidrocarburos neutros, sin grupos reconocidos ni principal funcional. Matriz negativa comprueba las otras 16 categorías por grafo; no se reasignan funciones de sufijo.

## J. Difficulty separation

| Fixture group | Easy | Intermediate | Hard | Minimum difficulty |
|---|---|---|---|---|
| alkane, 2 | false | false | true | advanced |
| simple-carbocycle, 2 | false | false | true | advanced |
| aromatic, 2 | false | false | true | advanced |
| ez, E/Z | false | false | true | advanced |

Controles Easy/Intermediate existentes conservan sus bandas, incluida una cadena C12. Quitar un metilo de cada positivo da Intermediate y una respuesta Build válida incorrecta. Tres methyl sin ethyl no se certifican por extrapolación; tampoco cuatro ramas, propyl, quaternary ni direcciones sin competencia en esta familia.

## K. Structural metadata

Hard evidence añade opcionalmente `structuralComplexity`: substituents {locant, carbonCount}, distinctCarbonSubstituentCount, oppositeDirectionLocants y ezConfiguration solo cuando corresponde. Todos derivados de grafo + padre real. Topology usa el tipo existente ExerciseTopology. No nuevos campos en SessionConfig, preguntas persistidas, AttemptRecord, `.quimica` o generation payload.

La dirección opuesta se calcula para describir competencia, manteniendo origen en anillos; no pretende enumerar candidatos ni sustituir las reglas del namer. Tests aparte prueban el empate cíclico desde otro origen y la asignación ethyl 1.

## L. Domain/oracles

Sin cambios de domain/oracles/namer. El predicate reutiliza `validateExerciseDomain(..., intermediate)` para topology/elementos/funciones/cargas/EZ; estos grafos ya estaban dentro del dominio seguro. Verifica referencia bilingüe, familia, grupos vacíos, padre consistente, path/ring y ramas; fail closed ante evidencia ausente/contradictoria u oracle fallido. Domain policies/metadata publicadas siguen legacy/intermediate y 1/2.

## M. Valence

Ocho positivos y round-trips pasan el oracle real. Carbonos de sustitución tienen grado C–C 3; sin geminal/quaternary. Dos ramas extra sobre uno de esos carbonos producen valencia 5 y se rechazan. Policiclos manuales químicamente válidos se rechazan por perfil/Build; importador también cierra spiro/bridged/aromático fused antes de naming. No relax de valencia.

## N. Namer ES/EN

Ocho expected congelados desde los sondeos previos al cambio; el writer verifica nombres/identidades antes/después. Nombres ES sistemáticos y EN legacy 1979 intactos. Padre/locantes/identidades/fórmulas y nombres repetidos en round-trip y redraw. No bug de namer descubierto ni arreglo de referencias para hacer pasar tests.

## O. Build

Ocho targets × copia, remap/arrays invertidos/rotación/escala y SMILES round-trip → EQUIVALENT. Remapping conserva IDs del ring. Cuatro isómeros de locante → DIFFERENT_STRUCTURE; quitar metilo o cambiar ethyl por methyl → DIFFERENT_ELEMENTS con submission válida. No constraint de Difficulty sobre el alumno.

Factories/equality/editor unchanged. A diferencia de los enynes D4.2A, estos hidrocarburos ya pertenecen al dominio Build actual; no se presenta el opt-in como expansión inexistente. La certificación de targets usa Hard evidence, mientras las respuestas usan el dominio neutral actual o la capacidad Hard existente.

## P. E/Z equality/stereo

E y Z comparten constitutional identity NOSTEREO y difieren en structuralIdentity estereo y sufijo Build `|ez:E/Z`. El cambio con `setDoubleBondGeometry` da constitutionEqual true/stereoEqual false/DIFFERENT_STEREOCHEMISTRY; quitar flag también difiere. Configuración no depende de comparar números de coordenadas. Sin formato nuevo de identity ni múltiples centros.

## Q. Reviewer/reasoning compatibility

16 ReviewModels (ocho grafos × ES/EN): CORRECT, sin issues, nombres coherentes, highlights válidos. Paso E/Z solo en ambos explícitos y descriptor E/Z correcto; aromatic Kekulé no crea enseñanza E/Z. Sin Reviewer/reasoning/i18n changes. DIFFICULTY-D4-REASON-001 (links textuales EN enyne) y pedagogía/diagnóstico Hard completo siguen D7, sin afectar estos controles estructurados.

## R. D4 regression

Anchors y familias D4 conservan nombres/identidades/classification/prioridad/Build. Corpus y expected históricos no modificados. Solo se amplía el smoke de familias existente; remap de ring se hace coherente para los nuevos grafos.

## S. D4.2A regression

Ester, amine, amide, nitrile, nitro permanecen **5/5 READY**. Diez fixtures y 35 tests conservan expected/predicates; las filas estructurales se excluyen del matching funcional. El test de corpus D4/D4.2A sigue cubriendo sus trece anclas históricas; el nuevo combinado añade las cuatro restantes y verifica 17/17.

## T. Generation freeze

V1/D1 tres niveles; v2/D2 y D3 freeze; v3/D3 Intermediate y D4 todos los niveles: igualdad exacta de plans, generationIndex, structuralIdentity y payload SHA, incluidos MCQ IDs/orden/provenance y Build. Fixtures anteriores intactos. Current **3**, v4 inválida, advanced v1/v2/v3 sigue legacy. Ejemplo basic v1 identity `gJP@DjZh@`, SHA256 `32721d5a075b536ede7e6a816aac07a9390fa5d1c01207e876f9286ee5abaa8f`.

## U. Practice/Exam

No routing/recipes/session/UI edits ni nuevos targets Hard en sesiones. Frozen captures y lifecycle existentes protegen finite/Endless, corrections/replay/Review, drafts/Previous/Next, neutral pre-submit review y atomic grading. PRACTICE-007B/008 y MCQ/regresiones Intermediate incluidos. Sin selector ni leakage pre-submit.

## V. Class Seed / CSV

Fuentes y versiones sin cambios: derivationVersion/schemaVersion **1**, 12 columnas, BOM UTF-8/CRLF/quote-all/protección spreadsheet. Nueve configs CHEM-4B-2026, seeds/fingerprints completos y 18 hashes CSV congelados se verifican en critical/full. Basic v1 participant001 SHA `0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427`; CSV ES SHA `08fbce3413b9930618ec00a9f3b7fd93bee54f3a8e884c662ad501164e3c4e85`, idénticos.

## W. D4.1 safety gate

Workflow/package unchanged: main → critical → full → build:pages → validate:pages → upload → deploy. Cuatro smoke checks añadidos al test existente de todas las familias: mismos 12 archivos/156 tests críticos, sin inflar CI. Full incluye el nuevo archivo detallado. No deploy/push ejecutado.

Critical final: **156 pass / 0 fail / 0 skip**, exit 0, **291196.2193 ms** (4 min 51 s).

## X. Final coverage matrix

| Category | Hard Foundation |
|---|---|
| alkane | READY |
| alkene | READY |
| alkyne | READY |
| halogenated | READY |
| alcohol | READY |
| aldehyde | READY |
| ketone | READY |
| carboxylic-acid | READY |
| ether | READY |
| ester | READY |
| amine | READY |
| amide | READY |
| simple-carbocycle | READY |
| aromatic | READY |
| ez | READY |
| nitrile | READY |
| nitro | READY |

| Category | Before D4.2B | After | Hard mechanism | ES | EN | Build |
|---|---|---|---|---|---|---|
| alkane | NOT READY | READY | Trialkyl mixto + locantes/alfabeto | exacto | exacto | ✓ |
| simple-carbocycle | NOT READY | READY | Trialkyl mixto + numeración de monociclo | exacto | exacto | ✓ |
| aromatic | NOT READY | READY | Trialkyl mixto + locantes/alfabeto de benceno | exacto | exacto | ✓ |
| ez | NOT READY | READY | Centro E/Z genuino + trialkyl/locantes | exacto | exacto | ✓ |

READY significa foundation, no generación/MCQ/sesiones Hard disponibles.

## Y. TypeScript/lint

TSC baseline/final: exit 2, **32 existentes / 0 nuevos**, logs textualmente idénticos; DIFFICULTY-D1-AUDIT-001 sigue fuera de scope. Sin cleanup/suppressions. ESLint focalizado final: exit 0, sin warnings/errors. `npm run lint`: exit **0**, **0 errors / 11 warnings preexistentes**, todos en archivos sin cambios de esta fase.

## Z. Full validation

Focalizados finales: **41 pass / 0 fail / 0 skip** del archivo estructural, **15422.3555 ms**; **60 pass / 0 fail / 0 skip** de Intermediate/distractores/REASON-UNSAT-001, **102152.3613 ms**. Foundation D4/D4.2A también pasó en la corrida inicial y critical; no se suman ejecuciones superpuestas como tests únicos. ESLint focalizado final: exit 0, sin warnings/errors.

Critical final: **156 pass / 0 fail / 0 skip**, exit 0, **291196.2193 ms**.

`npm test`: **2390 tests / 2385 pass / 0 fail / 0 cancelled / 5 skips históricos**, exit **0**, **2471160.3977 ms** del runner (41 min 11 s). Una ejecución integral completada, sin rerun ni incidencia EBUSY. Skips ESTER-0007/0012/0014/0015/0016 silver existentes, sin exact naming oracle; ninguno nuevo. PRACTICE-007B/008, REASON-UNSAT-001 y TEST-CRLF-001 verdes. Frozen v1/v2/v3, Class/CSV y todos los nuevos positivos/negativos incluidos.

`npm run build`: exit **0**, Worker ESM default.fetch y hosting manifest verificados. `npm run build:pages`: exit **0**, dist-pages, Vite **2.68 s**. `npm run validate:pages`: exit **0**, **3 entries / 3 assets / base /Hydrocarbon-Lab/**. Advertencias habituales de vinext/Node/chunks; sin errores. `npm run lint`: exit **0**, **0 errors / 11 warnings existentes**, sin nuevos warnings.

Wrappers originales test/build/lint con PATH temporal a Git Bash/GNU timeout, fuera del sandbox con acceso autorizado como las fases anteriores. Critical y Pages corrieron en el sandbox. No cambios de scripts, fallback ESLint ni instalación de dependencias. No browser audit: sin comportamiento visible modificado.

`git diff --check`: exit **0**, sin whitespace errors. Los tres archivos nuevos también pasan no-index --check (exit 1 por archivos nuevos, solo avisos LF→CRLF) y QA independiente UTF-8/sin trailing whitespace. Informe con 29 secciones A–AC. Main/HEAD = origin/main inicial conservados, sin staging; dos existentes modificados y tres nuevos, exactamente AA. Stat de existentes: **2 files changed, 96 insertions / 4 deletions**; no incluye los nuevos.

La corrida inicial Hard pasó 113/116; tres fallos fueron tests nuevos que asumían que el importador admitía policiclos. Corregidos los tests, con negativos adicionales por grafo manual, sin alterar química ni nombres. Structural final inicial: 40/40, 14.114 s; se añadió una prueba focalizada de empate y los 41 finales pasaron. No bug independiente nuevo ni fix ajeno.

## AA. Files changed

Tracked existentes: `app/exercise-advanced-profile.ts`; `tests/difficulty-hard-foundation.test.mjs`.

Nuevos no ignorados: `tests/difficulty-hard-structural.test.mjs`; `tests/fixtures/difficulty-d4-2b-hard-structural.json`; `docs/difficulty-d4-2b-hard-structural-coverage.md`.

Separadamente, 21 ignored/temp bajo outputs/difficulty-d4-2b: artifacts-validation.log, baseline.log, candidates-after.log, candidates-before.log, candidates.json, critical.log, final-build.log, final-lint.log, full-suite.log, pages-build.log, pages-validation.log, probe.mjs, structural-final.log, structural-tests.log, targeted-lint-final.log, targeted-lint.log, targeted-regressions.log, typecheck-baseline.log, typecheck-final.log, validate-artifacts.mjs, write-fixture.mjs.

Dist/dist-pages/.sites-runtime, caches normales y métricas D3 escritas por los tests originales permanecen ignorados. Ningún fixture histórico regenerado ni dependencia/script/workflow modificado.

## AB. D5 readiness

La prueba combinada demuestra **17/17** anclas con evidencia positiva independiente. **YES:** foundation lista para que D5 implemente producción determinista generatorVersion 4, sin otro rediseño de domain para estas familias certificadas. D5 todavía debe construir recipes/variantes, integrar/versionar tipos y replay, validar elegibilidad MCQ, diversidad/sweeps y safe exhaustion; foundation no sustituye esos gates ni D7.

DIFFICULTY-D5-SCOPE-001 queda resuelto en la cobertura foundation de categorías mediante D4.2A/B; el informe D5 anterior conserva su resultado histórico, no certifica generación todavía inexistente. Sin bugs independientes nuevos corregidos silenciosamente.

## AC. Out-of-scope confirmation

Sin producción Hard, generatorVersion 4, selector público, fused/spiro/bridged, heterocycles, polycyclic aromatics, R/S, arbitrary functional composer, D7 Reviewer redesign o cleanup TypeScript ajeno. Sin cambios de namer/equality, Class/CSV, UI/editor, scripts o production generation. **No commit, no push, no staging**. Main/HEAD conservados.

DIFFICULTY D4.2B COMPLETE — HARD FOUNDATION 17/17 READY FOR D5
