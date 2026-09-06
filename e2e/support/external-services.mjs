import { createServer } from "node:http";

const PORT = 3135;
const OPENROUTER_AUTHORIZATION = "Bearer acceptance-openrouter-key";
const WORDPRESS_AUTHORIZATION = `Basic ${Buffer.from(
  "acceptance:acceptance-wordpress-password",
).toString("base64")}`;

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

function check(status, quoted) {
  return {
    status,
    note: status === "pass" ? "The Article meets this check." : "Revise this.",
    quoted,
  };
}

function modelOutput(requestBody) {
  const user = [...(requestBody.messages ?? [])].reverse().find(({ role }) => role === "user");
  const input = JSON.parse(typeof user?.content === "string" ? user.content : "{}");
  if (Array.isArray(input.claims) && input.grounding) {
    const quoted = input.revision.headline;
    const approve = input.revision.revisionNumber === 2;
    return {
      recommendation: approve ? "approve" : "request_changes",
      summary: approve ? "The revision is ready." : "The first draft needs a clearer lead.",
      checks: {
        assignment: check("pass", quoted),
        support: check("pass", quoted),
        accuracy: check("pass", quoted),
        headline: check("pass", quoted),
        structure: check(approve ? "pass" : "needs_changes", quoted),
        style: check("pass", quoted),
      },
      revisionInstructions: approve ? null : "Make the lead explicitly state the verified fact.",
    };
  }
  const reference = input.evidence?.[0];
  const revised = Boolean(input.article);
  return {
    headline: revised ? "Verified harbour service restored" : "Harbour service update",
    dek: null,
    blocks: [
      {
        kind: "claim",
        markdown: revised
          ? "The verified notice says harbour service was restored Monday."
          : "Harbour service was restored Monday.",
        citations: [
          {
            sourceId: reference.sourceId,
            evidenceId: reference.evidenceId,
            quote: "Harbour service was restored Monday.",
          },
        ],
      },
    ],
  };
}

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return json(response, 200, { ok: true });
    }
    if (request.method === "POST" && request.url === "/openrouter/chat/completions") {
      if (request.headers.authorization !== OPENROUTER_AUTHORIZATION) {
        return json(response, 401, { error: "unauthorized" });
      }
      const body = await readJson(request);
      return json(response, 200, {
        id: "acceptance-completion",
        object: "chat.completion",
        created: 1,
        model: body.model ?? "acceptance/model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: JSON.stringify(modelOutput(body)) },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    if (request.method === "POST" && request.url === "/wp-json/wp/v2/posts") {
      if (request.headers.authorization !== WORDPRESS_AUTHORIZATION) {
        return json(response, 401, { error: "unauthorized" });
      }
      const body = await readJson(request);
      return json(response, 201, { id: 412, slug: body.slug });
    }
    return json(response, 404, { ok: false });
  } catch {
    return json(response, 400, { ok: false });
  }
}).listen(PORT, "127.0.0.1");
