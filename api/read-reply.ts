// Vercel function: POST /api/read-reply
import { readReply } from "../server/readReply.js";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  const { status, body } = await readReply(input);
  return Response.json(body, { status });
}
