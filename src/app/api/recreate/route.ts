import { db } from "@/db";
import { plots, tenants, payments } from "@/db/schema";
import { NextResponse } from "next/server";

export async function POST() {
  // Wipe everything
  await db.delete(payments);
  await db.delete(tenants);
  await db.delete(plots);

  const plotDefs = [
    { name: "Benom Kokwas", location: "Eldoret", count: 11, rentBase: 20000 },
    { name: "Benom Suffron", location: "Eldoret", count: 12, rentBase: 25000 },
    { name: "Benom Kisumu Ndogo", location: "Eldoret", count: 19, rentBase: 15000 },
  ];

  const names = [
    "Wanjiku Muthoni", "Brian Kiprop", "Achieng Otieno", "Chebet Korir", "David Mwangi",
    "Faith Njeri", "George Kimani", "Hellen Auma", "Ibrahim Hassan", "Jane Wambui",
    "Kevin Omondi", "Lucy Chepngeno", "Michael Kariuki", "Nancy Moraa", "Peter Njoroge",
    "Rose Atieno", "Samuel Kipkoech", "Teresa Wanjiru", "Victor Maina", "Winnie Achieng",
    "Yvonne Kerubo", "Zachariah Mutua", "Alice Nyambura", "Bernard Kiptoo", "Catherine Wambui",
    "Daniel Ochieng", "Esther Njoki", "Francis Kiprop", "Grace Chebet", "Henry Otieno",
    "Irene Nyakundi", "James Mwangi", "Joyce Kerubo", "Kelvin Kipkorir", "Lydia Moraa",
    "Martin Kariuki", "Mary Wanjiku", "Nicholas Omondi", "Olivia Chepngeno", "Paul Njoroge",
    "Queen Atieno", "Robert Kipkoech",
  ];

  let nameIdx = 0;
  const createdPlots: any[] = [];
  const createdTenants: any[] = [];

  for (const pd of plotDefs) {
    const [plot] = await db.insert(plots).values({ name: pd.name, location: pd.location }).returning();
    createdPlots.push(plot);

    for (let i = 1; i <= pd.count; i++) {
      const name = names[nameIdx % names.length];
      nameIdx++;
      // Vary rent slightly per unit
      const rent = pd.rentBase + ((i % 4) * 1000); // e.g. base, +1000, +2000, +3000 cycle
      const electricity = 800 + ((i * 137) % 1200); // 800-2000
      const water = 500 + ((i * 89) % 500); // 500-1000
      const penalty = 1500 + ((i * 211) % 1500); // 1500-3000
      const dueDay = ((i * 3) % 28) + 1; // 1-28 varied
      const phone = `07${String(10000000 + nameIdx * 137 + i * 91).slice(-8)}`;
      // Move-in dates spread 2024-2025
      const year = 2024 + (i % 2);
      const month = String(((i * 2) % 12) + 1).padStart(2, "0");
      const day = String(((i * 3) % 27) + 1).padStart(2, "0");

      const [tenant] = await db.insert(tenants).values({
        plotId: plot.id,
        plotName: pd.name,
        houseNo: String(i),
        fullName: name,
        phone,
        monthlyRent: rent,
        securityDeposit: rent,
        moveInDate: `${year}-${month}-${day}`,
        status: "Active",
        rentDueDay: dueDay,
        electricityBill: electricity,
        waterBill: water,
        penaltyAmount: penalty,
      }).returning();
      createdTenants.push(tenant);
    }
  }

  return NextResponse.json({
    ok: true,
    plots: createdPlots.map(p => ({ name: p.name, id: p.id })),
    totalPlots: createdPlots.length,
    totalTenants: createdTenants.length,
    breakdown: plotDefs.map(d => ({ plot: d.name, units: d.count })),
  });
}
