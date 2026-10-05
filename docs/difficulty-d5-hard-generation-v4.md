# Difficulty D5 — Hard production, generator v4

Producción determinista basada exclusivamente en las 22 familias certificadas D4/D4.2A/D4.2B. Las 17 categorías tienen targets advanced reales y mínimo advanced. El informe D5 bloqueado anterior se conserva sin cambios.

## A. Baseline

HEAD = origin/main `3f3148467d356af74e6e8084e32cc620069e249d`; branch `main`; working tree inicialmente limpio. Current inicial **3**, foundation **17/17**. Historial y nueve contratos leídos completos antes de editar; sin AGENTS.md local. Baseline focalizado ejecutado: **85 pass / 0 fail / 0 skip**, 62.199 s. Baseline release documentado por D4.2B: **156 critical**, **2390 full tests / 2385 pass / 5 skips**, 0 fail; no se presenta esa corrida histórica como validación D5. TSC baseline: **32** diagnósticos existentes.

## B. Previous D5 blocker resolution

Primer D5: **8/17**, correctamente BLOCKED; D4.2A: **13/17**; D4.2B: **17/17**. El bloqueo era cobertura de admisión/certificación, no una autorización para degradar categorías. Ahora las 22 familias ya tienen evidencia independiente de química, nombres, Build y Review; D5 añade constructores sembrados y prueba las 17 rutas de producción. Ningún bloqueo anterior se oculta ni se reescribe.

## C. Generator versioning

| Version | Meaning | Frozen/current |
|---|---|---|
| 1 | generación histórica de todos los levels | frozen |
| 2 | Easy real; demás rutas históricas | frozen |
| 3 | Easy + Intermediate reales; advanced legacy | frozen |
| 4 | Easy + Intermediate + Hard reales | current |

`GENERATOR_VERSION = 4`; supported = `[1,2,3,4]`; 5 se rechaza al reconstruir sesiones. Los fixtures v1/v2/v3 y sus hashes completos pasan sin modificar sus expectativas. Cambiar current no cambia una configuración que almacena versión explícita.

## D. V4 difficulty routing

| Difficulty | Semantic level | Production behavior |
|---|---|---|
| basic | Easy | constructor/perfil D2 preservados |
| intermediate | Intermediate | constructor/perfil D3 preservados |
| advanced | Hard | constructor nuevo + Hard certificado + mínimo advanced |

Única versión current 4 para los tres. IDs internos sin renombrar; omitted difficulty → basic, valores arbitrarios/undefined explícito se rechazan. E/Z basic sigue excluido por el contrato Easy D2: v4 no inventa un E/Z Easy ni cambia esa política.

## E. Hard recipe architecture

`exercise-advanced-candidate.ts` selecciona familia mediante RNG sembrado, elige parámetros legales y construye un solo grafo. Después el generador exige química/valencia, perfil Hard, referencia bilingüe real, mínimo `advanced`, topología, fórmula, SMILES round-trip e identidad. `generation.family` procede de evidencia del grafo, no del nombre elegido por el constructor. La elegibilidad Naming/MCQ/Build y dedupe se conservan después. Si no hay target seguro, error acotado; no cambio de category/type/level.

Ejes enyne disjuntos; funciones en carbonos saturados; carbonilos y C≡N terminales reservados; ramas con valencia disponible. Las familias son switches cerrados, no un composer. Los anillos eligen una tupla de parámetros dentro de un catálogo pequeño sin construir candidatos alternativos; se balancea su orden con semilla de sesión e índice real, sin estado global ni enumeración química. Solo la ruta v4 advanced recibe este constructor.

## F. Production recipe families

22 familias; matching exacto con `HARD_FOUNDATION_FAMILIES`: primeras 13 D4, siguientes 5 D4.2A, últimas 4 D4.2B. La prueba de parámetros legales cubre cada familia y otra prueba genera realmente MCQ, autocalifica Naming ES/EN y compara Build redraw para cada familia.

