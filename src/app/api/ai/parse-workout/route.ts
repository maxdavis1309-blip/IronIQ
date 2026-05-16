import { NextResponse } from "next/server";
import { mockParseWorkout } from "@/lib/ai/mock-parser";

export async function POST(request: Request) {
  const body = await request.json();
  const rawText = String(body.rawText ?? "");

  if (!rawText.trim()) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  const parsed = mockParseWorkout(rawText);
  return NextResponse.json({
    userId: body.userId ?? "demo-user",
    date: body.date ?? new Date().toISOString(),
    ...parsed,
  });
}
