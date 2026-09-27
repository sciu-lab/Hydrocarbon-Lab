# Reauditoría del lote congelado de Hydrocarbon Lab

Se importaron y reexportaron offline los mismos 122 fixtures y CID del informe histórico. No se consultó Internet ni se modificaron referencias. Los archivos `raw-*` conservan la salida literal del ejecutor original; `results.json` y `results.csv` contienen la clasificación actual tras aplicar el arbitraje nomenclatural ya guardado y verificar los once casos corregidos.

## Recuento adjudicado

| Estado | Casos | Porcentaje |
| --- | ---: | ---: |
| PASS | 13 | 10.7 % |
| PASS-ALTERNATIVE | 17 | 13.9 % |
| PASS-STYLE | 92 | 75.4 % |
| PARTIAL | 0 | 0.0 % |
| FAIL-NAME | 0 | 0.0 % |
| FAIL-STRUCTURE | 0 | 0.0 % |
| CRASH | 0 | 0.0 % |

| Comparación | Antes de los fixes | Ahora |
| --- | ---: | ---: |
| Moléculas | 122 | 122 |
| Fallos confirmados | 11 | 0 |
| Fallos de estructura | 5 | 0 |
| Fallos de nombre E/Z | 4 | 0 |
| Fallos de numeración de cicloalquenos | 2 | 0 |
| Cambios de nombre fuera de los seis casos previstos | — | 0 |
| Invariantes A–H y grafo estereoquímico conservados | — | 122/122 |

Los cinco errores de serialización E/Z no especificada (HC-018, HC-020, HC-021, HC-030, HC-031) pasaron las invariantes y conservaron el IDCode estereoquímico. Los nombres de estos cinco casos no cambiaron. Los nombres E/Z de HC-117 a HC-120 contienen ahora el descriptor correcto. HC-044 y HC-045 conservan respectivamente `1-` y `3-` para el metilo. Ninguno de los otros 116 nombres cambió frente al informe original.

## Corrección del comparador mecánico

El comparador anterior solo reconocía `(E)` y `(Z)` al comparar nombres. Por eso `raw-results.json` marcó HC-117 a HC-120 como FAIL-NAME aunque la aplicación producía `(2E)`, `(2Z)`, `(3E)` y `(3Z)`. La salida literal anterior se conserva para trazabilidad.

La reejecución con el comparador corregido está en `mechanical-results.json`, `mechanical-results.csv` y `mechanical-summary.md`. Sus 122 casos dan 13 PASS, 109 PARTIAL, 0 FAIL-NAME, 0 FAIL-STRUCTURE y 0 CRASH. Los 109 PARTIAL son diferencias textuales cuyo arbitraje nomenclatural queda reflejado en `results.json`; ninguno es un fallo confirmado. Solo cambiaron de clasificación mecánica HC-117, HC-118, HC-119 y HC-120: de FAIL-NAME a PARTIAL. Sus descriptores E/Z pasaron la comparación con el nombre de referencia y la configuración del SMILES. Los otros 118 estados mecánicos permanecieron iguales y las invariantes estructurales pasaron en 122/122.

## Nombres corregidos en esta fase

| ID | Antes | Ahora | Referencia congelada |
| --- | --- | --- | --- |
| HC-044 | `metilciclopent-1-eno` | `1-metilciclopent-1-eno` | `1-methylcyclopentene` |
| HC-045 | `metilciclohex-1-eno` | `3-metilciclohex-1-eno` | `3-methylcyclohexene` |

## Evidencia congelada (SHA-256)

- fixtures.json: `8d23645ee49e9d25d84d471aabd7d99c979a9bf0890619afb6647b5984899ad8`
- results.json histórico: `d8c5b5e714595aaf5009ceb87ba5dfa15e89750e993046fb7e4e1e9d4badb61e`
- nomenclature-review.json: `ba9672313de1e0ec400ec33332f6aa3f86ffb5cf910e1a486c30a2a40c70f42c`

La clasificación actual conserva PASS, PASS-ALTERNATIVE y PASS-STYLE del arbitraje para los nombres sin cambios. Los once casos corregidos quedan PASS-STYLE por equivalencia nomenclatural en español o por la explicitud aceptable de localizadores. Los invariantes se recalcularon con la versión actual del producto para todos los casos.
