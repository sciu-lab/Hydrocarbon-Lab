import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import {
  getOpsinNameCandidates,
  translateSpanishIupacToOpsin,
} from "../app/iupac-name-normalization.ts";
import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function makeAlkylBenzene(substituents = []) {
  const atoms = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    x: Math.cos((index * Math.PI) / 3),
    y: Math.sin((index * Math.PI) / 3),
  }));
  const bonds = atoms.map((atom, index) => [
    atom.id,
    atoms[(index + 1) % atoms.length].id,
    index % 2 === 0 ? 2 : 1,
  ]);
  let nextAtomId = 7;

  for (const { ringAtomId, length } of substituents) {
    let previousAtomId = ringAtomId;
    for (let carbon = 0; carbon < length; carbon += 1) {
      const atomId = nextAtomId;
      nextAtomId += 1;
      atoms.push({ id: atomId, x: ringAtomId + carbon + 2, y: ringAtomId });
      bonds.push([previousAtomId, atomId, 1]);
      previousAtomId = atomId;
    }
  }

  return {
    atoms,
    bonds,
    rings: [{ id: 1, kind: "aromatic", atomIds: [1, 2, 3, 4, 5, 6] }],
  };
}

const cases = [
  ["benzene", [], "benceno", "benzene"],
  ["methylbenzene", [{ ringAtomId: 1, length: 1 }], "metilbenceno", "methylbenzene"],
  ["ethylbenzene", [{ ringAtomId: 1, length: 2 }], "etilbenceno", "ethylbenzene"],
  ["1-ethyl-2-methylbenzene", [{ ringAtomId: 1, length: 2 }, { ringAtomId: 2, length: 1 }], "1-etil-2-metilbenceno", "1-ethyl-2-methylbenzene"],
  ["1-ethyl-3-methylbenzene", [{ ringAtomId: 1, length: 2 }, { ringAtomId: 3, length: 1 }], "1-etil-3-metilbenceno", "1-ethyl-3-methylbenzene"],
  ["1-ethyl-4-methylbenzene", [{ ringAtomId: 1, length: 2 }, { ringAtomId: 4, length: 1 }], "1-etil-4-metilbenceno", "1-ethyl-4-methylbenzene"],
  ["1,2-dimethylbenzene", [{ ringAtomId: 1, length: 1 }, { ringAtomId: 2, length: 1 }], "1,2-dimetilbenceno", "1,2-dimethylbenzene"],
  ["1,3-dimethylbenzene", [{ ringAtomId: 1, length: 1 }, { ringAtomId: 3, length: 1 }], "1,3-dimetilbenceno", "1,3-dimethylbenzene"],
  ["1,4-dimethylbenzene", [{ ringAtomId: 1, length: 1 }, { ringAtomId: 4, length: 1 }], "1,4-dimetilbenceno", "1,4-dimethylbenzene"],
];

for (const [label, substituents, expectedSpanish, expectedEnglish] of cases) {
  test(`preserves aromatic parent and substituent locants for ${label}`, () => {
    const analysis = analyzeMolecule(makeAlkylBenzene(substituents));
    assert.equal(analysis.name, expectedSpanish);
    assert.equal(translateSpanishIupacToOpsin(analysis.name), expectedEnglish);
  });
}

test("linear alkyl cyclohexanes stay Spanish locally and become fully English for display and OPSIN", () => {
  const names = [
    ["metilciclohexano", "methylcyclohexane", 1],
    ["etilciclohexano", "ethylcyclohexane", 2],
    ["pentilciclohexano", "pentylcyclohexane", 5],
    ["hexilciclohexano", "hexylcyclohexane", 6],
    ["heptilciclohexano", "heptylcyclohexane", 7],
    ["octilciclohexano", "octylcyclohexane", 8],
  ];

  for (const [spanish, english, chainLength] of names) {
    const built = buildHydrocarbonFromIupacName(spanish);
    assert.equal(built.ok, true, spanish);
    assert.equal(built.molecule.atoms.length, 6 + chainLength, spanish);
    assert.equal(built.molecule.rings?.[0].atomIds.length, 6, spanish);
    assert.equal(translateSpanishIupacToOpsin(spanish), english, spanish);
    assert.equal(getOpsinNameCandidates(english)[0], english, english);
  }

  const hexyl = buildHydrocarbonFromIupacName("hexilciclohexano");
  assert.equal(hexyl.ok, true);
  const analysis = analyzeMolecule(hexyl.molecule);
  assert.equal(analysis.name, "hexilciclohexano");
  assert.equal(translateSpanishIupacToOpsin(analysis.name), "hexylcyclohexane");
  assert.notEqual(translateSpanishIupacToOpsin(analysis.name), "hexilcyclohexane");
});
