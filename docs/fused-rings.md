# Anillos fusionados: MVP

El clic o la activación con teclado sobre un enlace vuelve a editar su orden.
Mayús-clic o Mayús-Enter sobre un enlace de anillo conserva el mecanismo
explícito **Fusionar anillo**. Además, ciclopentano y ciclohexano se pueden
arrastrar desde el selector: el enlace candidato se valida y resalta, se muestra
una previsualización y la fusión solo se confirma al soltar sobre él. Soltar fuera
de un enlace no modifica el grafo.

Ciclopentano y ciclohexano reutilizan sus dos extremos y el enlace; añaden 3 o 4
carbonos y un único registro `RingInfo`.

`fuseRingOnBond` en `app/fused-ring.ts` es una operación inmutable sobre el mismo
grafo del editor. La UI pasa el resultado por `commit`, que conserva la validación
de valencia y una única entrada undo/redo. No cambia el formato de guardado.

El layout prueba dos polígonos regulares en las escalas del canvas. Prioriza evitar
cruces y colisiones cercanas; después prefiere el centro más alejado del anillo
original y mayor separación respecto de los átomos existentes. El orden de los
extremos se normaliza para que el resultado sea determinista. No mueve los átomos
anteriores y no garantiza ausencia de solapamientos si ambos lados están ocupados.

Se permite abrir un anillo alifático fusionado borrando un vértice si el grafo
permanece conectado. Se eliminan sus enlaces incidentes y los registros de anillos
que dejan de estar cerrados, sin reconectar artificialmente los vecinos.

## Límites deliberados

- Solo enlaces simples entre carbonos neutros de un anillo alifático; sus extremos
  no pueden pertenecer ya a otro anillo. Se admiten fusiones sucesivas sobre otros
  enlaces periféricos. La valencia de cada extremo debe permitir un enlace más.
- Benceno permanece deshabilitado: la representación actual usa órdenes de enlace
  Kekulé explícitos y no dispone de asignación conjunta para sistemas aromáticos
  fusionados. No se crean dobles enlaces heurísticos ni se afirma soporte de naftaleno.
- La nomenclatura policíclica queda fuera de alcance. El editor muestra su aviso
  existente de nombre no disponible, conservando fórmula y grafo.
- El importador SMILES admite sistemas alifáticos fusionados de anillos de 5/6
  carbonos que comparten únicamente lados. Sigue rechazando aromáticos fusionados,
  heterociclos fusionados, espiro y puenteados. Los centros de unión se exportan con
  configuración estereoquímica no especificada; el dibujo no determina cis/trans.

Las pruebas en `tests/fused-ring.test.mjs` cubren conteos, identidad de los extremos,
geometría, fusión sucesiva, valencia, borrado, acciones reales de commit/undo/redo y
round trips del documento químico y SMILES. La suite de química comprueba el aviso
de nomenclatura y el análisis después del borrado.
