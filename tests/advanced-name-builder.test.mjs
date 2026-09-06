import assert from "node:assert/strict";
import test from "node:test";

import {
  getOpsinNameCandidates,
  translateSpanishIupacToOpsin,
} from "../app/iupac-name-normalization.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { resolveNameWithOpsin } from "../app/opsin-name-resolver.ts";

test("translates Spanish functional-group names into OPSIN candidates", () => {
  assert.equal(
    translateSpanishIupacToOpsin("ácido 2-metilpropanoico"),
    "2-methylpropanoic acid",
  );
  assert.equal(
    translateSpanishIupacToOpsin("etanoato de metilo"),
    "methyl ethanoate",
  );
  assert.equal(
    translateSpanishIupacToOpsin("benceno-1,3,5-triol"),
    "benzene-1,3,5-triol",
  );
  assert.equal(translateSpanishIupacToOpsin("butan-2-ona"), "butan-2-one");
  assert.equal(translateSpanishIupacToOpsin("3-hexeno"), "hex-3-ene");
  assert.equal(translateSpanishIupacToOpsin("3-hex-eno"), "hex-3-ene");
  assert.equal(translateSpanishIupacToOpsin("4-cloro-2-penteno"), "4-chloropent-2-ene");
  assert.equal(translateSpanishIupacToOpsin("2-(clorometil)butano"), "2-(chloromethyl)butane");
  assert.equal(translateSpanishIupacToOpsin("Benceno"), "benzene");
  assert.equal(translateSpanishIupacToOpsin("Etilbenceno"), "ethylbenzene");
  assert.equal(translateSpanishIupacToOpsin("p-Xileno"), "p-xylene");
  assert.equal(
    translateSpanishIupacToOpsin("4-isopropiloctano"),
    "4-(propan-2-yl)octane",
  );
  assert.equal(
    translateSpanishIupacToOpsin("(2E)-2-etil-3-metilhex-2-enal"),
    "(2E)-2-ethyl-3-methylhex-2-enal",
  );
  assert.equal(
    translateSpanishIupacToOpsin("3-(2-oxopropil)ciclohexanona"),
    "3-(2-oxopropyl)cyclohexanone",
  );
  assert.equal(
    translateSpanishIupacToOpsin("N-ciclohexil-N-metilpropan-2-amina"),
    "N-cyclohexyl-N-methylpropan-2-amine",
  );
  assert.equal(
    translateSpanishIupacToOpsin("N-(2-ciclohexiletil)-4-metil-3-oxohexanamida"),
    "N-(2-cyclohexylethyl)-4-methyl-3-oxohexanamide",
  );
  assert.equal(
    translateSpanishIupacToOpsin("tetrahidropirano"),
    "tetrahydropyran",
  );
});

test("keeps both translated and original OPSIN candidates", () => {
  assert.deepEqual(getOpsinNameCandidates("Etanamida"), ["ethanamide", "etanamida"]);
  assert.deepEqual(getOpsinNameCandidates("propan-2-ol"), ["propan-2-ol"]);
});

test("OpenChemLib turns functional-group SMILES into editable canvas atoms", () => {
  const acid = moleculeFromSmiles("CC(C)C(=O)O");
  assert.equal(acid.ok, true, acid.ok ? undefined : acid.error);
  assert.equal(acid.molecule.atoms.filter((atom) => atom.element === "O").length, 2);
  assert.ok(acid.molecule.bonds.some((bond) => bond[2] === 2));

  const amide = moleculeFromSmiles("CC(=O)N");
  assert.equal(amide.ok, true, amide.ok ? undefined : amide.error);
  assert.equal(amide.molecule.atoms.filter((atom) => atom.element === "N").length, 1);
});

test("OpenChemLib preserves an aromatic carbon ring for the simulator", () => {
  const triol = moleculeFromSmiles("Oc1cc(O)cc(O)c1");
  assert.equal(triol.ok, true, triol.ok ? undefined : triol.error);
  assert.equal(triol.molecule.rings?.[0].kind, "aromatic");
  assert.equal(triol.molecule.rings?.[0].atomIds.length, 6);
  assert.equal(triol.molecule.atoms.filter((atom) => atom.element === "O").length, 3);
});

test("the reported complex names become editable OpenChemLib molecules", () => {
  const enal = moleculeFromSmiles("C(C)/C(/C=O)=C(\\CCC)/C");
  assert.equal(enal.ok, true, enal.ok ? undefined : enal.error);
  assert.equal(enal.molecule.atoms.length, 10);
  assert.equal(enal.molecule.atoms.filter((atom) => atom.element === "O").length, 1);

  const cyclicDiketone = moleculeFromSmiles("O=C(CC1CC(CCC1)=O)C");
  assert.equal(cyclicDiketone.ok, true, cyclicDiketone.ok ? undefined : cyclicDiketone.error);
  assert.equal(cyclicDiketone.molecule.rings?.[0].atomIds.length, 6);
  assert.equal(cyclicDiketone.molecule.atoms.filter((atom) => atom.element === "O").length, 2);

  const tertiaryAmine = moleculeFromSmiles("C1(CCCCC1)N(C(C)C)C");
  assert.equal(tertiaryAmine.ok, true, tertiaryAmine.ok ? undefined : tertiaryAmine.error);
  assert.equal(tertiaryAmine.molecule.atoms.filter((atom) => atom.element === "N").length, 1);
  assert.equal(tertiaryAmine.molecule.rings?.[0].atomIds.length, 6);

  const nestedAmide = moleculeFromSmiles("C1(CCCCC1)CCNC(CC(C(CC)C)=O)=O");
  assert.equal(nestedAmide.ok, true, nestedAmide.ok ? undefined : nestedAmide.error);
  assert.equal(nestedAmide.molecule.atoms.filter((atom) => atom.element === "N").length, 1);
  assert.equal(nestedAmide.molecule.atoms.filter((atom) => atom.element === "O").length, 2);
});

