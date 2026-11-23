import { pgTable, uuid, text, integer, timestamp, date } from "drizzle-orm/pg-core";

export const plots = pgTable("plots", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  location: text("location").default("Eldoret"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  plotId: uuid("plot_id").references(() => plots.id, { onDelete: "set null" }),
  plotName: text("plot_name").notNull(),
  houseNo: text("house_no").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().default(""),
  monthlyRent: integer("monthly_rent").notNull().default(0),
  securityDeposit: integer("security_deposit").notNull().default(0),
  moveInDate: text("move_in_date").default(""),
  status: text("status").notNull().default("Active"),
  rentDueDay: integer("rent_due_day").notNull().default(5),
  electricityBill: integer("electricity_bill").notNull().default(0),
  waterBill: integer("water_bill").notNull().default(0),
  penaltyAmount: integer("penalty_amount").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  plotName: text("plot_name").notNull().default(""),
  houseNo: text("house_no").notNull().default(""),
  tenantName: text("tenant_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  amount: integer("amount").notNull().default(0),
  forMonth: text("for_month").notNull(),
  channel: text("channel").notNull().default("M-Pesa Paybill"),
  txnCode: text("txn_code").default(""),
  receiptCode: text("receipt_code").notNull().unique(),
  paymentDate: text("payment_date").notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  agencyName: text("agency_name").notNull().default("Ambua Nest Realty Property Management"),
  managerName: text("manager_name").notNull().default("Beavon Atambo"),
  phone: text("phone").notNull().default("0722712935"),
  location: text("location").notNull().default("Eldoret House Finder"),
  messageTemplate: text("message_template").default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Plot = typeof plots.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Setting = typeof settings.$inferSelect;
