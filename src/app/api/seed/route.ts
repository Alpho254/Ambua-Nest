import { db } from "@/db";
import { plots, tenants, payments } from "@/db/schema";
import { NextResponse } from "next/server";

export async function POST() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const currentMonth = `${yyyy}-${mm}`;
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const demoPlots = [
    { name: "Ambua Heights - Block A", location: "Eldoret CBD" },
    { name: "Ambua Heights - Block B", location: "Eldoret CBD" },
    { name: "Nest Gardens - Phase 1", location: "Kipkorgot" },
    { name: "Nest Gardens - Phase 2", location: "Kipkorgot" },
    { name: "Riverside Court", location: "Riverside" },
  ];

  const { eq } = await import("drizzle-orm");
  const plotMap: Record<string, string> = {};
  for (const p of demoPlots) {
    const [row] = await db.insert(plots).values(p).onConflictDoNothing().returning();
    if (row) plotMap[p.name] = row.id;
    else {
      const found = await db.select().from(plots).where(eq(plots.name, p.name));
      if (found.length) plotMap[p.name] = found[0].id;
    }
  }

  const demoTenants = [
    { plotName: "Ambua Heights - Block A", houseNo: "A1", fullName: "Wanjiku Muthoni", phone: "0712345678", monthlyRent: 25000, securityDeposit: 25000, moveInDate: "2024-01-15", status: "Active", rentDueDay: 5, electricityBill: 1500, waterBill: 800, penaltyAmount: 2000 },
    { plotName: "Ambua Heights - Block A", houseNo: "A2", fullName: "Brian Kiprop", phone: "0723456789", monthlyRent: 25000, securityDeposit: 25000, moveInDate: "2024-02-01", status: "Active", rentDueDay: 10, electricityBill: 1200, waterBill: 700, penaltyAmount: 2000 },
    { plotName: "Ambua Heights - Block A", houseNo: "A3", fullName: "Achieng Otieno", phone: "0734567890", monthlyRent: 28000, securityDeposit: 28000, moveInDate: "2024-03-10", status: "Active", rentDueDay: 15, electricityBill: 1800, waterBill: 900, penaltyAmount: 2500 },
    { plotName: "Ambua Heights - Block B", houseNo: "B1", fullName: "Chebet Korir", phone: "0745678901", monthlyRent: 30000, securityDeposit: 30000, moveInDate: "2024-01-20", status: "Active", rentDueDay: 3, electricityBill: 2000, waterBill: 1000, penaltyAmount: 3000 },
    { plotName: "Ambua Heights - Block B", houseNo: "B2", fullName: "David Mwangi", phone: "0756789012", monthlyRent: 30000, securityDeposit: 30000, moveInDate: "2024-04-05", status: "Active", rentDueDay: 20, electricityBill: 1600, waterBill: 850, penaltyAmount: 3000 },
    { plotName: "Nest Gardens - Phase 1", houseNo: "G1", fullName: "Faith Njeri", phone: "0767890123", monthlyRent: 18000, securityDeposit: 18000, moveInDate: "2024-05-12", status: "Active", rentDueDay: 7, electricityBill: 1000, waterBill: 600, penaltyAmount: 1500 },
    { plotName: "Nest Gardens - Phase 1", houseNo: "G2", fullName: "George Kimani", phone: "0778901234", monthlyRent: 18000, securityDeposit: 18000, moveInDate: "2024-06-01", status: "Active", rentDueDay: 12, electricityBill: 1100, waterBill: 650, penaltyAmount: 1500 },
    { plotName: "Nest Gardens - Phase 2", houseNo: "H1", fullName: "Hellen Auma", phone: "0789012345", monthlyRent: 22000, securityDeposit: 22000, moveInDate: "2024-07-18", status: "Active", rentDueDay: 8, electricityBill: 1400, waterBill: 750, penaltyAmount: 2000 },
    { plotName: "Riverside Court", houseNo: "R1", fullName: "Ibrahim Hassan", phone: "0790123456", monthlyRent: 35000, securityDeposit: 35000, moveInDate: "2024-08-22", status: "Active", rentDueDay: 1, electricityBill: 2500, waterBill: 1200, penaltyAmount: 3500 },
    { plotName: "Riverside Court", houseNo: "R2", fullName: "Jane Wambui", phone: "0701234567", monthlyRent: 35000, securityDeposit: 35000, moveInDate: "2024-09-03", status: "Vacated", rentDueDay: 5, electricityBill: 0, waterBill: 0, penaltyAmount: 0 },
  ];

  const tenantIds: Record<string, string> = {};
  for (const t of demoTenants) {
    const [row] = await db.insert(tenants).values({ ...t, plotId: plotMap[t.plotName] || null }).returning();
    tenantIds[`${t.plotName}-${t.houseNo}`] = row.id;
  }

  const demoPayments = [
    { key: "Ambua Heights - Block A-A1", amount: 25000, forMonth: currentMonth, channel: "M-Pesa Paybill", txnCode: "QK7X9P2M4N", paymentDate: `${currentMonth}-05`, notes: "Rent paid on time" },
    { key: "Ambua Heights - Block A-A2", amount: 15000, forMonth: currentMonth, channel: "M-Pesa Till", txnCode: "QK8Y1R3P5Q", paymentDate: `${currentMonth}-07`, notes: "Partial payment" },
    { key: "Ambua Heights - Block B-B1", amount: 30000, forMonth: currentMonth, channel: "M-Pesa Paybill", txnCode: "QK9Z2S4T6U", paymentDate: `${currentMonth}-03`, notes: "" },
    { key: "Nest Gardens - Phase 1-G1", amount: 18000, forMonth: currentMonth, channel: "Cash", txnCode: "", paymentDate: `${currentMonth}-08`, notes: "Cash receipt" },
    { key: "Ambua Heights - Block A-A1", amount: 25000, forMonth: prevMonth, channel: "M-Pesa Paybill", txnCode: "QJ5W8E1R9T", paymentDate: `${prevMonth}-04`, notes: "" },
    { key: "Ambua Heights - Block A-A3", amount: 28000, forMonth: prevMonth, channel: "Bank", txnCode: "BNK2024A3", paymentDate: `${prevMonth}-06`, notes: "Bank transfer" },
    { key: "Riverside Court-R1", amount: 35000, forMonth: currentMonth, channel: "M-Pesa Send Money", txnCode: "QK2M5N7B9V", paymentDate: `${currentMonth}-02`, notes: "" },
  ];

  let count = 0;
  for (const p of demoPayments) {
    const tenant = demoTenants.find(t => `${t.plotName}-${t.houseNo}` === p.key);
    if (!tenant) continue;
    const receipt = `ANR-${yyyy}-${String(1000 + count + 1)}`;
    await db.insert(payments).values({
      tenantId: tenantIds[p.key] || null,
      plotName: tenant.plotName,
      houseNo: tenant.houseNo,
      tenantName: tenant.fullName,
      phone: tenant.phone,
      amount: p.amount,
      forMonth: p.forMonth,
      channel: p.channel,
      txnCode: p.txnCode,
      receiptCode: receipt,
      paymentDate: p.paymentDate,
      notes: p.notes,
    }).onConflictDoNothing();
    count++;
  }

  return NextResponse.json({ ok: true, plots: demoPlots.length, tenants: demoTenants.length, payments: demoPayments.length });
}
