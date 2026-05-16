import { NextResponse } from "next/server";
import { mockCoachResponse } from "@/lib/ai/coach";

export async function POST(request: Request) {
  const body = await request.json();
  const message = String(body.message ?? "");

  if (!message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  return NextResponse.json({
    userId: body.userId ?? "demo-user",
    role: "assistant",
    createdAt: new Date().toISOString(),
    ...mockCoachResponse(body.userId ?? "demo-user", message),
  });
}
