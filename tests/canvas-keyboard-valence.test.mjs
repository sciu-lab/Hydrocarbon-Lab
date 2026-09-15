import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let findBondValenceViolation;
let findDirectionalNeighborId;
let findMoleculeValenceViolation;
let findNextValidBondOrder;
let formatBondValenceError;
let getFormulaDisplayTokens;
let getAtomValenceViolation;
let normalizeFormulaBuilderInput;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({
    findBondValenceViolation,
    findDirectionalNeighborId,
    findMoleculeValenceViolation,
    findNextValidBondOrder,
    formatBondValenceError,
    getFormulaDisplayTokens,
    getAtomValenceViolation,
    normalizeFormulaBuilderInput,
  } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

test("blocks a triple bond when the selected carbon is already tetravalent", () => {
  const molecule = {
    atoms: [
      { id: 1, x: -1, y: 0 },
      { id: 2, x: 0, y: 0 },
      { id: 3, x: 1, y: 0 },
      { id: 4, x: 0, y: 1 },
    ],
    bonds: [[1, 2, 1], [2, 3, 2], [2, 4, 1]],
  };
  const violation = findBondValenceViolation(molecule, 2, 1, 3, 1);
  assert.ok(violation);
  assert.equal(violation.current, 4);
  assert.equal(
    formatBondValenceError(3, violation),
    "No se puede añadir un enlace triple en el Carbono 2 porque ya tiene 4 enlaces.",
  );
});

test("reports oxygen saturation with its two-link maximum", () => {
  const molecule = {
    atoms: [
      { id: 1, x: -1, y: 0 },
      { id: 2, x: 0, y: 0, element: "O" },
      { id: 3, x: 1, y: 0 },
    ],
    bonds: [[1, 2, 1], [2, 3, 1]],
  };
  const violation = getAtomValenceViolation(molecule, 2, 1);
  assert.ok(violation);
  assert.equal(violation.limit, 2);
  assert.match(formatBondValenceError(1, violation), /Oxígeno 2.*ya tiene 2 enlaces/);
});

test("allows lowering a bond order and detects invalid imported structures", () => {
  const molecule = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 0, y: 1 },
    ],
    bonds: [[1, 2, 3], [1, 3, 2]],
  };
  assert.equal(findBondValenceViolation(molecule, 1, 2, 1, 3), null);
  const violation = findMoleculeValenceViolation(molecule);
  assert.equal(violation?.atomId, 1);
  assert.equal(violation?.attempted, 5);
});

test("finds the next valid bond order without ever selecting an invalid triple bond", () => {
  const allOrdersValid = {
    atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }],
    bonds: [[1, 2, 1]],
  };
  assert.equal(findNextValidBondOrder(allOrdersValid, 1, 2, 1), 2);
  allOrdersValid.bonds[0][2] = 2;
  assert.equal(findNextValidBondOrder(allOrdersValid, 1, 2, 2), 3);
  allOrdersValid.bonds[0][2] = 3;
  assert.equal(findNextValidBondOrder(allOrdersValid, 1, 2, 3), 1);

  const tripleIsInvalid = {
    atoms: [
      { id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 },
      { id: 3, x: 0, y: 1 }, { id: 4, x: 0, y: -1 },
    ],
    bonds: [[1, 2, 2], [1, 3, 1], [1, 4, 1]],
  };
  assert.equal(findNextValidBondOrder(tripleIsInvalid, 1, 2, 2), 1);
});

test("formats formula quantities while preserving leading coefficients", () => {
  const formatted = (formula) => getFormulaDisplayTokens(formula)
    .map((token) => token.subscript ? `_${token.text}` : token.text)
    .join("");
  assert.equal(formatted("CH4"), "CH_4");
  assert.equal(formatted("C2H6"), "C_2H_6");
  assert.equal(formatted("CH3CH2OH"), "CH_3CH_2OH");
  assert.equal(formatted("CH3(CH2)4CH3"), "CH_3(CH_2)_4CH_3");
  assert.equal(formatted("(CH3)3COH"), "(CH_3)_3COH");
  assert.equal(formatted("2(CH3)2O"), "2(CH_3)_2O");
  assert.equal(formatted("3H2O"), "3H_2O");
  assert.equal(normalizeFormulaBuilderInput("CH₃CH₂OH"), "CH3CH2OH");
});



test("accepts the formal valences of a nitro group imported from OPSIN", () => {
  const molecule = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0, element: "N", charge: 1 },
      { id: 3, x: 2, y: -0.6, element: "O" },
      { id: 4, x: 2, y: 0.6, element: "O", charge: -1 },
    ],
    bonds: [[1, 2, 1], [2, 3, 2], [2, 4, 1]],
  };

  assert.equal(findMoleculeValenceViolation(molecule), null);
  assert.equal(getAtomValenceViolation(molecule, 2, 0), null);
  const oxygenViolation = getAtomValenceViolation(molecule, 4, 1);
  assert.ok(oxygenViolation);
  assert.equal(oxygenViolation.limit, 1);
});

test("chooses the neighbor that matches each horizontal arrow", () => {
  const molecule = {
    atoms: [
      { id: 1, x: -1, y: 0.1 },
      { id: 2, x: 0, y: 0 },
      { id: 3, x: 1, y: -0.1 },
      { id: 4, x: 0, y: 1 },
    ],
    bonds: [[1, 2, 1], [2, 3, 1], [2, 4, 1]],
  };
  assert.equal(findDirectionalNeighborId(molecule, 2, -1, 0), 1);
  assert.equal(findDirectionalNeighborId(molecule, 2, 1, 0), 3);
});
