# Auditoría automatizada de Hydrocarbon Lab

- Casos: 122
- PASS: 13 (10.7%)
- PARTIAL: 100 (82.0%)
- FAIL-NAME: 4 (3.3%)
- FAIL-STRUCTURE: 5 (4.1%)
- CRASH: 0 (0.0%)
- Casos con nombre común documentado en sinónimos PubChem: 27
- Fuente: PubChem PUG REST, consulta por SMILES; CID, URL, fórmula, nombre IUPAC, canonical/isomeric SMILES y sinónimos quedan en fixtures.json.
- La diferencia de nombre no produce fallo sin una discrepancia química observada. Los nombres que PubChem publica como sinónimos quedan documentados en results.json; los restantes PARTIAL requieren revisión nomenclatural humana.

## Fallos por causa probable

- selección del parent: 0
- numeración: 0
- prioridad funcional: 0
- orden alfabético: 0
- multiplicadores: 0
- aldehídos: 0
- cetonas: 0
- aminas: 0
- amidas: 0
- éteres: 0
- ésteres: 0
- aromáticos: 0
- E/Z: 4
- anillos: 0
- anillos fusionados: 0
- parser SMILES: 0
- serializer SMILES: 5
- cálculo de fórmula: 0
- otro: 0

## Distribución por familia

- alcanos lineales: 6
- alcanos ramificados: 8
- alquenos: 7
- alquinos: 6
- dienos/polienos: 6
- cicloalcanos: 7
- cicloalquenos: 5
- benceno y derivados: 10
- alcoholes: 8
- aldehídos: 8
- cetonas: 7
- varios grupos funcionales: 1
- ácidos carboxílicos: 7
- éteres: 6
- ésteres: 6
- aminas: 7
- amidas: 6
- otros compatibles: 5
- estereoquímica E/Z: 4
- anillos fusionados: 2

## Casos mínimos reproducibles

- HC-018 — FAIL-STRUCTURE (serializer SMILES): PubChem SMILES `CC=CC` → Hydrocarbon Lab `C/C=C/C`; nombre PubChem `but-2-ene` → nombre Hydrocarbon Lab `but-2-eno`.
- HC-020 — FAIL-STRUCTURE (serializer SMILES): PubChem SMILES `CCC(=CC)C` → Hydrocarbon Lab `CC/C(\C)=C/C`; nombre PubChem `3-methylpent-2-ene` → nombre Hydrocarbon Lab `3-metilpent-2-eno`.
- HC-021 — FAIL-STRUCTURE (serializer SMILES): PubChem SMILES `CCC=CC=C` → Hydrocarbon Lab `CC/C=C/C=C`; nombre PubChem `hexa-1,3-diene` → nombre Hydrocarbon Lab `hexa-1,3-dieno`.
- HC-030 — FAIL-STRUCTURE (serializer SMILES): PubChem SMILES `CCCC=CC=C` → Hydrocarbon Lab `CCC/C=C/C=C`; nombre PubChem `hepta-1,3-diene` → nombre Hydrocarbon Lab `hepta-1,3-dieno`.
- HC-031 — FAIL-STRUCTURE (serializer SMILES): PubChem SMILES `CCC=CC=CC=C` → Hydrocarbon Lab `CC/C=C/C=C/C=C`; nombre PubChem `octa-1,3,5-triene` → nombre Hydrocarbon Lab `octa-1,3,5-trieno`.
- HC-117 — FAIL-NAME (E/Z): PubChem SMILES `C/C=C/C` → Hydrocarbon Lab `C/C=C/C`; nombre PubChem `(E)-but-2-ene` → nombre Hydrocarbon Lab `but-2-eno`.
- HC-118 — FAIL-NAME (E/Z): PubChem SMILES `C/C=C\C` → Hydrocarbon Lab `C/C=C\C`; nombre PubChem `(Z)-but-2-ene` → nombre Hydrocarbon Lab `but-2-eno`.
- HC-119 — FAIL-NAME (E/Z): PubChem SMILES `CC/C=C/CC` → Hydrocarbon Lab `CC/C=C/CC`; nombre PubChem `(E)-hex-3-ene` → nombre Hydrocarbon Lab `hex-3-eno`.
- HC-120 — FAIL-NAME (E/Z): PubChem SMILES `CC/C=C\CC` → Hydrocarbon Lab `CC/C=C\CC`; nombre PubChem `(Z)-hex-3-ene` → nombre Hydrocarbon Lab `hex-3-eno`.

## Lectura nomenclatural

Los cuatro FAIL-NAME corresponden a los cuatro registros estereoespecíficos: Hydrocarbon Lab conserva el grafo y el isómero E/Z en el SMILES exportado, pero omite el descriptor configuracional de su nombre. Los PARTIAL no se declaran errores; quedan pendientes para verificar equivalencia IUPAC o preferencia nomenclatural.
