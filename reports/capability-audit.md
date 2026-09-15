# Auditoría de capacidades del constructor molecular

Línea base: 2026-09-15. Esta auditoría no modifica código de producción ni el motor químico.

## Método y alcance

La batería reproducible está en tests/capability-audit.test.mjs. Para cada una de las 114 estructuras:

1. Construye un grafo de referencia desde SMILES usando el adaptador OpenChemLib.
2. Comprueba átomos, elementos, conectividad, órdenes de enlace, valencia, fórmula, grupo funcional y coordenadas 2D.
3. Construye de forma independiente con el parser local por nombre y compara la topología. La comparación normaliza las dos formas equivalentes de Kekulé de un aromático.
4. Ejecuta una ida y vuelta SMILES como comprobación adicional del adaptador.

El conteo se deriva de records.length y de la agrupación por status que imprime la prueba. Resultado actual: **114 estructuras; 87 PASS, 27 PARTIAL, 0 FAIL-NAME**. No hubo FAIL-GRAPH, FAIL-VALENCE, FAIL-FORMULA, FAIL-FUNCTIONAL-GROUP ni FAIL-RENDER.

PARTIAL significa que el modelo interno representa, analiza y renderiza correctamente la molécula, pero el parser local por nombre no la crea. Puede requerir canvas manual, plantilla o el resolvedor OPSIN cuando haya red.

## Arquitectura inspeccionada

| Área | Implementación actual |
| --- | --- |
| Grafo | app/page.tsx: Molecule contiene atoms, bonds, rings e isMirrored. Cada átomo tiene id, x, y, element? y charge?; cada enlace es [a, b, order?]. |
| Elementos/enlaces | C, O, N, S, F, Cl, Br, I; órdenes 1, 2 y 3. Anillos cycloalkane o aromatic. |
| Valencia | app/page.tsx: getAtomValenceViolation, findBondValenceViolation y findMoleculeValenceViolation. C 4, O 2, N 3 (N+ 4), S 2 y halógenos 1. |
| Canvas | app/page.tsx: añade/elimina átomos, enlaces, ramificaciones, anillos y plantillas funcionales. |
| Análisis | analyzeMolecule y detectFunctionalGroups en app/page.tsx: fórmula, grupos, cadena y nombre sugerido desde el mismo grafo. |
| Layout | app/molecule-2d-layout.ts genera las posiciones 2D compartidas. |
| Parser local | app/name-to-molecule.ts: hidrocarburos, ciclos/benceno, insaturaciones, sustituyentes, alcoholes/fenoles, aldehídos, cetonas y ácidos. |
| SMILES | app/openchemlib-adapter.ts: un solo fragmento, máximo 120 átomos/150 enlaces; rechaza fusión, puentes y espiránicos. |
| Nombre remoto | app/opsin-name-resolver.ts y /api/name-to-structure: OPSIN antes del fallback local, con un conjunto pequeño de respuestas incrustadas. |
| Tests existentes | chemistry-regressions, functional-nomenclature, advanced-name-builder y molecule-2d-layout, entre otros. |

## Resultado por familia

✓ = PASS; ~ = PARTIAL. En cada caso de la matriz, el grafo de referencia fue conectado, con valencia/fórmula/grupo/render correctos.

| Categoría | Estructuras y resultado local |
| --- | --- |
| Alcanos lineales | metano, etano, propano, butano, pentano, hexano, octano, decano — ✓ |
| Alcanos ramificados | 2-metilpropano, 2-metilbutano, 2-metilpentano, 3-metilpentano, 2,2-dimetilbutano, 2,3-dimetilbutano, 2,2,3-trimetilbutano, 3-etil-2-metilpentano, 2,2,3,3-tetrametilbutano — ✓ |
| Alquenos | eteno, propeno, but-1-eno, but-2-eno, 2-metilprop-1-eno, 3-metilpent-2-eno, hexa-1,3-dieno, hexa-1,3,5-trieno — ✓ |
| Alquinos y eninos | etino, propino, but-1-ino, but-2-ino, 3-metilpent-1-ino, hexa-1,3-diino, hex-1-en-3-ino, hept-1-en-5-ino — ✓ |
| Ciclos simples | ciclopropano, ciclobutano, ciclopentano, ciclohexano, metilciclohexano, 1,2-dimetilciclohexano, 1-etil-3-metilciclohexano, ciclopenteno, ciclohexeno, ciclohexa-1,3-dieno — ✓ |
| Dos anillos no fusionados | dos ciclohexanos unidos; dos ciclohexanos unidos por CH2 — ~ |
| Aromáticos | benceno, tolueno, etilbenceno, los tres dimetilbencenos, 1-etil-3-metilbenceno, 1-etil-2,4-dimetilbenceno — ✓ |
| Alcoholes/fenoles | metanol, etanol, propanoles, butan-2-ol, 2-metilpropan-2-ol, pentano-1,3-diol, propano-1,2,3-triol, fenol y los dioles/triol aromáticos — ✓ |
| Éteres | metoximetano, metoxietano, etoxietano, 1-metoxipropano, 2-metoxipropano — ~ |
| Aldehídos | metanal, etanal, propanal, butanal, pentanal, 2-metilpropanal y 3-metilbutanal — ✓ |
| Aldehídos de anillo | ciclopropanocarbaldehído, ciclopentanocarbaldehído, ciclohexanocarbaldehído, benzaldehído — ~ |
| Cetonas | propanona, butan-2-ona, pentan-2-ona, pentan-3-ona, 3-metilbutan-2-ona — ✓ |
| Aldehído + cetona | 3-oxobutanal — ~ |
| Ácidos | metanoico, etanoico, propanoico, 2-metilpropanoico — ✓; ácido ciclohexanocarboxílico — ~ |
| Ésteres | metanoato de metilo, etanoato de metilo, etanoato de etilo, propanoato de metilo — ~ |
| Aminas | metanamina, etanamina, propan-1-/2-amina, 2-metilpropan-2-amina, trimetilamina — ~ |
| Amidas | metanamida, etanamida, propanamida — ~ |
| Halogenados | clorometano — ~; 1-cloropropano, 2-cloropropano, 1-bromo-2-metilpropano, 1,2-dicloroetano — ✓ |
| Estrés | C20 lineal, carbonos cuaternarios múltiples, enlaces triples múltiples — ✓ |

