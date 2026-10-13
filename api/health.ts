// Vercel function: GET /api/health
import { hasKey, MODEL } from "../server/readReply.js";

export function GET() {
  return Response.json({ ok: true, hasKey: hasKey(), model: MODEL });
}
