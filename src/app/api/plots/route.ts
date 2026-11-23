import { db } from "@/db";
import { plots, tenants } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(plots).orderBy(plots.name);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Plot name required" }, { status: 400 });
  const location = body.location || "Eldoret";
  // upsert by name
  const existing = await db.select().from(plots).where(eq(plots.name, name));
  if (existing.length) return NextResponse.json(existing[0]);
  const [row] = await db.insert(plots).values({ name, location }).returning();
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const name = searchParams.get("name");
  if (id) {
    await db.delete(plots).where(eq(plots.id, id));
  } else if (name) {
    await db.delete(plots).where(eq(plots.name, name));
  } else {
    return NextResponse.json({ error: "id or name required" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: "Plot name required" }, { status: 400 });
  const name = body.name.trim();
  // Check duplicate name
  const dup = await db.select().from(plots).where(sql`${plots.name} = ${name} AND ${plots.id} != ${body.id}`);
  if (dup.length) return NextResponse.json({ error: `Plot "${name}" already exists` }, { status: 409 });
  const old = await db.select().from(plots).where(eq(plots.id, body.id));
  const oldName = old[0]?.name;
  const [row] = await db.update(plots).set({ name, location: body.location || "Eldoret" }).where(eq(plots.id, body.id)).returning();
  // cascade name to tenants and payments
  if (oldName && oldName !== name) {
    await db.execute(sql`UPDATE tenants SET plot_name = ${name} WHERE plot_name = ${oldName}`);
    await db.execute(sql`UPDATE payments SET plot_name = ${name} WHERE plot_name = ${oldName}`);
  }
  return NextResponse.json(row);
}