| Family | Categories | Hard mechanism | Main variability | Naming | MCQ | Build |
|---|---|---|---|---|---|---|
| diol | alcohol | 2 OH; repetición de sufijo | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| dione | ketone | 2 C=O cetónicos; repetición de sufijo | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| amino-alcohol | alcohol | OH principal + NH2 secundario | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| alkoxy-alcohol | alcohol, ether | OH principal + éter secundario | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| hydroxy-aldehyde | aldehyde | CHO principal + OH secundario | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| hydroxy-ketone | halogenated, ketone | cetona principal + OH; Br permitido | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| hydroxy-acid | carboxylic-acid | COOH principal + OH | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| amino-acid | carboxylic-acid | COOH principal + NH2 | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| amino-hydroxy-acid | carboxylic-acid | COOH principal + OH + NH2 | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| enyne-alcohol | alcohol | OH + C=C y C≡C | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| enyne-acid | carboxylic-acid | COOH + C=C y C≡C | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| enyne-hydrocarbon | alkene, alkyne | C=C y C≡C carbonados separados | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| amino-alcohol-enyne-bromo | halogenated, alcohol | OH + NH2 + Br + enyne | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| enyne-ester | ester | éster + enyne | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| enyne-amine | amine | amina primaria + enyne | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| enyne-amide | amide | amida primaria + enyne | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| enyne-nitrile | nitrile | C≡N + enyne carbonado independiente | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| enyne-nitro | nitro | nitro canónico + enyne carbonado | padre C7–9, sitios saturados, metilo; ejes/alkoxy según familia | PASS | PASS | PASS |
| mixed-trialkyl-alkane | alkane | 3 ramas mixtas + competencia de locantes | C1/C2, sitios; C5/C6 o padre C7–9; E/Z si aplica | PASS | PASS | PASS |
| mixed-trialkyl-carbocycle | simple-carbocycle | C5/C6 + 3 ramas mixtas + numeración | C1/C2, sitios; C5/C6 o padre C7–9; E/Z si aplica | PASS | PASS | PASS |
| mixed-trialkyl-benzene | aromatic | benceno + 3 ramas mixtas + numeración | C1/C2, sitios; C5/C6 o padre C7–9; E/Z si aplica | PASS | PASS | PASS |
| mixed-trialkyl-ez | ez | E/Z genuino + 3 ramas mixtas + numeración | C1/C2, sitios; C5/C6 o padre C7–9; E/Z si aplica | PASS | PASS | PASS |

## G. All-17 category matrix

| Category | v4 Advanced | Recipe | Hard proof | Naming | MCQ | Build | Practice | Exam |
|---|---|---|---|---|---|---|---|---|
| alkane | READY | mixed-trialkyl-alkane | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| alkene | READY | enyne-hydrocarbon | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| alkyne | READY | enyne-hydrocarbon | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| halogenated | READY | hydroxy-ketone, amino-alcohol-enyne-bromo | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| alcohol | READY | diol, amino-alcohol, alkoxy-alcohol, enyne-alcohol, amino-alcohol-enyne-bromo | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| aldehyde | READY | hydroxy-aldehyde | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| ketone | READY | dione, hydroxy-ketone | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| carboxylic-acid | READY | hydroxy-acid, amino-acid, amino-hydroxy-acid, enyne-acid | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| ether | READY | alkoxy-alcohol | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| ester | READY | enyne-ester | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| amine | READY | enyne-amine | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| amide | READY | enyne-amide | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| simple-carbocycle | READY | mixed-trialkyl-carbocycle | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| aromatic | READY | mixed-trialkyl-benzene | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| ez | READY | mixed-trialkyl-ez | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| nitrile | READY | enyne-nitrile | mínimo advanced | PASS | PASS | PASS | PASS | PASS |
| nitro | READY | enyne-nitro | mínimo advanced | PASS | PASS | PASS | PASS | PASS |

**17/17 READY**; los resultados corresponden a generador, oracles y sesiones reales, no fixtures manuales usados como templates.

## H. Difficulty separation

