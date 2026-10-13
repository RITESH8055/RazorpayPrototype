// Vercel function: GET /api/health
import { hasKey, MODEL } from "../server/analyze.js";

export function GET() {
  return Response.json({ ok: true, hasKey: hasKey(), model: MODEL });
}
