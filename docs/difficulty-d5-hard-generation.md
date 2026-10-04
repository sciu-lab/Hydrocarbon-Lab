# Difficulty D5 — bloqueo de cobertura Hard

**Estado: BLOCKED, antes de implementar generación v4.** D5 exige no dejar huecos mayores para D6; las familias certificadas por D4 solo permiten ocho de las 17 anclas. Completar las otras nueve requiere ampliar o cambiar el contrato químico que esta solicitud conserva. No se activó un current v4 parcial ni se reinterpretó advanced histórico.

## A. Baseline

HEAD y origin/main: `46bb1afddb2d53e8c2fe485a2d9a075d7b098628`. Branch `main`, working tree inicialmente limpio y sincronizado. Historial verificado de doce commits: D0, D1, D2, D3, D4, D4.1 y regresiones anteriores. Current generator 3; soportados 1/2/3. Los seis documentos D0–D4.1 fueron leídos completos antes de escribir este informe; se inspeccionaron los diez módulos señalados en la solicitud y sus consumidores de configuración/Class/CSV.

Baseline focalizado de esta auditoría: **test:critical 156 pass / 0 fail / 0 skip**, exit 0, `641401.5314 ms` (10 min 41 s). Sondeo adicional con oráculos reales: exit 0. Validación integral al cierre en AI; no se presentan resultados históricos como ejecuciones D5.

## B. Versioning

| Versión | basic | intermediate | advanced | Estado en esta auditoría |
|---|---|---|---|---|
| 1 | Legacy | Legacy | Legacy | Congelada |
| 2 | Easy | Legacy | Legacy | Congelada |
| 3 | Easy | Intermediate | Legacy | Current conservado |
| 4 | Easy previsto | Intermediate previsto | Hard previsto | No implementada; normalización la rechaza |

El rechazo actual de versión 4 es correcto para este resultado bloqueado. No se hicieron alias ni bump de generator/domain/schema/derivationVersion.

## C. V4 routing

No existe routing v4. `exerciseGenerationProfile` mantiene las políticas publicadas; advanced conserva legacy en v1/v2/v3. Cambiar solo la constante current habría publicado una promesa Hard falsa. La implementación futura debe introducir una rama v4 explícita y conservar las ramas anteriores.

## D. Hard production contract

No se implementó producción Hard. Foundation D4 exige grafo válido conectado, C/O/N/F/Cl/Br/I, neutro, acíclico, sin R/S ni E/Z explícito, padre real C6–C9, funciones/ejes sobre el padre, como máximo un metilo y grado C–C ≤3. Solo permite las 13 filas del registry y sus límites individuales; methoxy/ethoxy fuera del padre únicamente en alkoxy-alcohol. Estas restricciones son incompatibles con nueve anclas.

## E. Recipe architecture

El registry D4 es una lista de **familias de admisión**, no recetas de generación. El productor actual construye legacy/Easy o Intermediate y valida química, dominio, referencia bilingüe, padre, fórmula, SMILES round-trip e identidad. No llama al perfil Hard. La futura promoción debe construir slots legales por familia y verificar el grafo resultante; esta auditoría no crea un compositor ni usa fixtures SMILES como productor.

## F. Certified recipe families

Las siguientes son familias foundation existentes; ninguna se promovió a receta de producción D5. Variabilidad significa envelope admitido por D4, no un sweep de variantes generadas.

