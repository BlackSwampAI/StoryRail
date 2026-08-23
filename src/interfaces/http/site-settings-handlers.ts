import { parseCredentialSlot } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

function isJsonRequest(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | Response> {
  if (!isJsonRequest(request))
    return respond(
      error("UNSUPPORTED_MEDIA_TYPE", "The request Content-Type must be application/json."),
      415,
    );
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return respond(error("INVALID_JSON", "The request body must contain valid JSON."), 400);
  }
}

/**
 * Everything the settings screen is allowed to know: the model each role runs on, and which
 * credentials exist along with the four characters that identify them.
 *
 * There is no route anywhere that returns a stored credential, and there must never be one. A
 * single "show the current value" convenience would turn an encrypted store into a plaintext one
 * with extra steps, because the value would then travel to a browser, through a proxy, and into
 * whatever logs sit between. The hint exists precisely so nobody needs that route.
 */
export function createReadSiteSettingsHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}) {
  return async (): Promise<Response> => {
    try {
      const { settings, credentials } = await dependencies.getRuntime().readSiteSettings();
      return respond({ ok: true, settings, credentials }, 200);
    } catch {
      return respond(error("INTERNAL_SERVER_ERROR", "The settings could not be read."), 500);
    }
  };
}

export function createUpdateSiteSettingsHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}) {
  return async (request: Request): Promise<Response> => {
    const read = await readJsonBody(request);
    if (read instanceof Response) return read;
    try {
      const result = await dependencies.getRuntime().updateSiteSettings(read.body);
      return respond(result, result.ok ? 200 : 422);
    } catch {
      return respond(error("INTERNAL_SERVER_ERROR", "The settings could not be saved."), 500);
    }
  };
}

export interface CredentialSlotRouteContext {
  readonly params: Promise<{ readonly slot: string }>;
}

/**
 * Writes a credential and answers with its hint. The response deliberately reflects nothing of
 * the submitted secret back, so a client that logs its own responses cannot capture it.
 */
export function createSetSiteCredentialHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}) {
  return async (request: Request, context: CredentialSlotRouteContext): Promise<Response> => {
    const slot = parseCredentialSlot((await context.params).slot);
    if (!slot.ok) return respond({ ok: false, error: slot.error }, 400);
    const read = await readJsonBody(request);
    if (read instanceof Response) return read;
    const body = read.body;
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof (body as { secret: unknown }).secret !== "string"
    )
      return respond(
        error("INVALID_REQUEST", "The request body must contain exactly secret."),
        400,
      );

    try {
      const result = await dependencies
        .getRuntime()
        .setSiteCredential({ slot: slot.slot, secret: (body as { secret: string }).secret });
      return respond(result, result.ok ? 200 : 422);
    } catch {
      return respond(error("INTERNAL_SERVER_ERROR", "The credential could not be saved."), 500);
    }
  };
}

export function createRemoveSiteCredentialHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}) {
  return async (_request: Request, context: CredentialSlotRouteContext): Promise<Response> => {
    const slot = parseCredentialSlot((await context.params).slot);
    if (!slot.ok) return respond({ ok: false, error: slot.error }, 400);
    try {
      const removed = await dependencies.getRuntime().removeSiteCredential(slot.slot);
      return removed
        ? respond({ ok: true, slot: slot.slot }, 200)
        : respond(error("CREDENTIAL_NOT_CONFIGURED", "No credential is stored in that slot."), 404);
    } catch {
      return respond(error("INTERNAL_SERVER_ERROR", "The credential could not be removed."), 500);
    }
  };
}
