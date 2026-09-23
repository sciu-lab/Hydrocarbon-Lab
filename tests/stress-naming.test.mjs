import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import {
  moleculeFromSmiles,
} from "../app/openchemlib-adapter.ts";


const projectRoot =
  fileURLToPath(new URL("..", import.meta.url));

let server;
let analyzeMolecule;


// Cargamos el motor real de Hydrocarbon-Lab.
before(async () => {

  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",

    plugins: [
      react(),
    ],

    server: {
      middlewareMode: true,
      hmr: false,
    },
  });


  ({
    analyzeMolecule,
  } = await server.ssrLoadModule(
    "/app/page.tsx"
  ));

});


after(async () => {
  await server?.close();
});


// ============================================================
// BANCO DE MOLÉCULAS
// ============================================================

const cases = [

  // ----------------------------------------------------------
  // Alcanos
  // ----------------------------------------------------------

  ["C", "metano"],
  ["CC", "etano"],
  ["CCC", "propano"],
  ["CCCC", "butano"],
  ["CCCCC", "pentano"],
  ["CCCCCC", "hexano"],

  ["CC(C)C", "2-metilpropano"],
  ["CC(C)CC", "2-metilbutano"],
  ["CC(C)CCC", "2-metilpentano"],
  ["CCC(C)CC", "3-metilpentano"],
  ["CC(C)(C)CC", "2,2-dimetilbutano"],
  ["CC(C)C(C)C", "2,3-dimetilbutano"],


  // ----------------------------------------------------------
  // Alquenos
  // ----------------------------------------------------------

  ["C=C", "eteno"],
  // The raw Spanish graph analysis currently retains explicit position 1.
  // Propeno is also valid, but this stress test checks that output, not PIN selection.
  ["C=CC", "prop-1-eno"],
  ["C=CCC", "but-1-eno"],
  ["CC=CC", "but-2-eno"],
  ["C=C(C)C", "2-metilprop-1-eno"],
  ["C=CC=CCC", "hexa-1,3-dieno"],


  // ----------------------------------------------------------
  // Alquinos
  // ----------------------------------------------------------

  ["C#C", "etino"],
  // Propino is also valid; raw analysis uses the explicit position 1.
  ["C#CC", "prop-1-ino"],
  ["C#CCC", "but-1-ino"],
  ["CC#CC", "but-2-ino"],


  // ----------------------------------------------------------
  // Ciclos
  // ----------------------------------------------------------

  ["C1CC1", "ciclopropano"],
  ["C1CCC1", "ciclobutano"],
  ["C1CCCC1", "ciclopentano"],
  ["C1CCCCC1", "ciclohexano"],
  ["C1CCCCCCC1", "ciclooctano"],

  ["CC1CCCCC1", "metilciclohexano"],


  // ----------------------------------------------------------
  // Aromáticos
  // ----------------------------------------------------------

  ["c1ccccc1", "benceno"],
  // Tolueno is presented separately as a common name for this connectivity.
  ["Cc1ccccc1", "metilbenceno"],
  ["CCc1ccccc1", "etilbenceno"],

  ["Cc1cccc(C)c1", "1,3-dimetilbenceno"],

  [
    "CCc1cccc(C)c1",
    "1-etil-3-metilbenceno"
  ],

  [
    "Cc1c(C)cc(C)cc1",
    "1,2,4-trimetilbenceno"
  ],


  // ----------------------------------------------------------
  // Alcoholes
  // ----------------------------------------------------------

  ["CO", "metanol"],
  // Etanol is also valid; the local graph analyzer emits the explicit OH locant.
  ["CCO", "etan-1-ol"],
  ["CCCO", "propan-1-ol"],
  ["CC(O)C", "propan-2-ol"],
  ["CCC(O)C", "butan-2-ol"],


  // ----------------------------------------------------------
  // Aldehídos
  // ----------------------------------------------------------

  ["C=O", "metanal"],
  ["CC=O", "etanal"],
  ["CCC=O", "propanal"],

  // Casos que antes daban problemas
  ["CCCC=O", "butanal"],

  [
    "CC(C)CC=O",
    "3-metilbutanal"
  ],


  // ----------------------------------------------------------
  // Cetonas
  // ----------------------------------------------------------

  ["CC(=O)C", "propan-2-ona"],
  ["CCC(=O)C", "butan-2-ona"],
  ["CCCC(=O)C", "pentan-2-ona"],
  ["CCC(=O)CC", "pentan-3-ona"],


  // ----------------------------------------------------------
  // Carbonilos mixtos
  // ----------------------------------------------------------

  [
    "O=CCC(C)=O",
    "3-oxobutanal"
  ],


  // ----------------------------------------------------------
  // Ácidos carboxílicos
  // ----------------------------------------------------------

  ["O=CO", "ácido metanoico"],
  ["CC(=O)O", "ácido etanoico"],
  ["CCC(=O)O", "ácido propanoico"],
  ["CCCC(=O)O", "ácido butanoico"],


  // ----------------------------------------------------------
  // Éteres
  // ----------------------------------------------------------

  ["COC", "metoximetano"],
  ["COCC", "metoxietano"],
  ["CCOCC", "etoxietano"],


  // ----------------------------------------------------------
  // Aminas
  // ----------------------------------------------------------

  ["CN", "metanamina"],
  ["CCN", "etanamina"],
  ["CCCN", "propan-1-amina"],


  // ----------------------------------------------------------
  // Amidas
  // ----------------------------------------------------------

  ["C(=O)N", "metanamida"],
  ["CC(=O)N", "etanamida"],
  ["CCC(=O)N", "propanamida"],


  // ----------------------------------------------------------
  // Halogenados
  // ----------------------------------------------------------

  ["CCl", "clorometano"],
  ["CF", "fluorometano"],
  ["CBr", "bromometano"],


  // ----------------------------------------------------------
  // Stress estructural
  // ----------------------------------------------------------

  [
    "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    "triacontano"
  ],

  [
    "C=CC=CC=CC=CC=C",
    "deca-1,3,5,7,9-pentaeno"
  ],

];


