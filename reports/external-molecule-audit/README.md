# Auditoría externa de moléculas

La batería contiene 122 fixtures con SMILES de referencia, fórmula, nombre IUPAC publicado, nombre común documentado cuando se encontró, sinónimos PubChem, CID y enlace a la ficha de PubChem.

## Repetir la misma batería

Desde la raíz de Hydrocarbon Lab:

```powershell
node scripts/external-molecule-audit.mjs
```

El corredor carga las referencias guardadas en `fixtures.json`, ejecuta importación → análisis → exportación → reimportación y actualiza los resultados. No consulta la red al repetir la batería.

Usa `--refresh` para volver a resolver todos los SMILES en PubChem, `--extend` para añadir moléculas nuevas del selector, o `--fetch-synonyms` para actualizar los sinónimos y los nombres comunes.

## Archivos

- `fixtures.json`: corpus congelado y referencias independientes.
- `results.csv`: tabla lista para filtrar o importar en una hoja de cálculo.
- `results.json`: invariantes, nombres y observaciones por caso.
- `summary.md`: recuentos, causas y repros mínimos.

## Criterio de identidad

La conectividad e isomería se comparan mediante el IDCode canónico de OpenChemLib para las estructuras parseadas, no mediante igualdad textual de SMILES. La fórmula ASCII normaliza la omisión del subíndice 1. Se cotejan fórmula, átomos pesados, carbonos, enlaces, anillos, cargas, estereoquímica y grafo canónico.