Easy: alcano lineal saturado, incluso C12, sigue mínimo basic; la longitud sola no lo hace Hard. Intermediate: fixture D0 #4 `OCC=CC(C)C([N+](=O)[O-])C` conserva mínimo intermediate. Hard: v4 `6-ethyl-2,5-dimethyloctane` tiene tres ramas mixtas y locantes competidores; un diol tiene dos OH; un enyne tiene C=C y C≡C carbonados separados. Classifier compartido aplica Easy → Intermediate → Hard certificado → unsupported. Los 136 targets del grid Hard fallan Easy/Intermediate y pasan Hard/minimum advanced; 33 contextos v4 basic/intermediate conservan sus contratos y repetición/locale.

## I. Functional priority

La jerarquía funcional existente decide el principal: COOH sobre OH/NH2; CHO/cetona sobre OH; OH sobre NH2/éter. No nueva tabla de prioridad, fallback ni sufijo asignado por category. El oracle real selecciona padre y grupo principal antes de la admisión; tests de foundation y producción comprueban coherencia.

## J. Repeated functions

Diol y dione mantienen dos sitios distintos, incluidos en el padre; multiplicadores y locantes provienen del namer existente. Una insaturación opcional no comparte carbono con el carbonilo. Tests verifican ambas funciones, ES/EN y equivalencia; cambiar OH por NH2 en un grafo comparable devuelve DIFFERENT_ELEMENTS.

## K. Multiple secondary functions

amino-hydroxy-acid: COOH + OH + NH2; amino-alcohol-enyne-bromo: OH + NH2 + Br y ambos ejes. Solo esas combinaciones certificadas, con sitios legales; sin mezcla libre de todas las features ni N sustituido. Metadata del Review conserva principal/secundarios.

## L. En + in

Exactamente un C=C y un C≡C carbonados separados en las familias enyne. C=O y C≡N no cuentan como eje carbonado. No diene/diyne ni ejes acumulados. Dos orientaciones de órdenes y sitios legales varían con la semilla; nitrile conserva además su C≡N terminal. Build distingue la pérdida de cada eje.

## M. Alkane structural Hard

Padre C7–9 seleccionado finalmente por el namer; exactamente tres ramas C1/C2, con ambos tamaños presentes, sitios distintos y conjunto de locantes no simétrico. Etilos interiores evitan alargar un padre competidor. Variantes un etilo/dos metilos o dos etilos/un metilo; dificultad por sustitución/numeración, no tamaño.

## N. Simple-carbocycle Hard

Un único C5/C6 saturado, tres ramas mixtas. Parámetros consecutivos/1,2,4 y ambas distribuciones C1/C2 producen **18 identidades** en el espacio cerrado actual. El namer decide numeración y desempates. Sin ciclos fusionados, spiro, bridged, heterociclos ni nuevas funciones sobre anillo.

## O. Aromatic Hard

Un benceno con tres ramas mixtas; **10 identidades** del espacio cerrado actual. Los tres dobles Kekulé representan aromaticidad, no trigger enyne/poliinsaturación. Hard deriva de sustitución y numeración. Metadata, SMILES y redraw se verifican bajo el dominio existente.

## P. E/Z Hard

Un doble explícito y genuinamente estereogénico + tres ramas mixtas. Constructor usa `setDoubleBondGeometry`; inspector CIP, referencia y round-trip reales acuerdan E/Z. Review preserva descriptor/highlights; Build separa igualdad constitucional/estereo: flag opuesto o ausente devuelve DIFFERENT_STEREO. Sin inferir E/Z de coordenadas ni R/S.

## Q. Valence safeguards

No modificaciones al validator/oracles. Se eligen sitios saturados libres y presupuestos de enlace antes de añadir OH/NH2/Br/ramas; C=O/C≡N están reservados. Nitro exige N+(=O)O− exacto. Tests de D4/A/B retienen malformed valence/charge/metadata; todos los candidatos raw legales admitidos. Oracle de valencia forzado a fallar agota 16 y lanza error, nunca devuelve menor dificultad.

## R. Category semantics

Se preservan los 17 IDs. Funciones de sufijo siguen al principal real; halo/nitro/éter sirven como anclas de feature donde el contrato existente lo permite. Hydrocarbon alkene/alkyne usa enyne sin funciones. Ninguna recipe se reclasifica como otra categoría para rescatar una sesión.

