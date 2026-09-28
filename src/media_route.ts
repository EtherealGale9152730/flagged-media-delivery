import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { createInfraiClient, InfraiError, type InfraiClient } from "./infrai_client.ts";
import { decideDelivery, ingestionBody, type ReleasePhase } from "./media_pipeline.ts";

const FLAG_KEY = "media-streaming";
const phases = new Set<ReleasePhase>(["team", "creator-preview", "all-creators"]);

export function createMediaService(infrai: InfraiClient) {
  let releasePhase: ReleasePhase = "team";

  return createServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/media/ingestions") {
        const body = ingestionBody.parse(await readJson(request));
        const enabled = await infrai.flags.is_enabled(FLAG_KEY);
        return sendJson(response, 202, decideDelivery(body, enabled, releasePhase));
      }

      const match = request.url?.match(/^\/internal\/release\/([^/?]+)$/);
      if (request.method === "POST" && match && phases.has(match[1] as ReleasePhase)) {
        releasePhase = match[1] as ReleasePhase;
        return sendJson(response, 200, { phase: releasePhase });
      }

      return sendJson(response, 404, { message: "Route not found" });
    } catch (error) {
      if (error instanceof ZodError) {
        return sendJson(response, 400, { message: "Invalid ingestion", issues: error.issues });
      }
      if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        return sendJson(response, status, { message: error.message, code: error.code });
      }
      return sendJson(response, 500, { message: "Unexpected service error" });
    }
  });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createMediaService(createInfraiClient()).listen(port, () => {
    console.log(`Media service listening on http://localhost:${port}`);
  });
}
