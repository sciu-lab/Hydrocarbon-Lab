import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { savedMolecules } from "../../../db/schema";

type ChemicalElement = "C" | "O" | "N" | "F" | "Cl" | "Br" | "I";
type BondOrder = 1 | 2 | 3;

type MoleculePayload = {
  atoms: Array<{
    id: number;
    x: number;
    y: number;
    element?: ChemicalElement;
  }>;
  bonds: Array<[number, number, BondOrder?]>;
  rings?: Array<{
    id: number;
    kind: "cycloalkane" | "aromatic";
    atomIds: number[];
  }>;
  isMirrored?: boolean;
};

type SavedPayload = {
  name?: string;
  formula?: string;
  family?: string;
  molecule?: unknown;
  viewMode?: "condensed" | "skeletal";
};

const MAX_SAVED_ITEMS = 200;
const VISITOR_ID_PATTERN = /^[a-zA-Z0-9_-]{20,90}$/;
const ALLOWED_ELEMENTS = new Set<ChemicalElement>([
  "C",
  "O",
  "N",
  "F",
  "Cl",
  "Br",
  "I",
]);

function cleanText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMolecule(value: unknown): MoleculePayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MoleculePayload>;
  if (
    !Array.isArray(candidate.atoms)
    || !Array.isArray(candidate.bonds)
    || candidate.atoms.length < 1
    || candidate.atoms.length > 180
    || candidate.bonds.length > 360
  ) {
    return null;
  }

  const ids = new Set<number>();
  const atoms = candidate.atoms.map((atom) => {
    if (
      !atom
      || !Number.isSafeInteger(atom.id)
      || !isFiniteNumber(atom.x)
      || !isFiniteNumber(atom.y)
      || Math.abs(atom.x) > 200
      || Math.abs(atom.y) > 200
      || (atom.element !== undefined && !ALLOWED_ELEMENTS.has(atom.element))
      || ids.has(atom.id)
    ) {
      return null;
    }
    ids.add(atom.id);
    return {
      id: atom.id,
      x: atom.x,
      y: atom.y,
      ...(atom.element && atom.element !== "C" ? { element: atom.element } : {}),
    };
  });
  if (atoms.some((atom) => atom === null)) return null;

  const bonds = candidate.bonds.map((bond) => {
    if (
      !Array.isArray(bond)
      || bond.length < 2
      || !Number.isSafeInteger(bond[0])
      || !Number.isSafeInteger(bond[1])
      || bond[0] === bond[1]
      || !ids.has(bond[0])
      || !ids.has(bond[1])
      || (bond[2] !== undefined && bond[2] !== 1 && bond[2] !== 2 && bond[2] !== 3)
    ) {
      return null;
    }
    return bond[2] ? [bond[0], bond[1], bond[2]] : [bond[0], bond[1]];
  });
  if (bonds.some((bond) => bond === null)) return null;

  let rings: MoleculePayload["rings"];
  if (candidate.rings !== undefined) {
    if (!Array.isArray(candidate.rings) || candidate.rings.length > 20) return null;
    rings = candidate.rings.map((ring) => {
      if (
        !ring
        || !Number.isSafeInteger(ring.id)
        || (ring.kind !== "cycloalkane" && ring.kind !== "aromatic")
        || !Array.isArray(ring.atomIds)
        || ring.atomIds.length < 3
        || ring.atomIds.length > 20
        || ring.atomIds.some((id) => !Number.isSafeInteger(id) || !ids.has(id))
      ) {
        return null;
      }
      return { id: ring.id, kind: ring.kind, atomIds: [...ring.atomIds] };
    }).filter((ring): ring is NonNullable<typeof ring> => ring !== null);
    if (rings.length !== candidate.rings.length) return null;
  }

  return {
    atoms: atoms as MoleculePayload["atoms"],
    bonds: bonds as MoleculePayload["bonds"],
    ...(rings?.length ? { rings } : {}),
    ...(candidate.isMirrored === true ? { isMirrored: true } : {}),
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function resolveOwner(request: Request) {
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (email) {
    return {
      ownerKey: `account:${await sha256(email)}`,
      scope: "account" as const,
    };
  }

  const visitorId = request.headers.get("x-lab-visitor-id")?.trim() ?? "";
  if (!VISITOR_ID_PATTERN.test(visitorId)) return null;
  return { ownerKey: `visitor:${visitorId}`, scope: "device" as const };
}

function toSavedItem(row: typeof savedMolecules.$inferSelect) {
  try {
    return {
      id: row.id,
      name: row.name,
      formula: row.formula,
      family: row.family,
      molecule: JSON.parse(row.moleculeJson) as MoleculePayload,
      viewMode: row.viewMode === "skeletal" ? "skeletal" : "condensed",
      atomCount: row.atomCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  } catch {
    return null;
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado";
  const cause = error instanceof Error && error.cause instanceof Error
    ? error.cause.message
    : "";
  const combined = `${message}\n${cause}`;
  if (combined.includes("no such table") || combined.includes("saved_molecules")) {
    return "Guardados todavía se está preparando. Inténtalo nuevamente en unos segundos.";
  }
  return "No fue posible acceder a Guardados en este momento.";
}

export async function GET(request: Request) {
  const owner = await resolveOwner(request);
  if (!owner) {
    return Response.json({ error: "No se pudo identificar este navegador." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(savedMolecules)
      .where(eq(savedMolecules.ownerKey, owner.ownerKey))
      .orderBy(desc(savedMolecules.updatedAt), desc(savedMolecules.createdAt))
      .limit(MAX_SAVED_ITEMS);

    return Response.json({
      scope: owner.scope,
      saved: rows.map(toSavedItem).filter(Boolean),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const owner = await resolveOwner(request);
  if (!owner) {
    return Response.json({ error: "No se pudo identificar este navegador." }, { status: 400 });
  }

  try {
    const payload = (await request.json()) as SavedPayload;
    const molecule = normalizeMolecule(payload.molecule);
    if (!molecule) {
      return Response.json({ error: "La estructura no es válida." }, { status: 400 });
    }

    const moleculeJson = JSON.stringify(molecule);
    if (moleculeJson.length > 160_000) {
      return Response.json({ error: "La estructura es demasiado grande." }, { status: 413 });
    }

    const name = cleanText(payload.name, "Estructura sin nombre", 160);
    const formula = cleanText(payload.formula, "—", 80);
    const family = cleanText(payload.family, "Compuesto orgánico", 90);
    const viewMode = payload.viewMode === "skeletal" ? "skeletal" : "condensed";
    const fingerprint = await sha256(`${moleculeJson}|${viewMode}`);
    const now = new Date().toISOString();
    const db = await getDb();
    const [existing] = await db
      .select({ id: savedMolecules.id })
      .from(savedMolecules)
      .where(and(
        eq(savedMolecules.ownerKey, owner.ownerKey),
        eq(savedMolecules.fingerprint, fingerprint),
      ))
      .limit(1);

    if (!existing) {
      const [totalRow] = await db
        .select({ total: count() })
        .from(savedMolecules)
        .where(eq(savedMolecules.ownerKey, owner.ownerKey));
      if ((totalRow?.total ?? 0) >= MAX_SAVED_ITEMS) {
        return Response.json(
          { error: `Guardados admite hasta ${MAX_SAVED_ITEMS} estructuras. Exporta o elimina alguna antes de añadir otra.` },
          { status: 409 },
        );
      }
    }

    const [row] = await db
      .insert(savedMolecules)
      .values({
        id: existing?.id ?? crypto.randomUUID(),
        ownerKey: owner.ownerKey,
        name,
        formula,
        family,
        moleculeJson,
        viewMode,
        fingerprint,
        atomCount: molecule.atoms.length,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [savedMolecules.ownerKey, savedMolecules.fingerprint],
        set: {
          name,
          formula,
          family,
          moleculeJson,
          viewMode,
          atomCount: molecule.atoms.length,
          updatedAt: now,
        },
      })
      .returning();

    return Response.json({
      scope: owner.scope,
      item: row ? toSavedItem(row) : null,
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const owner = await resolveOwner(request);
  if (!owner) {
    return Response.json({ error: "No se pudo identificar este navegador." }, { status: 400 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return Response.json({ error: "Registro no válido." }, { status: 400 });
  }

  try {
    const db = await getDb();
    await db
      .delete(savedMolecules)
      .where(and(
        eq(savedMolecules.id, id),
        eq(savedMolecules.ownerKey, owner.ownerKey),
      ));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