| Family | Principal | Secondary | Unsaturation C–C | Variability D4 | Categories |
|---|---|---|---|---|---|
| diol | alcohol ×2 | — | 0–1 doble o triple | Dos sitios distintos, ≤1 metilo | alcohol |
| dione | ketone ×2 | — | 0–1 doble | Dos sitios distintos, ≤1 metilo | ketone |
| amino-alcohol | alcohol | NH2 | 0–1 doble | NH2 primaria, ≤1 metilo | alcohol |
| alkoxy-alcohol | alcohol | ether | 0–1 doble | Methoxy/ethoxy, ≤1 metilo | alcohol, ether |
| hydroxy-aldehyde | aldehyde | OH | 0–1 doble | CHO y OH sobre padre | aldehyde |
| hydroxy-ketone | ketone | OH | 0–1 doble | Un Br opcional | ketone, halogenated con Br |
| hydroxy-acid | carboxylicAcid | OH | 0–1 doble | Funciones sobre padre | carboxylic-acid |
| amino-acid | carboxylicAcid | NH2 | 0–1 doble | NH2 primaria sobre padre | carboxylic-acid |
| amino-hydroxy-acid | carboxylicAcid | OH, NH2 | 0–1 doble | Tres motivos explícitos | carboxylic-acid |
| enyne-alcohol | alcohol | — | Un doble y un triple | Ejes no cumulados | alcohol |
| enyne-acid | carboxylicAcid | — | Un doble y un triple | Ejes no cumulados | carboxylic-acid |
| enyne-hydrocarbon | — | — | Un doble y un triple | Sin funciones | alkene, alkyne |
| amino-alcohol-enyne-bromo | alcohol | NH2, Br | Un doble y un triple | Exactamente un Br | alcohol, halogenated |

## G. Category matrix

**Todas las rutas v4 están bloqueadas globalmente**, porque v4 no se implementó. Naming/Build de esta tabla describen evidencia manual D4, no preguntas producidas; MCQ Hard sigue sin certificación. No existe preflight v4 ni safe-exhaustion v4 que pueda declararse probado.

| Category | v4 Advanced | Recipe(s): posible promoción D4 | Naming manual | MCQ Hard | Build optativo | Exhaustion / bloqueo |
|---|---|---|---|---|---|---|
| alkane | BLOCKED | Ninguna | Sin caso Hard | No certificado | Sin target Hard | Ancla saturada sin trigger; D0 excluye Hard alkane |
| alkene | BLOCKED; D4 elegible | enyne-hydrocarbon | Referencia D4 | No certificado | D4 | Producción no implementada |
| alkyne | BLOCKED; D4 elegible | enyne-hydrocarbon | Referencia D4 | No certificado | D4 | Producción no implementada |
| halogenated | BLOCKED; D4 elegible | hydroxy-ketone con Br; amino-alcohol-enyne-bromo | Referencia D4 | No certificado | D4 | Producción no implementada |
| alcohol | BLOCKED; D4 elegible | diol, amino/alkoxy-alcohol, enyne-alcohol, variante Br | Referencia D4 | No certificado | D4 | Producción no implementada |
| aldehyde | BLOCKED; D4 elegible | hydroxy-aldehyde | Referencia D4 | No certificado | D4 | Producción no implementada |
| ketone | BLOCKED; D4 elegible | dione, hydroxy-ketone | Referencia D4 | No certificado | D4 | Producción no implementada |
| carboxylic-acid | BLOCKED; D4 elegible | hydroxy/amino/amino-hydroxy/enyne-acid | Referencia D4 | No certificado | D4 | Producción no implementada |
| ether | BLOCKED; D4 elegible | alkoxy-alcohol | Referencia D4 | No certificado | D4 | Producción no implementada |
| ester | BLOCKED | Ninguna | Sin caso Hard | No certificado | Sin target Hard | Motivo ausente del registry |
| amine | BLOCKED | Ninguna como principal | Sin caso Hard | No certificado | Sin target Hard | NH2 solo secundario bajo OH/COOH |
| amide | BLOCKED | Ninguna | Sin caso Hard | No certificado | Sin target Hard | Motivo ausente del registry |
| simple-carbocycle | BLOCKED | Ninguna | Sin caso Hard | No certificado | Sin target Hard | Perfil Hard rechaza todo ciclo |
| aromatic | BLOCKED | Ninguna | Sin caso Hard | No certificado | Sin target Hard | Perfil Hard rechaza todo ciclo |
| ez | BLOCKED | Ninguna | Sin caso Hard | No certificado | Sin target Hard | E/Z marcado rechazado; enyne no sustituye E/Z |
| nitrile | BLOCKED | Ninguna | Sin caso Hard | No certificado | Sin target Hard | Motivo ausente del registry |
| nitro | BLOCKED | Ninguna | Anchor D0 es Intermediate | No certificado | Sin target Hard | Cargas/nitro Hard no certificados |

