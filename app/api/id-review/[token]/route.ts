import { NextResponse } from 'next/server';
import { applyDecision } from '@/lib/id-review-decision';

/** POST { decision: "APPROVED" | "DECLINED" } — the admin's answer. The emailed
 * token is the only credential, and it works once. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  if (decision !== 'APPROVED' && decision !== 'DECLINED') {
    return NextResponse.json({ error: 'Choose confirm or reject.' }, { status: 400 });
  }
  const r = await applyDecision(token, decision);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