## S. Namer ES/EN

Namer, prioridad, selección de padre y localización química sin diff. Se exigen nombres utilizables en ambos locales y referencia/round-trip coherentes. El perfil EN legacy se preserva. Fix acotado **DIFFICULTY-D4-REASON-001** adapta los spans escritos EN enyne ya verificados: IDs semánticos independientes y bonds reales, sin construir nombres ni rediseñar la pedagogía D7.

## T. Naming

Targets reales de las 17 categorías y 22 familias se autocalifican correctamente en ES/EN con el matcher actual. Locale no altera grafo, fórmula, índices ni familia. Pruebas PRACTICE-008 conservan el contrato de respuestas por referencia, no distractores convertidos en respuestas correctas.

## U. MCQ

Cada MCQ admitida tiene cuatro opciones: una correcta y tres alternativas seguras, únicas y verificadas; IDs/order estables ES/EN y repeat. Se reutilizan recipes actuales, con source Hard v4 y dominio neutral de alternativas. Movimiento funcional soporta los grupos OH/NH2/cetona reales de targets múltiples. Edición de rama en anillo puede renumerar canónicamente; se verifica el modelo completo contra los carbonos reales restantes.

**DIFFICULTY-D5-MCQ-001**: el primer piloto descartaba alternativas de benceno válidas al exigir locantes antiguos después de renumeración. Corrección limitada a Hard v4; no nuevo taxonomy ni distractor arbitrario. Si faltan tres seguros, el selector usa su búsqueda acotada; no degrada level/category/type. El barrido final tuvo 7 rechazos de capacidad, resueltos dentro de máximo 3 intentos de pregunta.

## V. Build

SessionConfig original llega a evaluación Practice/Exam y validación neutral pre-submit. Hard se activa automáticamente solo para v4 advanced; opt-in manual anterior se conserva. Dominio neutral admite current/Intermediate/Hard certificado, sin imponer Difficulty del target al estudiante. Evaluador constitucional/estereo, editor y molecule serialization sin cambios.

Pruebas: redraw con IDs/orden/coordenadas diferentes equivalente; rama faltante, locante cambiado, OH secundario faltante, función distinta, eje enyne perdido y E/Z errado se califican incorrectos. Graphs válidos comparables reciben diagnóstico estructural, no rechazo por level.

## W. Practice finite

Las 17 categorías completan Naming/MCQ/Build en Practice (5 preguntas cada sesión, dos semillas Naming). Representativas alkane/alcohol/ester/nitrile completan **5/10/20/30** Naming, sin duplicados. La capacidad finita de ring/aromatic se respeta; pedir más que el espacio certificado da error explícito, no promesa de completar cualquier count.

## X. Practice Endless

Aromatic advanced v4 recorre 40 preguntas con reciente ≤8, keys e identidades sin duplicados dentro de ventana; luego `endPractice` completa. Espacio cerrado pequeño requiere schedule sembrado balanceado; no memoria ilimitada, estado global ni inflar retries.

## Y. Exam

Las 17 categorías crean planes finitos de cada tipo. Prueba mixta verifica drafts, Previous/Next, locale y plan congelado. Validación Build antes de submit recibe solo contexto neutral: no target/correctness ni attempts. Error de grading deja review y cero attempts; retry correcto crea seis attempts atómicamente; re-submit idempotente. Review post-submit usa el plan original congelado. Sin pistas públicas de Difficulty/category.

## Z. Corrections / Attempt Log / Review

Seis iniciales mixtas incorrectas se corrigen en EN contra el grafo original; Difficulty/version preservadas, attemptNumber **2**, attempts iniciales/initialResults inmutables. Session Review reconstruye con config almacenada; no usa nivel UI actual. No campo Difficulty nuevo en AttemptRecord: metadata de sesión ya es suficiente. Review real ES/EN/highlights pasa en las 17 categorías; no redesign D7.

## AA. Versioned reconstruction

