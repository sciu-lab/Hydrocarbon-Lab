import { resolveChemicalName } from "../../name-structure-resolver";

const corsHeaders = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders,
      "cache-control": "no-store",
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  let payload: { name?: unknown };
  try {
    payload = await request.json() as { name?: unknown };
  } catch {
    return json({ error: "La solicitud no contiene un nombre válido." }, 400);
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) return json({ error: "Escribe un nombre químico." }, 400);
  if (name.length > 220) {
    return json({ error: "El nombre es demasiado largo para este constructor." }, 400);
  }

  const result = await resolveChemicalName(name);
  if (result.ok) return json(result.value);

  return json(
    { error: result.error, detail: result.detail },
    result.serviceReached ? 422 : 503,
  );
}
