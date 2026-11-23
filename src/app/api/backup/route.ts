import { db } from "@/db";
import { plots, tenants, payments, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const [p, t, pay, s] = await Promise.all([
    db.select().from(plots),
    db.select().from(tenants),
    db.select().from(payments),
    db.select().from(settings),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    version: "ambua-nest-v3",
    plots: p,
    tenants: t,
    payments: pay,
    settings: s[0] || null,
  };
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ambua-nest-rent-backup-${new Date().toISOString().slice(0,10)}.json"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // body can be { plots, tenants, payments, settings } or { data: {...} }
  const data = body.data || body;
  if (!data || (!data.tenants && !data.payments)) {
    return NextResponse.json({ error: "Invalid backup file" }, { status: 400 });
  }

  // Clear existing (order matters)
  await db.delete(payments);
  await db.delete(tenants);
  await db.delete(plots);

  // Restore plots
  if (data.plots?.length) {
    for (const p of data.plots) {
      await db.insert(plots).values({ id: p.id, name: p.name, location: p.location || "Eldoret" }).onConflictDoNothing();
    }
  }
  // Restore tenants
  if (data.tenants?.length) {
    for (const t of data.tenants) {
      await db.insert(tenants).values({
        id: t.id,
        plotId: t.plotId || null,
        plotName: t.plotName,
        houseNo: t.houseNo,
        fullName: t.fullName,
        phone: t.phone || "",
        monthlyRent: t.monthlyRent || 0,
        securityDeposit: t.securityDeposit || 0,
        moveInDate: t.moveInDate || "",
        status: t.status || "Active",
        rentDueDay: t.rentDueDay || 5,
        electricityBill: t.electricityBill || 0,
        waterBill: t.waterBill || 0,
        penaltyAmount: t.penaltyAmount || 0,
      }).onConflictDoNothing();
    }
  }
  // Restore payments
  if (data.payments?.length) {
    for (const pay of data.payments) {
      await db.insert(payments).values({
        id: pay.id,
        tenantId: pay.tenantId || null,
        plotName: pay.plotName || "",
        houseNo: pay.houseNo || "",
        tenantName: pay.tenantName || "",
        phone: pay.phone || "",
        amount: pay.amount || 0,
        forMonth: pay.forMonth,
        channel: pay.channel || "M-Pesa Paybill",
        txnCode: pay.txnCode || "",
        receiptCode: pay.receiptCode,
        paymentDate: pay.paymentDate,
        notes: pay.notes || "",
      }).onConflictDoNothing();
    }
  }
  if (data.settings) {
    const existing = await db.select().from(settings).where(eq(settings.id, 1));
    if (existing.length) {
      await db.update(settings).set({
        agencyName: data.settings.agencyName,
        managerName: data.settings.managerName,
        phone: data.settings.phone,
        location: data.settings.location,
        messageTemplate: data.settings.messageTemplate || "",
      }).where(eq(settings.id, 1));
    } else {
      await db.insert(settings).values({ id: 1, agencyName: data.settings.agencyName, managerName: data.settings.managerName, phone: data.settings.phone, location: data.settings.location, messageTemplate: data.settings.messageTemplate || "" });
    }
  }
  return NextResponse.json({ ok: true, restored: { plots: data.plots?.length || 0, tenants: data.tenants?.length || 0, payments: data.payments?.length || 0 } });
}

export async function DELETE() {
  await db.delete(payments);
  await db.delete(tenants);
  await db.delete(plots);
  return NextResponse.json({ ok: true });
}