La ausencia de nueve rutas no se deduce solamente de un corpus pequeño: el predicate exige coincidencia exacta de motivos con el registry, principal para anclas de sufijo, presencia para feature categories y excluye ciclos/cargas/EZ antes de esa coincidencia. El único hidrocarburo foundation es enyne y solo admite alkene/alkyne. Por tanto, variantes dentro de las mismas filas no pueden cubrir las nueve anclas.

## H. Difficulty separation

Se conserva el classifier canónico: un alcohol elemental es basic; los cuatro primeros anchors D0 son intermediate; los diez siguientes y tres extras D4 son advanced. Longitud sola no da Hard. El anchor nitro-alcohol `4-metil-5-nitrohex-2-en-1-ol` permanece Intermediate. No se reclasificó para cubrir nitro Hard.

## I. Functional priority

Foundation reutiliza la jerarquía real: acid vence OH/NH2; aldehyde y ketone vencen OH; ether actúa como alkoxy bajo alcohol. No hay reescritura de sufijos. NH2 secundario no convierte el target en category amine.

## J. Repeated functions

Diol/diona manuales certificados, en sitios distintos del padre; sin triol/trione/geminal OH. Producción sembrada y diversidad D5 pendientes.

## K. Multiple secondary functions

Acid + OH + NH2 y amino-alcohol-enyne-bromo existen como familias/fixtures. No se compusieron nuevas funciones para completar otras categorías.

## L. En + in

Foundation certifica enyne hidrocarbonado, alcohol, acid y amino-alcohol con Br; no diene/diyne. Las anclas alkene/alkyne del hidrocarburo son admitidas expresamente por D4. No existe todavía producción v4 de estas familias.

## M. Valence safeguards

Oráculos y límites originales intactos. No se añaden sustituyentes sobre carbono sp ni se aumenta 16 intentos químicos, cuatro candidatos ordinarios o doce MCQ. La regresión de triple+Br sobrevalente permanece en critical/full.

## N. Domain/oracles

DomainPolicy legacy/intermediate y metadata 1/2 intactos. Hard foundation sigue optativo y utiliza detectFunctionalGroups, referencia del namer, jerarquía, padre y validación de valencia reales. No se relajan guards para salvar categorías.

## O. Namer ES/EN

Sin cambios. El sondeo compara los 17 grafos del corpus D4 con los nombres bilingües exactos ya congelados. Ningún nombre nuevo escrito a mano ni fixture esperado sustituido.

## P. Naming

Las referencias manuales D4 conservan nombres. No hay sesión Naming Hard v4 ni self-acceptance de una sesión nueva v4 que certificar. Las rutas publicadas se verifican por sus regresiones existentes.

## Q. MCQ

Sin cambios de recipes/domain/IDs/provenance. D4 no certificó MCQ Hard; tres distractores seguros y elegibilidad bilateral siguen siendo trabajo necesario de D5. Esta auditoría no degrada MCQ a Naming ni fabrica opciones.

## R. Build

Factories current y hard-foundation intactos. El sondeo usa opt-in para comparar cada grafo admitido consigo mismo bajo todas sus anclas compatibles. No implica wiring a sesiones v4; default/equivalence/editor se preservan.

## S. Practice finite

No se implementaron sesiones Hard v4 de 5/10/20/30. Las sesiones v1/v2/v3 y sus fixtures siguen siendo el baseline. No se reduce count, cambia category o acepta duplicados para completar planes.

## T. Practice Endless

No Hard v4. La ventana existente de ocho identidades se conserva y las regresiones históricas siguen verificándola; no memoria ilimitada.

## U. Exam

No Hard v4. Plan/drafts/navigation/neutral review/grading atómico y privacidad actuales se conservan. Sin metadata o pistas nuevas pre-submit.

## V. Reconstruction

Replay v1/v2/v3 sigue usando config/version/generationIndex original y sus fixtures. V4 es rechazado explícitamente; no se reconstruye a través del current ni se inventa un replay v4.

## W. Corrections / Attempt Log / Review

Sin cambios de configuración original, attempt numbering, score/mastery ni schemas. No campo Difficulty redundante en AttemptRecord. V4 corrections/Review pendientes de una generación certificada.