// ============================================================
// STRESS TEST
// ============================================================

test(
  "stress: nomenclatura IUPAC repetida",
  async () => {

    const repetitions = 50;

    let operations = 0;

    const failures = [];

    const start =
      performance.now();


    for (
      const [smiles, expectedName]
      of cases
    ) {

      let firstObservedName = null;


      for (
        let iteration = 0;
        iteration < repetitions;
        iteration++
      ) {

        const imported =
          moleculeFromSmiles(smiles);


        if (!imported.ok) {

          failures.push({
            smiles,
            expected: expectedName,
            observed:
              `IMPORT ERROR: ${imported.error}`,
          });

          break;
        }


        let analysis;

        try {

          analysis =
            analyzeMolecule(
              imported.molecule
            );

        } catch (error) {

          failures.push({
            smiles,
            expected: expectedName,
            observed:
              `CRASH: ${error.message}`,
          });

          break;
        }


        const observedName =
          analysis.name;


        // Primera ejecución:
        // guardamos el resultado.
        if (firstObservedName === null) {

          firstObservedName =
            observedName;

        } else {

          // El resultado no debería cambiar
          // entre ejecuciones idénticas.

          if (
            observedName !==
            firstObservedName
          ) {

            failures.push({
              smiles,
              expected: expectedName,

              observed:
                `NON-DETERMINISTIC: ` +
                `${firstObservedName} → ` +
                `${observedName}`,
            });

            break;
          }

        }


        operations++;

      }


      // Comprobamos el nombre esperado
      // una sola vez por molécula.

      if (
        firstObservedName !== null &&
        firstObservedName !== expectedName
      ) {

        failures.push({
          smiles,
          expected: expectedName,
          observed: firstObservedName,
        });

      }

    }


    const elapsed =
      performance.now() - start;


    // ========================================================
    // INFORME
    // ========================================================

    console.log(
      "\n========================================"
    );

    console.log(
      "HYDROCARBON LAB - NAMING STRESS TEST"
    );

    console.log(
      "========================================"
    );

    console.log(
      `Moléculas: ${cases.length}`
    );

    console.log(
      `Repeticiones por molécula: ${repetitions}`
    );

    console.log(
      `Análisis realizados: ${operations}`
    );

    console.log(
      `Tiempo: ${elapsed.toFixed(2)} ms`
    );


    if (failures.length === 0) {

      console.log(
        "\nRESULTADO: PASS"
      );

      console.log(
        "No se encontraron errores de nomenclatura."
      );

    } else {

      console.log(
        `\nRESULTADO: ${failures.length} FALLOS`
      );


      console.log(
        "\n----------------------------------------"
      );

      console.log(
        "CASOS PROBLEMÁTICOS"
      );

      console.log(
        "----------------------------------------"
      );


      for (const failure of failures) {

        console.log(
          `\nSMILES:   ${failure.smiles}`
        );

        console.log(
          `Esperado: ${failure.expected}`
        );

        console.log(
          `Obtenido: ${failure.observed}`
        );

      }

    }


    console.log(
      "\n========================================\n"
    );


    assert.equal(
      failures.length,
      0,

      `${failures.length} moléculas ` +
      "fallaron el stress test de nomenclatura"
    );

  }
);
