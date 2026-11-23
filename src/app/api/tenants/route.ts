import { db } from "@/db";
import { tenants, plots } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(tenants).orderBy(tenants.plotName, tenants.houseNo);
  return NextResponse.json(rows);
}

async function ensurePlot(plotName: string) {
  const name = plotName.trim();
  if (!name) return null;
  const existing = await db.select().from(plots).where(eq(plots.name, name));
  if (existing.length) return existing[0];
  const [row] = await db.insert(plots).values({ name }).returning();
  return row;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.plotName || !body.houseNo || !body.fullName) {
    return NextResponse.json({ error: "Plot, House No and Full Name required" }, { status: 400 });
  }
  const plot = await ensurePlot(body.plotName);
  const dueDay = Math.min(28, Math.max(1, Number(body.rentDueDay) || 5));
  const [row] = await db.insert(tenants).values({
    plotId: plot?.id || null,
    plotName: body.plotName.trim(),
    houseNo: String(body.houseNo).trim(),
    fullName: body.fullName.trim(),
    phone: body.phone || "",
    monthlyRent: Number(body.monthlyRent) || 0,
    securityDeposit: Number(body.securityDeposit) || 0,
    moveInDate: body.moveInDate || "",
    status: body.status || "Active",
    rentDueDay: dueDay,
    electricityBill: Number(body.electricityBill) || 0,
    waterBill: Number(body.waterBill) || 0,
    penaltyAmount: Number(body.penaltyAmount) || 0,
  }).returning();
  return NextResponse.json(row, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const plot = body.plotName ? await ensurePlot(body.plotName) : null;
  const dueDay = Math.min(28, Math.max(1, Number(body.rentDueDay) || 5));
  const [row] = await db.update(tenants).set({
    plotId: plot?.id || body.plotId || null,
    plotName: body.plotName,
    houseNo: String(body.houseNo),
    fullName: body.fullName,
    phone: body.phone || "",
    monthlyRent: Number(body.monthlyRent) || 0,
    securityDeposit: Number(body.securityDeposit) || 0,
    moveInDate: body.moveInDate || "",
    status: body.status || "Active",
    rentDueDay: dueDay,
    electricityBill: Number(body.electricityBill) || 0,
    waterBill: Number(body.waterBill) || 0,
    penaltyAmount: Number(body.penaltyAmount) || 0,
    updatedAt: new Date(),
  }).where(eq(tenants.id, body.id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Keep payment history: payments.tenantId set null via FK, snapshot fields remain
  await db.delete(tenants).where(eq(tenants.id, id));
  return NextResponse.json({ ok: true });
}
