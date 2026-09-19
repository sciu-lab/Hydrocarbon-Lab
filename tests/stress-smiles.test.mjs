import assert from "node:assert/strict";
import test from "node:test";

import {
  moleculeFromSmiles,
  moleculeToSmiles,
} from "../app/openchemlib-adapter.ts";


function checkGraph(molecule) {
  // Todos los átomos deben tener IDs únicos.
  const ids = new Set(
    molecule.atoms.map((atom) => atom.id)
  );

  assert.equal(
    ids.size,
    molecule.atoms.length,
    "Hay IDs de átomos duplicados"
  );


  // Todos los enlaces deben apuntar a átomos existentes.
  for (const [a, b, order = 1] of molecule.bonds) {

    assert.ok(
      ids.has(a),
      `El enlace referencia un átomo inexistente: ${a}`
    );

    assert.ok(
      ids.has(b),
      `El enlace referencia un átomo inexistente: ${b}`
    );

    assert.notEqual(
      a,
      b,
      "Un átomo está enlazado consigo mismo"
    );

    assert.ok(
      order === 1 || order === 2 || order === 3,
      `Orden de enlace inválido: ${order}`
    );
  }


  // No debe haber enlaces duplicados.
  const edges = new Set();

  for (const [a, b] of molecule.bonds) {

    const key =
      a < b
        ? `${a}-${b}`
        : `${b}-${a}`;

    assert.ok(
      !edges.has(key),
      `Enlace duplicado: ${key}`
    );

    edges.add(key);
  }


  // Comprobar valencia máxima del carbono.
  for (const atom of molecule.atoms) {

    if ((atom.element ?? "C") !== "C") {
      continue;
    }

    const valence = molecule.bonds.reduce(
      (sum, [a, b, order = 1]) => {

        if (a === atom.id || b === atom.id) {
          return sum + order;
        }

        return sum;

      },
      0
    );

    assert.ok(
      valence <= 4,
      `Carbono ${atom.id} tiene valencia ${valence}`
    );
  }
}


const molecules = [
  "C",
  "CC",
  "CCC",
  "CCCC",
  "CCCCC",
  "CCCCCC",

  "CC(C)C",
  "CC(C)CC",
  "CCC(C)CC",
  "CC(C)C(C)C",
  "CC(C)(C)CC",

  "C=C",
  "CC=C",
  "CCC=C",
  "CC=CC",
  "C=CC=CC",

  "C#C",
  "CC#C",
  "CCC#C",
  "CC#CC",

  "C1CC1",
  "C1CCC1",
  "C1CCCC1",
  "C1CCCCC1",

  "CC1CCCCC1",
  "CCC1CCCCC1",

  "c1ccccc1",
  "Cc1ccccc1",
  "CCc1ccccc1",

  "CO",
  "CCO",
  "CCCO",

  "CC=O",
  "CCC=O",

  "CC(=O)C",

  "CC(=O)O",

  "CN",
  "CCN",

  "CC(=O)N",
];


test("stress: SMILES import/export repeated round trip", () => {

  const repetitions = 100;

  let operations = 0;

  for (const originalSmiles of molecules) {

    let currentSmiles = originalSmiles;

    for (let i = 0; i < repetitions; i++) {

      const imported =
        moleculeFromSmiles(currentSmiles);

      assert.equal(
        imported.ok,
        true,
        imported.ok
          ? undefined
          : `IMPORT FAIL ${currentSmiles}: ${imported.error}`
      );

      checkGraph(imported.molecule);


      const atomCount =
        imported.molecule.atoms.length;

      const bondCount =
        imported.molecule.bonds.length;


      const exported =
        moleculeToSmiles(imported.molecule);

      assert.equal(
        exported.ok,
        true,
        exported.ok
          ? undefined
          : `EXPORT FAIL ${currentSmiles}: ${exported.error}`
      );


      const reconstructed =
        moleculeFromSmiles(exported.smiles);

      assert.equal(
        reconstructed.ok,
        true,
        reconstructed.ok
          ? undefined
          : `REIMPORT FAIL ${exported.smiles}: ${reconstructed.error}`
      );


      checkGraph(reconstructed.molecule);


      assert.equal(
        reconstructed.molecule.atoms.length,
        atomCount,
        `Cambió el número de átomos:
${currentSmiles}
→ ${exported.smiles}`
      );


      assert.equal(
        reconstructed.molecule.bonds.length,
        bondCount,
        `Cambió el número de enlaces:
${currentSmiles}
→ ${exported.smiles}`
      );


      currentSmiles =
        exported.smiles;

      operations++;
    }
  }


  console.log(
    `\nStress test completado: ${operations} ciclos import/export.\n`
  );

});