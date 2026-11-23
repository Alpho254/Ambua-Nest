import { db } from "@/db";
import { tenants, payments } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";

function toCSV(headers: string[], rows: any[][]) {
  const esc = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "payments";
  const date = new Date().toISOString().slice(0, 10);

  if (type === "payments") {
    const rows = await db.select().from(payments).orderBy(payments.paymentDate);
    const csv = toCSV(
      ["Receipt Code", "Payment Date", "For Month", "Plot", "House No", "Tenant Name", "Phone", "Amount (KSh)", "Channel", "Transaction Code", "Notes"],
      rows.map(r => [r.receiptCode, r.paymentDate, r.forMonth, r.plotName, r.houseNo, r.tenantName, r.phone, r.amount, r.channel, r.txnCode, r.notes])
    );
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="ambua-nest-payments-${date}.csv"` },
    });
  }

  if (type === "tenants") {
    const rows = await db.select().from(tenants).orderBy(tenants.plotName, tenants.houseNo);
    const csv = toCSV(
      ["Plot", "House No", "Tenant Name", "Phone", "Monthly Rent (KSh)", "Rent Due Day", "Electricity Bill (KSh)", "Water Bill (KSh)", "Penalty (KSh)", "Total Monthly Due (KSh)", "Security Deposit (KSh)", "Move-In Date", "Status"],
      rows.map(r => [r.plotName, r.houseNo, r.fullName, r.phone, r.monthlyRent, r.rentDueDay, r.electricityBill, r.waterBill, r.penaltyAmount, (r.monthlyRent || 0) + (r.electricityBill || 0) + (r.waterBill || 0), r.securityDeposit, r.moveInDate, r.status])
    );
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="ambua-nest-tenants-${date}.csv"` },
    });
  }

  if (type === "summary") {
    const [t, p] = await Promise.all([db.select().from(tenants), db.select().from(payments)]);
    const byPlot: Record<string, { expected: number; collected: number; units: number }> = {};
    t.filter(x => x.status === "Active").forEach(x => {
      if (!byPlot[x.plotName]) byPlot[x.plotName] = { expected: 0, collected: 0, units: 0 };
      byPlot[x.plotName].expected += (x.monthlyRent || 0) + (x.electricityBill || 0) + (x.waterBill || 0);
      byPlot[x.plotName].units += 1;
    });
    p.forEach(x => {
      if (!byPlot[x.plotName]) byPlot[x.plotName] = { expected: 0, collected: 0, units: 0 };
      byPlot[x.plotName].collected += x.amount;
    });
    const csv = toCSV(
      ["Plot", "Active Units", "Expected Monthly Rent", "Total Collected All Time", "Balance (Expected - Collected)"],
      Object.entries(byPlot).map(([plot, v]) => [plot, v.units, v.expected, v.collected, Math.max(0, v.expected - v.collected)])
    );
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="ambua-nest-plot-summary-${date}.csv"` },
    });
  }

  return NextResponse.json({ error: "type must be payments|tenants|summary" }, { status: 400 });
}
