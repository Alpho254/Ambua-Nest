import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  if (!rows.length) {
    const [row] = await db.insert(settings).values({ id: 1 }).returning();
    return NextResponse.json(row);
  }
  return NextResponse.json(rows[0]);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const existing = await db.select().from(settings).where(eq(settings.id, 1));
  if (!existing.length) {
    const [row] = await db.insert(settings).values({
      id: 1,
      agencyName: body.agencyName || "Ambua Nest Realty Property Management",
      managerName: body.managerName || "Beavon Atambo",
      phone: body.phone || "0722712935",
      location: body.location || "Eldoret House Finder",
    }).returning();
    return NextResponse.json(row);
  }
  const [row] = await db.update(settings).set({
    agencyName: body.agencyName,
    managerName: body.managerName,
    phone: body.phone,
    location: body.location,
    messageTemplate: body.messageTemplate ?? existing[0].messageTemplate ?? "",
    updatedAt: new Date(),
  }).where(eq(settings.id, 1)).returning();
  return NextResponse.json(row);
}