## X. Locale independence

Fixtures históricos mantienen ES/EN química/opciones/targets iguales. El sondeo foundation comprueba ambos nombres por grafo. No se generaron planes v4 bilingües y no se afirma determinismo de planes inexistentes.

## Y. Class Seed

CHEM-4B-2026 y nueve configuraciones v1/v2/v3 se comparan por fingerprints/semillas completos en critical; derivationVersion sigue 1. V1 basic participant 001 seed SHA256 congelado: `0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427`. No assignment/session v4 certificado.

Fingerprint legacy/basic idéntico: `["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],1]`. V3 advanced conserva su framing publicado: `["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],3,["difficulty","advanced"]]`; participant 001 seed SHA256 `8ff52c53157bbf3babc95624f9dd5772fb32ad997fe1c31d3000936ffa1f02f5`, idéntico. Las assertions comparan strings completos, no solo hashes. El snapshot está en tests/fixtures/difficulty-d4-frozen-v3-session.json, sin modificaciones.

## Z. CSV

SchemaVersion 1, doce columnas, difficulty dentro de config_fingerprint, generator_version existente, UTF-8 BOM/CRLF/quote-all/protección spreadsheet preservados. Dieciocho hashes históricos v1/v2/v3 × tres niveles × ES/EN se verifican en critical. V1 basic ES SHA256: `08fbce3413b9930618ec00a9f3b7fd93bee54f3a8e884c662ad501164e3c4e85`. Sin importer/columna/bump ni CSV v4 certificado.

## AA. Duplicate integrity

Sin cambios de identidad canónica o dedupe questionType + target graph. PRACTICE-007B permanece en el gate. Ni difficulty ni recipe ni locale se agregaron a la clave.

## AB. Safe exhaustion

Se mantienen errores seguros actuales. Las nueve categorías necesitarían incompatibilidad/preflight explícito si se acordara un release Hard parcial; ese acuerdo no está congelado en D5. No se implementa un v4 parcial para luego presentarlo como completo.

## AC. Sweep

No se ejecutó un sweep de sesiones v4: no existe el productor. **Sessions, Candidates, Accepted, Chemistry rejects, Hard rejects, Capability rejects, Duplicate rejects, Exhaustions y Violations de producción v4 son N/E para las 17 categorías**, no ceros de éxito. La tabla G es la matriz completa de cobertura; el sondeo independiente registra 17 grafos ×17 categorías, sin pretender medir diversidad/agotamiento de generación.

| Category | Sessions | Candidates | Accepted | Chemistry rejects | Hard rejects | Capability rejects | Duplicate rejects | Exhaustions | Violations |
|---|---|---|---|---|---|---|---|---|---|
| alkane | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| alkene | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| alkyne | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| halogenated | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| alcohol | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| aldehyde | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| ketone | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| carboxylic-acid | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| ether | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| ester | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| amine | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| amide | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| simple-carbocycle | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| aromatic | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| ez | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| nitrile | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |
| nitro | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E |

Sondeo real: **17 grafos ×17 categorías = 289 comprobaciones**, 17 admisiones de grafo/ancla y 272 rechazos; las **13 familias** tienen evidencia positiva. Ocho categorías admitidas, nueve sin ruta. Los nueve controles negativos adicionales tienen química válida y rechazan Hard por sus fronteras certificadas. **17/17 comparaciones Build self-equivalent; 0 violaciones de las assertions de auditoría**. Los nombres ES/EN coinciden exactamente con el corpus congelado.

| Category | Graphs checked | Manual Hard admissions | Certified families represented |
|---|---:|---:|---|
| alkane | 17 | 0 | — |
| alkene | 17 | 1 | enyne-hydrocarbon |
| alkyne | 17 | 1 | enyne-hydrocarbon |
| halogenated | 17 | 2 | hydroxy-ketone, amino-alcohol-enyne-bromo |
| alcohol | 17 | 5 | diol, amino/alkoxy/enyne-alcohol, variante Br |
| aldehyde | 17 | 1 | hydroxy-aldehyde |
| ketone | 17 | 2 | dione, hydroxy-ketone |
| carboxylic-acid | 17 | 4 | hydroxy/amino/amino-hydroxy/enyne-acid |
| ether | 17 | 1 | alkoxy-alcohol |
| ester | 17 | 0 | — |
| amine | 17 | 0 | — |
| amide | 17 | 0 | — |
| simple-carbocycle | 17 | 0 | — |
| aromatic | 17 | 0 | — |
| ez | 17 | 0 | — |
| nitrile | 17 | 0 | — |
| nitro | 17 | 0 | — |