Fixtures históricos v1/v2/v3 se reconstruyen exactamente en procesos frescos. Fixture nuevo v4 contiene 17 planes Exam de tres tipos (51 preguntas), ordinal, generationIndex, graph identity, family, nombres/fórmula, payload hashes, hashes de opciones y Build target identity. Dos capturas ES y una EN desde procesos nuevos coinciden completas. Test separado ordinal **7 / generationIndex 11** reconstruye amide original y rechaza config con versión/difficulty incorrecta. No Math.random/Date.now durante captura.

## AB. Locale independence

Grid repetido y fixture fresco ES/EN prueban misma química, identidad, familia, generationIndex, type ordering, MCQ IDs/order y Build targets. Solo presentación/reference.name se proyecta al locale de la sesión; Exam conserva referencia congelada ES y names bilingües. Identidades/semillas usan IDs internos.

## AC. Duplicate integrity

PRACTICE-007B conserva clave `questionType + canonical target graph`; Difficulty no entra en la identidad química. No diff en canonicalizer/dedupe/selector. El barrido detectó 5 duplicados reales, descartados sin contarlos como accepted; misma química en otro tipo sigue política existente. Endless recent-history ≤8.

## AD. Safe exhaustion

Límites históricos **16 químicos / 4 duplicate / 12 MCQ search / 8 recientes**, sin cambios. Oracle químico forzado falla los 16 candidatos. Aromatic Naming con count 11 agota su espacio de 10: Practice ERROR `insufficient-unique-questions` tras 10 attempts únicos; Exam EXAM_ERROR conserva cero attempts. Nada de fallback Basic/Intermediate, cambio de topic/type, clonar targets o retry ilimitado. Estos agotamientos intencionales se reportan aparte del sweep normal (0).

## AE. Class Seed

Class/derivation fuente sin diff: schemaVersion/derivationVersion **1**. Version4 participa en fingerprint y namespace; basic conserva forma sin sufijo difficulty, non-basic añade su ID. CHEM-4B-2026 v4 (2 participantes, 6 preguntas mixtas) reconstruye planes ES/EN iguales en los tres niveles. Fingerprint base: `["class-config-v1","exam",6,["alkane","alcohol","ester"],["naming","multiple-choice","build"],4]`; intermediate/advanced añaden `["difficulty",ID]`.

| V4 difficulty | Participant 001 sessionSeed SHA-256 |
|---|---|
| basic | 5b058d10404e711775a16b0ab1517719db4f48c0dcb416a439b41d648b7788ed |
| intermediate | 365ebeb5d737b0e6f8f61fa907ce2c1882470f2685953f4cabcdbdce1ff62925 |
| advanced | 2bc7d76df7acea3683bb115d5f43d94e78c8e8f1a70501f059ba33b7c26a3fae |

Nueve configs históricos v1/v2/v3, seeds/fingerprints completos y 18 CSV hashes permanecen exactos. Basic v1 participant001 SHA `0b3ac85e0dd9e4fcd549bb8c0511f8b82ab6cb047d3f14a400b7efe36b3cc427`; v3 advanced `8ff52c53157bbf3babc95624f9dd5772fb32ad997fe1c31d3000936ffa1f02f5`.

## AF. CSV

No cambio de schema ni columnas: **12**, schemaVersion1, derivationVersion1. Difficulty via fingerprint, generatorVersion4 explícita; row reconstruction restaura ambos. Manifest export con helper de reconstrucción de row existente; no importer de archivos añadido. BOM UTF-8, CRLF, quote-all, orden y protección de spreadsheet preservados. CSV histórico basic v1 ES SHA `08fbce3413b9930618ec00a9f3b7fd93bee54f3a8e884c662ad501164e3c4e85` idéntico.

| V4 difficulty | ES CSV SHA-256 | EN CSV SHA-256 |
|---|---|---|
| basic | 550a69e8dabf94d598723a4d6147d43bd5eb7826e6af7b6ff0f1527551de3cd9 | 255190b06200f2f495c53aa8f18532eb8478243084d374fbe469d0d580ebbbbf |
| intermediate | 06b42c34bddea88fd6e7517549f4f16793b8fe01b7a8d73a872f8af4a44895ea | 8382e5a992435b69b681d6a7910303b9225b0d9d6e7e43a8439a105356e73a0b |
| advanced | 1ca7db4fe9335d87523fea8365959afa2da3433e745597d08a0a772683458d30 | b71960ccf5bb14040ed3ab3404c15e5597d15606d1fba57457fc9fa902cb6391 |

