// Vercel function: POST /api/analyze
import { analyze } from "../server/analyze.js";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  const { status, body } = await analyze(input);
  return Response.json(body, { status });
}