## Hallazgos

| Estructura | Estado | Esperado / observado | Subsistema probable | Severidad |
| --- | --- | --- | --- | --- |
| 3-oxobutanal | PARTIAL | El nombre ahora es correcto; el parser local sigue sin aceptar aldehído + cetona, fuera del alcance de esta intervención. | Parser local. | P1 |
| Dos ciclohexanos por enlace directo | PARTIAL | C12H22 y el grafo están correctos; ciclohexilciclohexano no pasa el parser local. | Parser local. | P1 |
| Dos ciclohexanos mediante CH2 | PARTIAL | C13H24 y el grafo están correctos; parser falla y el nombre se degrada a grupo policíclico. | Parser local/nomenclatura. | P1/P2 |
| Los 5 éteres | PARTIAL | C-O-C, fórmulas y grupo ether correctos; no hay parser de nombres general. | Parser local; plantilla no reemplaza gramática general. | P1 |
| Los 4 carbaldehídos de anillo | PARTIAL | El carbono CHO se mantiene fuera del anillo y se detecta aldehyde; parser local falla. | Parser local. | P1 |
| Ácido ciclohexanocarboxílico | PARTIAL | Grafo, fórmula y carboxylicAcid correctos; parser local falla. | Parser local. | P1 |
| Los 4 ésteres | PARTIAL | Grafo, fórmula y ester correctos; parser local falla. | Parser local. | P1 |
| Las 6 aminas y 3 amidas | PARTIAL | Grafo, fórmula y grupo correspondiente correctos; parser local falla. | Parser local. | P1 |
| Clorometano | PARTIAL | C1H3Cl y halogen correctos; falla como caso borde de una C. | Parser local. | P1 |

No se detectó corrupción de grafo, aceptación de una valencia imposible, fórmula incorrecta, grupo funcional incorrecto ni render 2D inutilizable dentro de los 114 grafos de referencia. Esta conclusión es una línea base, no una prueba universal.

## Estrés de valencia y límites

| Caso | Resultado |
| --- | --- |
| C con cuatro simples; C doble + dos simples; C triple + simple | PASS |
| Carbono pentavalente | Rechazado correctamente |
| O con dos enlaces | PASS |
| O con tres enlaces | Rechazado correctamente |
| N neutro con tres; N+ con cuatro enlaces | PASS |
| N neutro con cuatro enlaces | Rechazado correctamente |
| Biciclo puenteado, fusionado o espiro | OUT-OF-SCOPE: rechazo explícito del adaptador |

## Resumen de capacidades

### Soportado de forma confiable

- Alcanos lineales/ramificados, insaturaciones y C20.
- Ciclos simples, anillos aromáticos sustituidos y polioles/fenoles.
- Aldehídos acíclicos, cetonas y ácidos acíclicos.
- Halogenados de dos o más carbonos del examen.

### Soportado con limitaciones

- Éteres, ésteres, aminas, amidas, carbaldehídos de anillo, ácido ciclohexanocarboxílico y dos anillos no fusionados: el grafo es válido, pero no hay cobertura garantizada en el parser local offline.
- Puede haber construcción manual o resolución OPSIN con red; no se usó la red como evidencia.

### No soportado

- Sistemas fusionados, puenteados y espiro.
- Fragmentos desconectados, más de 120 átomos, más de 150 enlaces, elementos/cargas/órdenes fuera de las restricciones del adaptador.

## Reproducir

Ejecutar: node --test tests/capability-audit.test.mjs

Última ejecución: 2 pruebas aprobadas de 2. No se efectuaron cambios de producción.