Los rechazos del sondeo son decisiones de admisión de grafos manuales; no son candidate rejects ni exhaustions de un generador. Evidencia local ignorada: outputs/difficulty-d5/hard-coverage.json.

## AD. Performance

Sin cambio de runtime productivo ni retries. Sondeo completo **16.780 s**, incluidos carga de oráculos, 289 admisiones, nombres/clasificación/Build y controles negativos. Critical **641.402 s** (10 min 41 s); runner integral **2939.106 s** (48 min 59 s), además del build Worker del wrapper. Son duraciones locales Windows/Node 24.19.0, no benchmark comparativo ni medición CI Node 22. No tiempos/attempts de sesiones v4 inexistentes.

## AE. Frozen fixtures

Todos los expected históricos D1/D2/D3/D4 permanecen intactos. Critical pasó las captures en procesos frescos de v1/v2/v3, payload SHA, structuralIdentity, generationIndex, MCQ/Build y Class/CSV: igualdad exacta. V1 basic Naming índice 0 conserva identity `gJP@DjZh@` y SHA256 `32721d5a075b536ede7e6a816aac07a9390fa5d1c01207e876f9286ee5abaa8f`. V3 Intermediate índice 0 conserva identity `diD@@Ldbbjjjh@@` y SHA256 `c645c135aff0e842b5391d8530edaf0d7050fc26e07c10471fb1ce02b13dd29a`. No fixture v4 nuevo, porque no existe generación v4.

| Version | Historical fixtures | Result |
|---|---|---|
| 1 | D1, tres niveles, 26 preguntas/nivel | Exactos |
| 2 | D2 basic + D3 freeze de los tres niveles | Exactos |
| 3 | D3 Intermediate + D4 freeze de los tres niveles | Exactos |
| 4 | No creado | No certificado |

## AF. Regression issues