## AG. Frozen fixtures

No fixture histórico regenerado. D1 v1 basic 26 + non-basic 26 por level; D2 v2 Easy26; D3 v2 all-level78 + v3 Intermediate26; D4 v3 all-level78 + nueve Class configs/18 CSV hashes; D4/A/B grafos certificados intactos.

Primer basic v1: identity `gJP@DjZh@`, payload SHA `32721d5a075b536ede7e6a816aac07a9390fa5d1c01207e876f9286ee5abaa8f`; antes/después idénticos. Primer Intermediate v3: `diD@@Ldbbjjjh@@`, SHA `c645c135aff0e842b5391d8530edaf0d7050fc26e07c10471fb1ce02b13dd29a`, idénticos. Nuevo fixture `tests/fixtures/difficulty-d5-hard-v4-session.json`: 51 preguntas, capturedAtHead `3f31484`, SHA bytes `bfef496d5681c48ae761c58f99840d5e3362517540d4355bfbffe9d304e30fe6`. Las assertions de current se actualizan a4 y unknown a5; pruebas históricas implícitas pasan a versión explícita original, sin cambiar expected chemistry.

## AH. Default user behavior

UI sin selector sigue **basic/Easy**, aunque current ahora es **4**. Sin labels/badges/colores/strings nuevos, ni cambio en páginas, filtros públicos o pre-submit. D6 habilitará selección según contratos/eligibilidad existentes; E/Z basic permanece excluido. No browser audit necesario: ningún componente visible editado.

## AI. All-17 sweep

Corrida real: 8 sesiones/category (Practice + Exam; dos seeds Naming, una MCQ y una Build), 5 preguntas por sesión; mediciones finales reproducibles en test permanente. Candidates cuenta cada candidate químico inclusive descartados por capacidad/dedupe, accepted solo targets finalmente únicos.

| Category | Sessions | Candidates | Accepted | Chemistry rejects | Hard rejects | Capability rejects | Duplicate rejects | Exhaustions | Violations |
|---|---|---|---|---|---|---|---|---|---|
| alkane | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| alkene | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| alkyne | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| halogenated | 8 | 41 | 40 | 0 | 0 | 0 | 1 | 0 | 0 |
| alcohol | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| aldehyde | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| ketone | 8 | 41 | 40 | 0 | 0 | 0 | 1 | 0 | 0 |
| carboxylic-acid | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| ether | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| ester | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| amine | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| amide | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| simple-carbocycle | 8 | 44 | 40 | 0 | 0 | 4 | 0 | 0 | 0 |
| aromatic | 8 | 43 | 40 | 0 | 0 | 3 | 0 | 0 | 0 |
| ez | 8 | 42 | 40 | 0 | 0 | 0 | 2 | 0 | 0 |
| nitrile | 8 | 41 | 40 | 0 | 0 | 0 | 1 | 0 | 0 |
| nitro | 8 | 40 | 40 | 0 | 0 | 0 | 0 | 0 | 0 |
| TOTAL | 136 | 692 | 680 | 0 | 0 | 7 | 5 | 0 | 0 |

Oracle rejects = 0 en todas las categorías. Sin agotamientos normales ni violaciones. Los rechazos de capacidad en carbocycle/aromatic son por menos de tres distractores seguros; la búsqueda existente los resuelve sin cambiar level. Intentional exhaustion se verifica en AD, no se mezcla con este total.

## AJ. Performance

Promedio de intentos químicos por llamada **1.000**, máximo **1**; candidates/accepted **1.0176**, incluyendo dedupe/capability. Máximo de intentos de pregunta **3**. Tiempo químico total **104.848 s**, promedio **151.514 ms/candidate**. Sweep 17 categorías **371.608 s**, incluyendo validación y MCQ/Build, distinto del coste exclusivo del generador.

