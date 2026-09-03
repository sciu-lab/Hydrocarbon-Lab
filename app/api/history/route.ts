import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { moleculeHistory } from "../../../db/schema";

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

type HistoryPayload = {
  name?: string;
  formula?: string;
  family?: string;
  molecule?: unknown;
  viewMode?: "condensed" | "skeletal";
  archive?: boolean;
  updateDraft?: boolean;
};

const MAX_HISTORY_ITEMS = 50;
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

function toHistoryItem(row: typeof moleculeHistory.$inferSelect) {
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
  if (combined.includes("no such table") || combined.includes("molecule_history")) {
    return "El historial todavía se está preparando. Inténtalo nuevamente en unos segundos.";
  }
  return "No fue posible acceder al historial en este momento.";
}

export async function GET(request: Request) {
  const owner = await resolveOwner(request);
  if (!owner) {
    return Response.json({ error: "No se pudo identificar este navegador." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [draftRows, historyRows] = await Promise.all([
      db
        .select()
        .from(moleculeHistory)
        .where(and(
          eq(moleculeHistory.ownerKey, owner.ownerKey),
          eq(moleculeHistory.isDraft, true),
        ))
        .orderBy(desc(moleculeHistory.updatedAt))
        .limit(1),
      db
        .select()
        .from(moleculeHistory)
        .where(and(
          eq(moleculeHistory.ownerKey, owner.ownerKey),
          eq(moleculeHistory.isDraft, false),
        ))
        .orderBy(desc(moleculeHistory.updatedAt), desc(moleculeHistory.createdAt))
        .limit(MAX_HISTORY_ITEMS),
    ]);

    return Response.json({
      scope: owner.scope,
      draft: draftRows[0] ? toHistoryItem(draftRows[0]) : null,
      history: historyRows.map(toHistoryItem).filter(Boolean),
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
    const payload = (await request.json()) as HistoryPayload;
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
    const draftId = `draft:${owner.ownerKey}`;

    if (payload.updateDraft !== false) {
      await db
        .insert(moleculeHistory)
        .values({
          id: draftId,
          ownerKey: owner.ownerKey,
          name,
          formula,
          family,
          moleculeJson,
          viewMode,
          fingerprint,
          atomCount: molecule.atoms.length,
          isDraft: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: moleculeHistory.id,
          set: {
            name,
            formula,
            family,
            moleculeJson,
            viewMode,
            fingerprint,
            atomCount: molecule.atoms.length,
            updatedAt: now,
          },
        });
    }

    let archivedItem = null;
    if (payload.archive !== false) {
      const archiveId = crypto.randomUUID();
      const [row] = await db
        .insert(moleculeHistory)
        .values({
          id: archiveId,
          ownerKey: owner.ownerKey,
          name,
          formula,
          family,
          moleculeJson,
          viewMode,
          fingerprint,
          atomCount: molecule.atoms.length,
          isDraft: false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            moleculeHistory.ownerKey,
            moleculeHistory.isDraft,
            moleculeHistory.fingerprint,
          ],
          set: { name, formula, family, updatedAt: now },
        })
        .returning();
      archivedItem = row ? toHistoryItem(row) : null;

      const staleRows = await db
        .select({ id: moleculeHistory.id })
        .from(moleculeHistory)
        .where(and(
          eq(moleculeHistory.ownerKey, owner.ownerKey),
          eq(moleculeHistory.isDraft, false),
        ))
        .orderBy(desc(moleculeHistory.updatedAt), desc(moleculeHistory.createdAt))
        .limit(100)
        .offset(MAX_HISTORY_ITEMS);
      if (staleRows.length) {
        await db
          .delete(moleculeHistory)
          .where(inArray(moleculeHistory.id, staleRows.map((row) => row.id)));
      }
    }

    return Response.json({ scope: owner.scope, item: archivedItem });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const owner = await resolveOwner(request);
  if (!owner) {
    return Response.json({ error: "No se pudo identificar este navegador." }, { status: 400 });
  }

  const searchParams = new URL(request.url).searchParams;
  const clearAll = searchParams.get("all") === "true";
  const id = searchParams.get("id")?.trim() ?? "";
  if (clearAll) {
    try {
      const db = await getDb();
      await db
        .delete(moleculeHistory)
        .where(and(
          eq(moleculeHistory.ownerKey, owner.ownerKey),
          eq(moleculeHistory.isDraft, false),
        ));
      return Response.json({ deleted: true, all: true });
    } catch (error) {
      return Response.json({ error: routeError(error) }, { status: 500 });
    }
  }
  if (!id || id.startsWith("draft:")) {
    return Response.json({ error: "Registro no válido." }, { status: 400 });
  }

  try {
    const db = await getDb();
    await db
      .delete(moleculeHistory)
      .where(and(
        eq(moleculeHistory.id, id),
        eq(moleculeHistory.ownerKey, owner.ownerKey),
        eq(moleculeHistory.isDraft, false),
      ));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