**DIFFICULTY-D5-SCOPE-001 — bloqueo de contrato/cobertura, no bug químico nuevo:** D5 §§18/75/77 exige no dejar huecos mayores; [D0 §S](difficulty-v1-contract.md#s-recommended-v1-scope) excluye Hard alkane/rings/EZ y ester/amide/nitrile multifuncionales; [D4 §C](difficulty-d4-hard-foundation.md#c-hard-foundation-contract), [§K](difficulty-d4-hard-foundation.md#k-unsupported-boundaries) y [§AC](difficulty-d4-hard-foundation.md#ac-d5-readiness) conservan esas fronteras y exigen evidencia independiente para nuevas familias. Nueve anclas quedan fuera; el registry actual no puede cubrirlas por simple plumbing.

Para continuar se necesita una decisión de alcance concreta: aceptar un release parcial con incompatibilidades explícitas y ajustar el criterio de D5/D6, o ampliar primero el contrato/corpus foundation para las nueve categorías (incluida una definición nueva de Hard alkane). Esta auditoría no toma esa decisión pedagógica ni altera D0/D4 unilateralmente.

PRACTICE-007B, PRACTICE-008, REASON-UNSAT-001 y D2/D3/D4 **pasaron en la integral de esta auditoría**. Critical también pasó las regresiones incluidas en sus doce archivos. DIFFICULTY-D4-REASON-001 (links EN enyne) continúa pendiente de D7, sin redesign aquí. No se arreglaron bugs independientes silenciosamente.

## AG. D4.1 safety gate

Workflow/package originales conservados: main → critical → full → build:pages → validate:pages → upload → deploy, sin bypass/continue-on-error. Critical **156/0**, integral **2309 pass/0 fail**, Pages build y validación **exit 0**. Artefacto **3 entries / 3 assets / base /Hydrocarbon-Lab/**. No smoke v4 agregado porque no existe Hard production v4. La validación local no publica nada en GitHub.

## AH. TypeScript delta

`node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit 2, **32 diagnósticos existentes / 0 nuevos**. Todas las fuentes TypeScript son idénticas a HEAD; `git diff HEAD --name-only -- app tests scripts package.json package-lock.json .github/workflows/deploy-pages.yml` no reporta cambios. El conteo coincide con D4/D4.1; no se elimina la deuda DIFFICULTY-D1-AUDIT-001 ni se agregan suppressions. Log ignorado: outputs/difficulty-d5/typecheck.log.

## AI. Full validation

`npm run test:critical`: **156 pass / 0 fail / 0 skip**, exit 0. Sondeo adicional: exit 0, métricas en AC.

`npm test`: **2314 tests / 2309 pass / 0 fail / 0 cancelled / 5 skips históricos**, exit 0; `2939105.5208 ms` del runner. Una única ejecución integral completada, sin rerun ni incidencia EBUSY. Skips ESTER-0007/0012/0014/0015/0016 intactos; ninguno nuevo. Todos certifican el baseline conservado, **no D5 production readiness**.

`npm run build`: **exit 0**, Worker ESM default.fetch y hosting manifest verificados. `npm run build:pages`: **exit 0**, 5.331 s del comando / 3.10 s de Vite, dist-pages. `npm run validate:pages`: **exit 0**, 2.329 s, **3 entries / 3 assets / base /Hydrocarbon-Lab/**. Advertencias habituales de vinext/chunks, sin errores.

`npm run lint`: **exit 0, 0 errors / 11 warnings preexistentes**, todos en archivos sin modificaciones. No ESLint fallback ni suppressions. `git diff --check`: **exit 0**. El documento nuevo también pasa el chequeo de whitespace contra /dev/null y la comprobación independiente de 38 secciones A–AL / cero trailing whitespace; el diff no-index devuelve 1 por la diferencia de un archivo nuevo y avisa de la conversión Git LF→CRLF, sin errores de whitespace.

npm test/build/lint usaron los wrappers originales con PATH temporal a Git Bash fuera del sandbox, como las fases anteriores; critical y Pages corrieron en el sandbox. No se cambiaron scripts para el entorno. Sin browser audit porque no se tocó UI ni comportamiento visible.

## AJ. Files changed

Único archivo no ignorado nuevo: `docs/difficulty-d5-hard-generation.md` (este informe, untracked). **Lista de archivos tracked modificados: vacía**; sin staging. HEAD = origin/main = `46bb1afddb2d53e8c2fe485a2d9a075d7b098628`; main conservado. `git diff --ignore-cr-at-eol --stat` está vacío porque no incluye este documento nuevo.

Separadamente, diez artifacts ignorados bajo outputs/difficulty-d5:

- audit-hard-coverage.mjs
- hard-coverage.json
- coverage-audit.log
- critical.log
- full-suite.log
- typecheck.log
- final-build.log
- pages-build.log
- pages-validation.log
- final-lint.log

Los tests originales también actualizan métricas ignoradas de D3; dist, dist-pages, .sites-runtime y caches habituales siguen ignorados. Sin helpers/tests nuevos permanentes ni cambios de package/lockfile/workflow.

## AK. D6 readiness

**No:** D6 no puede exponer Hard con solo UI/config. Advanced current sigue legacy y faltan nueve rutas foundation, recetas v4, MCQ, wiring/replay y sweeps de sesiones. Los tests del baseline verdes no suplen esos requisitos. No iniciar Easy/Intermediate/Hard selector público con este resultado.

## AL. Out-of-scope confirmation

Sin selector público, compositor funcional arbitrario, sulfur, R/S, expansión heterocíclica/anillos complejos, cleanup TypeScript ajeno ni redesign Reviewer D7. Sin cambios de namer, química, seed framing, equivalencia Build, `.quimica`, defaults, scripts, workflow o fixtures históricos. **No commit. No push.** Main/HEAD conservados.

DIFFICULTY D5 BLOCKED — HARD CHEMISTRY NOT READY FOR UI EXPOSURE