test("heterocycles receive the friendly canvas limitation message", () => {
  const heterocycle = moleculeFromSmiles("O1CCCCC1");
  assert.equal(heterocycle.ok, false);
  assert.equal(
    heterocycle.error,
    "El motor no puede interpretar heterociclos o aminas complejas en este momento.",
  );
});

test("the browser resolver uses OPSIN directly and preserves stereodescriptors", async () => {
  const requestedUrls = [];
  const result = await resolveNameWithOpsin("(2E)-2-etil-3-metilhex-2-enal", {
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      return Response.json({
        status: "SUCCESS",
        smiles: "C(C)/C(/C=O)=C(\\CCC)/C",
        warnings: [],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.match(requestedUrls[0], /\(2E\)-2-ethyl-3-methylhex-2-enal\.json$/);
});

test("known classroom names still resolve when the network is unavailable", async () => {
  const result = await resolveNameWithOpsin("3-(2-oxopropil)ciclohexanona", {
    fetchImpl: async () => {
      throw new TypeError("Failed to fetch");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.source, "integrated-fallback");
  assert.equal(result.value.smiles, "O=C(CC1CC(CCC1)=O)C");
});

test("complex N-substituted names retain an integrated fallback", async () => {
  const names = [
    ["N-ciclohexil-N-metilpropan-2-amina", "C1(CCCCC1)N(C(C)C)C"],
    ["N-(2-ciclohexiletil)-4-metil-3-oxohexanamida", "C1(CCCCC1)CCNC(CC(C(CC)C)=O)=O"],
  ];

  for (const [name, smiles] of names) {
    const result = await resolveNameWithOpsin(name, {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.source, "integrated-fallback");
    assert.equal(result.value.smiles, smiles);
  }
});

test("simple N-substituted ethanamines translate to valid OPSIN English names", () => {
  assert.equal(
    translateSpanishIupacToOpsin("N-metiletanamina"),
    "N-methylethanamine",
  );
  assert.equal(
    translateSpanishIupacToOpsin("N,N-dimetiletanamina"),
    "N,N-dimethylethanamine",
  );
});

test("N-methylethanamine and N,N-dimethylethanamine retain offline fallbacks", async () => {
  const names = [
    ["N-metiletanamina", "CCNC"],
    ["N,N-dimetiletanamina", "CCN(C)C"],
  ];

  for (const [name, smiles] of names) {
    const result = await resolveNameWithOpsin(name, {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.source, "integrated-fallback");
    assert.equal(result.value.smiles, smiles);
  }
});

test("the reported fluorinated diketone keeps an integrated fallback", async () => {
  const result = await resolveNameWithOpsin(
    "3-fluoro-3-(2-oxopropyl)cyclohexan-1-one",
    {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.source, "integrated-fallback");
  assert.equal(result.value.smiles, "O=C1CC(F)(CC(=O)C)CCC1");
});

test("nitrogen-family Spanish names translate to OPSIN English", () => {
  assert.equal(translateSpanishIupacToOpsin("2-nitropropano"), "2-nitropropane");
  assert.equal(translateSpanishIupacToOpsin("2-nitrobutano"), "2-nitrobutane");
  assert.equal(translateSpanishIupacToOpsin("butanonitrilo"), "butanenitrile");
  assert.equal(translateSpanishIupacToOpsin("pentanodinitrilo"), "pentanedinitrile");
  assert.equal(translateSpanishIupacToOpsin("4-nitroanilina"), "4-nitroaniline");
  assert.equal(translateSpanishIupacToOpsin("N-metilanilina"), "N-methylaniline");
  assert.equal(translateSpanishIupacToOpsin("ciclohexanocarbonitrilo"), "cyclohexanecarbonitrile");
  assert.equal(translateSpanishIupacToOpsin("ciclohexanocarboxamida"), "cyclohexanecarboxamide");
});

test("representative nitro, nitrile and aromatic amine names retain offline fallbacks", async () => {
  const names = [
    ["2-nitropropano", "CC([N+](=O)[O-])C"],
    ["2-nitrobutano", "CC([N+](=O)[O-])CC"],
    ["butanonitrilo", "CCCC#N"],
    ["pentanodinitrilo", "N#CCCCC#N"],
    ["4-nitroanilina", "Nc1ccc([N+](=O)[O-])cc1"],
  ];

  for (const [name, smiles] of names) {
    const result = await resolveNameWithOpsin(name, {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.source, "integrated-fallback");
    assert.equal(result.value.smiles, smiles);
  }
});

test("OpenChemLib admits the formal-charge pattern used by nitro groups", () => {
  const nitro = moleculeFromSmiles("CC([N+](=O)[O-])C");
  assert.equal(nitro.ok, true, nitro.ok ? undefined : nitro.error);
  const nitrogen = nitro.molecule.atoms.find((atom) => atom.element === "N");
  const negativeOxygen = nitro.molecule.atoms.find((atom) => atom.element === "O" && atom.charge === -1);
  assert.equal(nitrogen?.charge, 1);
  assert.ok(negativeOxygen);
});
