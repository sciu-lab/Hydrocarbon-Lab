# Auditoría automatizada de Hydrocarbon Lab

- Casos: 122
- PASS: 13 (10.7%)
- PARTIAL: 109 (89.3%)
- FAIL-NAME: 0 (0.0%)
- FAIL-STRUCTURE: 0 (0.0%)
- CRASH: 0 (0.0%)
- Casos con nombre común documentado en sinónimos PubChem: 27
- Referencias congeladas: PubChem PUG REST; CID, URL, fórmula, nombre IUPAC y SMILES constan en el fixture histórico.
- La diferencia textual de nombre no produce fallo sin discrepancia química; los PARTIAL conservan su arbitraje nomenclatural separado.

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
- E/Z: 0
- anillos: 0
- anillos fusionados: 0
- parser SMILES: 0
- serializer SMILES: 0
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

- Sin fallos.

## Lectura nomenclatural

El comparador E/Z contrasta los descriptores del nombre con la configuración definida por el SMILES de referencia. Los PARTIAL son diferencias textuales que requieren el arbitraje nomenclatural guardado; no se declaran errores por sí solos.
