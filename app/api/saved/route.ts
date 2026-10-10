import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { savedMolecules } from "../../../db/schema";
import { normalizeMoleculePayload } from "../molecule-payload";
import { getCondensedUnavailableReason } from "../../condensed-layout";
import {
  decodeApiViewMode,
  decodeViewModeV1,
  decodeViewModeV2,
  encodeViewModeV1,
  encodeViewModeV2,
  viewModeFingerprintKey,
} from "../../view-mode";

// Versionless requests keep the established V1 interpretation; explicit V2 is opt-in.
type SavedPayload = {
  name?: string;
  formula?: string;
  family?: string;
  molecule?: unknown;
  viewMode?: unknown;
  viewModeVersion?: unknown;
};

const MAX_SAVED_ITEMS = 200;
const VISITOR_ID_PATTERN = /^[a-zA-Z0-9_-]{20,90}$/;

function cleanText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
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
    const molecule = normalizeMoleculePayload(JSON.parse(row.moleculeJson));
    if (!molecule) return null;
    const viewModeVersion = row.viewModeVersion === 2 ? 2 : 1;
    const decoded = viewModeVersion === 2
      ? decodeViewModeV2(row.viewMode)
      : { ok: true as const, viewMode: decodeViewModeV1(row.viewMode) ?? "semi-developed" };
    const requestedMode = decoded.ok ? decoded.viewMode : "semi-developed";
    const viewMode = requestedMode === "condensed" && getCondensedUnavailableReason(molecule)
      ? "semi-developed"
      : requestedMode;
    return {
      id: row.id,
      name: row.name,
      formula: row.formula,
      family: row.family,
      molecule,
      viewModeVersion,
      viewMode: viewModeVersion === 2
        ? encodeViewModeV2(viewMode)
        : encodeViewModeV1(viewMode === "condensed" ? "semi-developed" : viewMode),
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
    const molecule = normalizeMoleculePayload(payload.molecule);
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
    const decodedViewMode = decodeApiViewMode(payload.viewMode, payload.viewModeVersion);
    if (!decodedViewMode) {
      return Response.json({ error: "El modo de representación no es válido." }, { status: 400 });
    }
    if (decodedViewMode === "condensed" && getCondensedUnavailableReason(molecule)) {
      return Response.json({ error: "La vista condensada solo está disponible para estructuras acíclicas." }, { status: 400 });
    }
    const viewModeVersion = payload.viewModeVersion === 2 ? 2 : 1;
    const viewMode = viewModeVersion === 2
      ? encodeViewModeV2(decodedViewMode)
      : encodeViewModeV1(decodedViewMode === "condensed" ? "semi-developed" : decodedViewMode);
    const fingerprint = await sha256(`${moleculeJson}|${viewModeFingerprintKey(decodedViewMode)}`);
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
        viewModeVersion,
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
          viewModeVersion,
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
