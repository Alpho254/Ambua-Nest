import { db } from "@/db";
import { payments, tenants } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(payments).orderBy(sql`${payments.paymentDate} DESC`, sql`${payments.createdAt} DESC`);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.tenantId && !body.tenantName) return NextResponse.json({ error: "Tenant required" }, { status: 400 });
  if (!body.amount || Number(body.amount) <= 0) return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
  if (!body.forMonth) return NextResponse.json({ error: "For Month required" }, { status: 400 });

  // Duplicate txn code protection (case-insensitive)
  const txn = (body.txnCode || "").trim();
  if (txn) {
    const dup = await db.select().from(payments).where(sql`LOWER(${payments.txnCode}) = LOWER(${txn})`);
    if (dup.length) {
      return NextResponse.json({ error: `Duplicate transaction code: ${txn} already used in receipt ${dup[0].receiptCode} for ${dup[0].tenantName}` }, { status: 409 });
    }
  }

  // Resolve tenant snapshot
  let tenantRow: any = null;
  if (body.tenantId) {
    const found = await db.select().from(tenants).where(eq(tenants.id, body.tenantId));
    if (found.length) tenantRow = found[0];
  }

  const receiptCode = body.receiptCode || `ANR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Check receipt uniqueness
  const dupReceipt = await db.select().from(payments).where(eq(payments.receiptCode, receiptCode));
  if (dupReceipt.length) {
    return NextResponse.json({ error: `Receipt code ${receiptCode} already exists` }, { status: 409 });
  }

  const [row] = await db.insert(payments).values({
    tenantId: body.tenantId || null,
    plotName: body.plotName || tenantRow?.plotName || "",
    houseNo: body.houseNo || tenantRow?.houseNo || "",
    tenantName: body.tenantName || tenantRow?.fullName || "",
    phone: body.phone || tenantRow?.phone || "",
    amount: Number(body.amount),
    forMonth: body.forMonth,
    channel: body.channel || "M-Pesa Paybill",
    txnCode: txn,
    receiptCode,
    paymentDate: body.paymentDate || new Date().toISOString().slice(0, 10),
    notes: body.notes || "",
  }).returning();
  return NextResponse.json(row, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!body.amount || Number(body.amount) <= 0) return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
  if (!body.forMonth) return NextResponse.json({ error: "For Month required" }, { status: 400 });

  const txn = (body.txnCode || "").trim();
  if (txn) {
    const dup = await db.select().from(payments).where(sql`LOWER(${payments.txnCode}) = LOWER(${txn}) AND ${payments.id} != ${body.id}`);
    if (dup.length) {
      return NextResponse.json({ error: `Duplicate transaction code: ${txn} already used in receipt ${dup[0].receiptCode} for ${dup[0].tenantName}` }, { status: 409 });
    }
  }

  const receiptCode = (body.receiptCode || "").trim();
  if (receiptCode) {
    const dupReceipt = await db.select().from(payments).where(sql`${payments.receiptCode} = ${receiptCode} AND ${payments.id} != ${body.id}`);
    if (dupReceipt.length) {
      return NextResponse.json({ error: `Receipt code ${receiptCode} already exists` }, { status: 409 });
    }
  }

  let tenantRow: any = null;
  if (body.tenantId) {
    const found = await db.select().from(tenants).where(eq(tenants.id, body.tenantId));
    if (found.length) tenantRow = found[0];
  }

  const [row] = await db.update(payments).set({
    tenantId: body.tenantId || null,
    plotName: body.plotName || tenantRow?.plotName || "",
    houseNo: body.houseNo || tenantRow?.houseNo || "",
    tenantName: body.tenantName || tenantRow?.fullName || "",
    phone: body.phone || tenantRow?.phone || "",
    amount: Number(body.amount),
    forMonth: body.forMonth,
    channel: body.channel || "M-Pesa Paybill",
    txnCode: txn,
    receiptCode: receiptCode || undefined,
    paymentDate: body.paymentDate,
    notes: body.notes || "",
  }).where(eq(payments.id, body.id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(payments).where(eq(payments.id, id));
  return NextResponse.json({ ok: true });
}