| Category | Chemical ms/candidate | Sweep seconds | Max question attempts |
|---|---|---|---|
| alkane | 127.014 | 16.664 | 1 |
| alkene | 25.142 | 3.463 | 1 |
| alkyne | 35.151 | 4.945 | 1 |
| halogenated | 276.068 | 43.971 | 2 |
| alcohol | 171.280 | 27.807 | 1 |
| aldehyde | 182.604 | 27.970 | 1 |
| ketone | 190.783 | 33.578 | 2 |
| carboxylic-acid | 212.950 | 30.729 | 1 |
| ether | 193.765 | 29.187 | 1 |
| ester | 145.193 | 17.093 | 1 |
| amine | 161.566 | 23.557 | 1 |
| amide | 139.366 | 16.437 | 1 |
| simple-carbocycle | 35.594 | 4.932 | 3 |
| aromatic | 35.941 | 3.954 | 2 |
| ez | 345.245 | 48.658 | 2 |
| nitrile | 128.486 | 15.522 | 2 |
| nitro | 176.649 | 23.140 | 1 |

Practice30: alkane 18.381 s; alcohol 10.210 s; ester 6.980 s; nitrile 7.789 s. Tiempos Windows/Node24, no benchmark comparativo controlado ni predicción CI Node22. Ninguna categoría exige retry patológico; anillos tienen espacio finito pequeño documentado, no intentamos fabricar variabilidad ilimitada. No scans/candidates adicionales globales ni cambio de límites.

## AK. Regression issues

PRACTICE-007B, PRACTICE-008, REASON-UNSAT-001: PASS. D2, D3, D4, D4.2A, D4.2B: PASS; TEST-CRLF-001: PASS. **DIFFICULTY-D5-MCQ-001** corregido para canonical ring renumbering v4. **DIFFICULTY-D4-REASON-001** corregido como adapter EN enyne con exact provenance, siete categorías y bonds individuales. Un caso negativo de desarrollo transformaba diol con C≡C en amino-alcohol no certificado: se corrigió el fixture de prueba para usar variante comparable, no se amplió dominio ni se cambió expected de fixture histórico. Sin fixes independientes silenciosos.

## AL. D4.1 release gate

Workflow/package/scripts sin diff: main → critical → full → build:pages → validate:pages → upload/deploy. Critical mantiene los 12 archivos; un smoke v4 se añade al archivo foundation ya incluido. **156 → 157 tests**, sin incluir el sweep grande en critical. Runtime histórico D4.2B 291.196 s; D5 425.330 s, delta 134.134 s (corridas locales no controladas). Full 2466.247 s. Todos los gates locales PASS; no deploy ejecutado.

## AM. TypeScript / lint

`npx tsc --noEmit`: 32 diagnósticos baseline y 32 finales **textualmente idénticos**, exit2 esperado; **0 nuevos**. Sin suppressions ni cleanup fuera de scope. ESLint focalizado final PASS; wrapper original `npm run lint` PASS, **0 errors / 11 warnings existentes**. PATH temporal Git Bash para wrappers originales Windows; sin editar scripts por el entorno. La primera corrida critical restringida terminó ETIMEDOUT en procesos hijos de captura legacy, incidencia del sandbox ya observada en fases anteriores; la misma suite se repitió fuera del sandbox sin editar código/expectativas ni aumentar timeouts.

## AN. Full validation

Baseline focalizado85 PASS. Nuevos: generator core24 PASS; extensión de familias1 PASS; negativos Build1 PASS; sesiones24 PASS; fixture fresco1 PASS. No se suman corridas superpuestas como tests únicos. Regresiones focalizadas: **227 tests / 227 pass / 0 fail / 0 skips; 282.952 s**.

| Command | Result |
|---|---|
| npm run test:critical | 157 tests / 157 pass / 0 fail / 0 skips; 425.330 s; exit0 |
| npm test (una corrida integral) | 2441 tests / 2436 pass / 0 fail / 5 skips; 2466.247 s; exit0 |
| npm run build | PASS / exit0 |
| npm run build:pages | PASS / exit0 |
| npm run validate:pages | PASS / exit0 |
| npm run lint | PASS / exit0; 0 errors, 11 warnings previos |
| git diff --check | PASS / exit0 |

