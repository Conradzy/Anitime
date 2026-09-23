import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "AniTime Next.js server is working",
    time: new Date().toISOString(),
  });
}