Cinco skips silver históricos ESTER-0007/0012/0014/0015/0016 por falta de exact naming oracle; ningún skip nuevo. Build Worker y Pages originales sin cambios; sin instalación de dependencias ni browser audit. npm test incluye su build original y todas las nuevas suites, serializadas para evitar EBUSY de cache Vite en Windows.

## AO. Files changed

28 archivos de repositorio (modificados + nuevos, sin staging):

- app/exam-session.ts
- app/exercise-advanced-candidate.ts
- app/exercise-chemical-generator.ts
- app/exercise-generation-profile.ts
- app/exercise-model.ts
- app/practice-distractor-engine.ts
- app/practice-distractor-recipes.ts
- app/practice-session.ts
- app/practice-structural-answer.ts
- app/reasoning-name-fragments.ts
- app/session-answer-evaluation.ts
- docs/difficulty-d5-hard-generation-v4.md
- tests/class-assignment.test.mjs
- tests/difficulty-easy.test.mjs
- tests/difficulty-hard-foundation.test.mjs
- tests/difficulty-hard-frozen.test.mjs
- tests/difficulty-hard-generation-frozen.test.mjs
- tests/difficulty-hard-generation-session.test.mjs
- tests/difficulty-hard-generation.test.mjs
- tests/difficulty-hard-structural.test.mjs
- tests/difficulty-intermediate-session.test.mjs
- tests/difficulty-intermediate.test.mjs
- tests/difficulty-plumbing.test.mjs
- tests/exercise-model.test.mjs
- tests/exercise-seed.test.mjs
- tests/fixtures/difficulty-d5-hard-v4-session.json
- tests/helpers/difficulty-hard-v4-snapshot.mjs
- tests/practice-session.test.mjs

Justificación: constructor nuevo; routing/version4/guardrails; contexto Build original; MCQ seguro v4; adapter EN enyne; ajustes de assertions/current y versiones históricas explícitas; tests/fixture/report permanentes. Foundation/classifier/domain/namer/canonicalizer/Class/CSV source, UI, workflows, scripts y lockfile sin diff.

Separadamente, ignored/temp bajo `outputs/difficulty-d5-v4/` (no modificaciones de repositorio):

- artifact-validation.json
- artifacts-validation.log
- baseline.log
- build-negative-tests.log
- capture-v4.mjs
- chemical-sweep-initial.json
- chemical-sweep.json
- critical.log
- diff-check.log
- final-build.log
- final-lint.log
- fixture-capture.log
- full-suite.log
- generation-family-tests.log
- generation-tests.log
- pages-build.log
- pages-validation.log
- probe.json
- probe.log
- probe.mjs
- report-generation.log
- session-sweep.json
- session-tests.log
- targeted-lint-final.log
- targeted-lint.log
- targeted-regressions.log
- typecheck-baseline.log
- typecheck-development.log
- typecheck-development2.log
- typecheck-final.log
- v4-frozen-tests.log
- validate-artifacts.mjs
- validation-results.json
- write-report.mjs

## AP. D6 readiness

**YES.** D6 puede exponer Easy/Intermediate/Hard sobre las 17 categorías conforme a sus contratos y elegibilidad existente, sin rediseñar química para lograr Hard 17/17. Advanced v4 tiene producción verdadera y mínimo advanced; v1–v3 frozen; Naming/MCQ/Build/sesiones/reconstrucción/locale/Class/CSV y todos los gates verdes. La exclusión histórica Easy E/Z sigue explícita; no se autoriza degradarla para mostrar una combinación no soportada. D7 conserva el trabajo pedagógico amplio; este D5 solo evita ruptura de Review y corrige el adapter enyne preciso.

Fuera de scope confirmado: sin selector público, sulfur, R/S, expansión de heterociclos/fused/spiro/bridged, composer arbitrario, retry inflation, cleanup TS ni redesign Reviewer D7. **No commit. No push.** Branch/main y HEAD baseline conservados; cambios revisables sin staging.

DIFFICULTY D5 COMPLETE — GENERATOR V4 HARD PRODUCTION 17/17 READY FOR D6
