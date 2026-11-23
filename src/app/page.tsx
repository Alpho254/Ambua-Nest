"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ---------- Types ---------- */
type Plot = { id: string; name: string; location?: string };
type Tenant = {
  id: string;
  plotId: string | null;
  plotName: string;
  houseNo: string;
  fullName: string;
  phone: string;
  monthlyRent: number;
  securityDeposit: number;
  moveInDate: string;
  status: string;
  rentDueDay?: number;
  electricityBill?: number;
  waterBill?: number;
  penaltyAmount?: number;
};
type Payment = {
  id: string;
  tenantId: string | null;
  plotName: string;
  houseNo: string;
  tenantName: string;
  phone: string;
  amount: number;
  forMonth: string;
  channel: string;
  txnCode: string;
  receiptCode: string;
  paymentDate: string;
  notes: string;
};
type Settings = { agencyName: string; managerName: string; phone: string; location: string; messageTemplate?: string };

const DEFAULT_TEMPLATE = `Hello {tenantName}, thank you for your rent payment! 🏠

✅ FULL PAYMENT RECEIVED
Agency: {agencyName}
Plot: {plotName} • House: {houseNo}
Month: {monthLabel}
Rent: {rent} | Electricity: {electricity} | Water: {water} | Penalty: {penalty}
Total Due: {totalDue}
Amount Paid: {amountPaid}
Balance: {balance} — Fully Paid 🎉
Receipt: {receiptCode}
Date: {paymentDate}

Thank you for being a valued tenant!
— {managerName} • {phone} • {location}`;

type Tab = "overview" | "tenants" | "payments" | "plots" | "backup";

const LS_TENANTS = "ambua_nest_realty_tenants_v2";
const LS_PAYMENTS = "ambua_nest_realty_payments_v2";
const LS_PLOTS = "ambua_nest_realty_plots_v2";
const LS_AGENCY = "ambua_nest_realty_agency_v2";
const LS_PENDING = "ambua_nest_pending_v2";

const CHANNELS = ["M-Pesa Paybill", "M-Pesa Till", "M-Pesa Send Money", "Cash", "Bank"];

function fmt(n: number) {
  return `KSh ${Number(n || 0).toLocaleString("en-KE")}`;
}
function monthLabel(ym: string) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(m) - 1] || m} ${y}`;
}
function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function genReceipt() {
  return `ANR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function two(n: number): string {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  }
  function three(n: number): string {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h ? ones[h] + " Hundred" + (r ? " " : "") : "") + (r ? two(r) : "");
  }
  if (num === 0) return "Zero";
  let out = "";
  const cr = Math.floor(num / 10000000);
  const lk = Math.floor((num % 10000000) / 100000);
  const th = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  if (cr) out += three(cr) + " Crore ";
  if (lk) out += two(lk) + " Lakh ";
  if (th) out += two(th) + " Thousand ";
  if (rest) out += three(rest);
  return out.trim() + " Kenya Shillings Only";
}
function last9(phone: string) {
  const d = (phone || "").replace(/\D/g, "");
  return d.slice(-9);
}

export default function Home() {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<Settings>({
    agencyName: "Ambua Nest Realty Property Management",
    managerName: "Beavon Atambo",
    phone: "0722712935",
    location: "Eldoret House Finder",
    messageTemplate: DEFAULT_TEMPLATE,
  });

  const [plotFilter, setPlotFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>(currentYM());
  const [tenantSearch, setTenantSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<any[]>([]);
  const [toast, setToast] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Tenant form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tForm, setTForm] = useState({ plotName: "", houseNo: "", fullName: "", phone: "", monthlyRent: "", securityDeposit: "", moveInDate: todayISO(), status: "Active", rentDueDay: "5", electricityBill: "", waterBill: "", penaltyAmount: "" });

  // Payment form
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [pForm, setPForm] = useState({ tenantId: "", forMonth: currentYM(), amount: "", channel: "M-Pesa Paybill", txnCode: "", receiptCode: genReceipt(), paymentDate: todayISO(), notes: "" });
  const [smsInput, setSmsInput] = useState("");
  const [parsed, setParsed] = useState<{ code: string; amount: string; phone: string; tenantId: string; tenantLabel: string } | null>(null);

  // Receipt modal
  const [receipt, setReceipt] = useState<Payment | null>(null);

  // Full-payment message modal
  const [msgTenant, setMsgTenant] = useState<Tenant | null>(null);
  const [msgPayment, setMsgPayment] = useState<Payment | null>(null);
  const [msgText, setMsgText] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");

  // Plot form
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [newPlot, setNewPlot] = useState({ name: "", location: "Eldoret" });
  const [showGuide, setShowGuide] = useState(true);

  // Settings form
  const [sForm, setSForm] = useState<Settings>(settings);

  const fileRef = useRef<HTMLInputElement>(null);

  /* ---------- Persistence helpers ---------- */
  function saveLS() {
    try {
      localStorage.setItem(LS_TENANTS, JSON.stringify(tenants));
      localStorage.setItem(LS_PAYMENTS, JSON.stringify(payments));
      localStorage.setItem(LS_PLOTS, JSON.stringify(plots));
      localStorage.setItem(LS_AGENCY, JSON.stringify(settings));
      localStorage.setItem(LS_PENDING, JSON.stringify(pending));
    } catch {}
  }

  useEffect(() => { saveLS(); }, [tenants, payments, plots, settings, pending]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const [pr, tr, payr, sr] = await Promise.all([
        fetch("/api/plots"),
        fetch("/api/tenants"),
        fetch("/api/payments"),
        fetch("/api/settings"),
      ]);
      if (pr.ok) setPlots(await pr.json());
      if (tr.ok) setTenants(await tr.json());
      if (payr.ok) setPayments(await payr.json());
      if (sr.ok) {
        const s = await sr.json();
        const mapped = { agencyName: s.agencyName, managerName: s.managerName, phone: s.phone, location: s.location, messageTemplate: s.messageTemplate || DEFAULT_TEMPLATE };
        setSettings(mapped);
        setSForm(mapped);
      }
      setOnline(true);
    } catch {
      setOnline(false);
      // load from LS
      try {
        const lt = localStorage.getItem(LS_TENANTS);
        const lp = localStorage.getItem(LS_PAYMENTS);
        const lpl = localStorage.getItem(LS_PLOTS);
        const la = localStorage.getItem(LS_AGENCY);
        const lpend = localStorage.getItem(LS_PENDING);
        if (lt) setTenants(JSON.parse(lt));
        if (lp) setPayments(JSON.parse(lp));
        if (lpl) setPlots(JSON.parse(lpl));
        if (la) { const a = JSON.parse(la); setSettings(a); setSForm(a); }
        if (lpend) setPending(JSON.parse(lpend));
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // instant load from LS
    try {
      const lt = localStorage.getItem(LS_TENANTS);
      const lp = localStorage.getItem(LS_PAYMENTS);
      const lpl = localStorage.getItem(LS_PLOTS);
      const la = localStorage.getItem(LS_AGENCY);
      const lpend = localStorage.getItem(LS_PENDING);
      if (lt) setTenants(JSON.parse(lt));
      if (lp) setPayments(JSON.parse(lp));
      if (lpl) setPlots(JSON.parse(lpl));
      if (la) { const a = JSON.parse(la); setSettings(a); setSForm(a); }
      if (lpend) setPending(JSON.parse(lpend));
    } catch {}
    fetchAll();

    const onOnline = () => { setOnline(true); syncPending(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  async function syncPending() {
    if (!pending.length) return;
    setSyncing(true);
    const remaining: any[] = [];
    for (const item of pending) {
      try {
        if (item.type === "createTenant") await fetch("/api/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) });
        else if (item.type === "updateTenant") await fetch("/api/tenants", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) });
        else if (item.type === "createPayment") await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) });
        else if (item.type === "updatePayment") await fetch("/api/payments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) });
        else if (item.type === "deleteTenant") await fetch(`/api/tenants?id=${item.payload}`, { method: "DELETE" });
        else if (item.type === "deletePayment") await fetch(`/api/payments?id=${item.payload}`, { method: "DELETE" });
      } catch { remaining.push(item); }
    }
    setPending(remaining);
    setSyncing(false);
    if (!remaining.length) { showToast("Offline changes synced successfully"); fetchAll(); }
  }

  /* ---------- Derived data ---------- */
  const uniquePlots = useMemo(() => {
    const set = new Map<string, string>();
    plots.forEach(p => set.set(p.name, p.id));
    tenants.forEach(t => { if (!set.has(t.plotName)) set.set(t.plotName, ""); });
    return Array.from(set.keys()).sort();
  }, [plots, tenants]);

  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      if (plotFilter !== "all" && t.plotName !== plotFilter) return false;
      if (t.status !== "Active" && statusFilter === "active") return false;
      return true;
    });
  }, [tenants, plotFilter]);

  const activeTenants = useMemo(() => tenants.filter(t => t.status === "Active" && (plotFilter === "all" || t.plotName === plotFilter)), [tenants, plotFilter]);

  function paidForTenant(tenantId: string, month: string) {
    return payments.filter(p => p.tenantId === tenantId && p.forMonth === month).reduce((s, p) => s + p.amount, 0);
  }
  function paidForTenantAll(tenantId: string) {
    return payments.filter(p => p.tenantId === tenantId).reduce((s, p) => s + p.amount, 0);
  }

  /* ----- Billing helpers: due dates, electricity, water, penalty ----- */
  function tenantBaseDue(t: Tenant) {
    return (t.monthlyRent || 0) + (t.electricityBill || 0) + (t.waterBill || 0);
  }
  function getDueDate(t: Tenant, monthYM: string): Date {
    const [y, m] = monthYM.split("-").map(Number);
    const day = Math.min(28, Math.max(1, t.rentDueDay || 5));
    return new Date(y, m - 1, day);
  }
  function dueDateLabel(t: Tenant, monthYM: string) {
    const d = getDueDate(t, monthYM);
    return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  }
  function isPastDue(t: Tenant, monthYM: string): boolean {
    const due = getDueDate(t, monthYM);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const curYM = currentYM();
    if (monthYM < curYM) return true;
    if (monthYM > curYM) return false;
    return today > due;
  }
  function penaltyFor(t: Tenant, monthYM: string, paid: number): number {
    if (!isPastDue(t, monthYM)) return 0;
    const base = tenantBaseDue(t);
    if (paid >= base) return 0;
    return t.penaltyAmount || 0;
  }
  function tenantTotalDue(t: Tenant, monthYM: string, paid?: number): number {
    const p = paid ?? paidForTenant(t.id, monthYM);
    return tenantBaseDue(t) + penaltyFor(t, monthYM, p);
  }
  function tenantBalance(t: Tenant, monthYM: string, paid?: number): number {
    const p = paid ?? paidForTenant(t.id, monthYM);
    return Math.max(0, tenantTotalDue(t, monthYM, p) - p);
  }
  function tenantRentStatus(t: Tenant): "Paid" | "Partial" | "Unpaid" | "Overpaid" {
    const paid = paidForTenant(t.id, monthFilter);
    const total = tenantTotalDue(t, monthFilter, paid);
    if (paid === 0) return "Unpaid";
    if (paid < total) return "Partial";
    if (paid === total) return "Paid";
    return "Overpaid";
  }

  const kpis = useMemo(() => {
    const active = activeTenants;
    const expected = active.reduce((s, t) => s + tenantTotalDue(t, monthFilter), 0);
    const rentOnly = active.reduce((s, t) => s + t.monthlyRent, 0);
    const billsTotal = active.reduce((s, t) => s + (t.electricityBill || 0) + (t.waterBill || 0), 0);
    const penaltiesTotal = active.reduce((s, t) => s + penaltyFor(t, monthFilter, paidForTenant(t.id, monthFilter)), 0);
    const collectedMonth = payments.filter(p => p.forMonth === monthFilter && (plotFilter === "all" || p.plotName === plotFilter)).reduce((s, p) => s + p.amount, 0);
    const balance = active.reduce((s, t) => s + tenantBalance(t, monthFilter), 0);
    const overdue = active.filter(t => {
      const paid = paidForTenant(t.id, monthFilter);
      return isPastDue(t, monthFilter) && paid < tenantTotalDue(t, monthFilter, paid);
    }).length;
    const totalAll = payments.filter(p => plotFilter === "all" || p.plotName === plotFilter).reduce((s, p) => s + p.amount, 0);
    const txnCount = payments.filter(p => p.forMonth === monthFilter && (plotFilter === "all" || p.plotName === plotFilter)).length;
    const occupancy = tenants.length ? Math.round((tenants.filter(t => t.status === "Active").length / tenants.length) * 100) : 0;
    const collectionRate = expected ? Math.round((collectedMonth / expected) * 100) : 0;
    return { activeCount: active.length, totalPlots: uniquePlots.length, expected, rentOnly, billsTotal, penaltiesTotal, collectedMonth, balance, overdue, totalAll, txnCount, occupancy, collectionRate };
  }, [activeTenants, payments, monthFilter, plotFilter, uniquePlots, tenants]);

  const plotStats = useMemo(() => {
    const map: Record<string, { plot: string; units: number; active: number; expected: number; collected: number; balance: number; rate: number }> = {};
    uniquePlots.forEach(name => { map[name] = { plot: name, units: 0, active: 0, expected: 0, collected: 0, balance: 0, rate: 0 }; });
    tenants.forEach(t => {
      if (!map[t.plotName]) map[t.plotName] = { plot: t.plotName, units: 0, active: 0, expected: 0, collected: 0, balance: 0, rate: 0 };
      map[t.plotName].units++;
      if (t.status === "Active") { map[t.plotName].active++; map[t.plotName].expected += tenantTotalDue(t, monthFilter); }
    });
    payments.filter(p => p.forMonth === monthFilter).forEach(p => {
      if (!map[p.plotName]) map[p.plotName] = { plot: p.plotName, units: 0, active: 0, expected: 0, collected: 0, balance: 0, rate: 0 };
      map[p.plotName].collected += p.amount;
    });
    Object.values(map).forEach(v => {
      v.balance = Math.max(0, v.expected - v.collected);
      v.rate = v.expected ? Math.round((v.collected / v.expected) * 100) : 0;
    });
    return Object.values(map).sort((a, b) => b.expected - a.expected);
  }, [uniquePlots, tenants, payments, monthFilter]);

  const last6 = useMemo(() => {
    const arr: { label: string; ym: string; total: number; expected: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const total = payments.filter(p => p.forMonth === ym && (plotFilter === "all" || p.plotName === plotFilter)).reduce((s, p) => s + p.amount, 0);
      const expected = tenants.filter(t => t.status === "Active" && (plotFilter === "all" || t.plotName === plotFilter)).reduce((s, t) => s + tenantTotalDue(t, ym), 0);
      arr.push({ label: monthLabel(ym), ym, total, expected });
    }
    return arr;
  }, [payments, tenants, plotFilter]);

  const statusBreakdown = useMemo(() => {
    const counts = { Paid: 0, Partial: 0, Unpaid: 0, Overpaid: 0 };
    activeTenants.forEach(t => { counts[tenantRentStatus(t)]++; });
    return counts;
  }, [activeTenants, payments, monthFilter]);

  const displayedTenants = useMemo(() => {
    let list = [...filteredTenants];
    if (tenantSearch.trim()) {
      const q = tenantSearch.toLowerCase();
      list = list.filter(t => t.plotName.toLowerCase().includes(q) || t.houseNo.toLowerCase().includes(q) || t.fullName.toLowerCase().includes(q) || t.phone.includes(q));
    }
    if (statusFilter !== "all" && statusFilter !== "active") {
      list = list.filter(t => tenantRentStatus(t) === statusFilter);
    }
    return list.sort((a, b) => a.plotName.localeCompare(b.plotName) || a.houseNo.localeCompare(b.houseNo));
  }, [filteredTenants, tenantSearch, statusFilter, payments, monthFilter]);

  const displayedPayments = useMemo(() => {
    let list = [...payments];
    if (plotFilter !== "all") list = list.filter(p => p.plotName === plotFilter);
    if (paymentSearch.trim()) {
      const q = paymentSearch.toLowerCase();
      list = list.filter(p => p.tenantName.toLowerCase().includes(q) || p.plotName.toLowerCase().includes(q) || p.houseNo.toLowerCase().includes(q) || p.receiptCode.toLowerCase().includes(q) || p.txnCode.toLowerCase().includes(q) || p.phone.includes(q));
    }
    return list.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [payments, plotFilter, paymentSearch]);

  const overdueList = useMemo(() => {
    return activeTenants.filter(t => {
      const paid = paidForTenant(t.id, monthFilter);
      return isPastDue(t, monthFilter) && paid < tenantTotalDue(t, monthFilter, paid);
    })
      .map(t => {
        const paid = paidForTenant(t.id, monthFilter);
        const total = tenantTotalDue(t, monthFilter, paid);
        const penalty = penaltyFor(t, monthFilter, paid);
        const due = getDueDate(t, monthFilter);
        const daysOverdue = Math.max(0, Math.floor((new Date().getTime() - due.getTime()) / 86400000));
        return { tenant: t, paid, balance: Math.max(0, total - paid), total, penalty, dueLabel: dueDateLabel(t, monthFilter), daysOverdue };
      })
      .sort((a, b) => b.balance - a.balance);
  }, [activeTenants, payments, monthFilter]);

  /* ---------- Actions ---------- */
  async function handleTenantSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tForm.plotName.trim() || !tForm.houseNo.trim() || !tForm.fullName.trim()) { showToast("Plot, House No and Full Name are required"); return; }
    const payload = {
      plotName: tForm.plotName.trim(),
      houseNo: tForm.houseNo.trim(),
      fullName: tForm.fullName.trim(),
      phone: tForm.phone.trim(),
      monthlyRent: Number(tForm.monthlyRent) || 0,
      securityDeposit: Number(tForm.securityDeposit) || 0,
      moveInDate: tForm.moveInDate,
      status: tForm.status,
      rentDueDay: Number(tForm.rentDueDay) || 5,
      electricityBill: Number(tForm.electricityBill) || 0,
      waterBill: Number(tForm.waterBill) || 0,
      penaltyAmount: Number(tForm.penaltyAmount) || 0,
    };
    if (!online) {
      // offline queue
      if (editingId) {
        setTenants(prev => prev.map(t => t.id === editingId ? { ...t, ...payload, id: editingId } : t));
        setPending(prev => [...prev, { type: "updateTenant", payload: { id: editingId, ...payload } }]);
      } else {
        const temp: Tenant = { id: `temp-${Date.now()}`, plotId: null, ...payload };
        setTenants(prev => [...prev, temp]);
        setPending(prev => [...prev, { type: "createTenant", payload }]);
      }
      showToast("Saved offline — will sync when online");
      resetTenantForm();
      return;
    }
    try {
      if (editingId) {
        const res = await fetch("/api/tenants", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, ...payload }) });
        if (!res.ok) throw new Error(await res.text());
        const updated = await res.json();
        setTenants(prev => prev.map(t => t.id === editingId ? updated : t));
        showToast("Tenant updated");
      } else {
        const res = await fetch("/api/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        setTenants(prev => [...prev, created]);
        showToast("Tenant added successfully");
      }
      fetchAll();
      resetTenantForm();
    } catch (err: any) {
      showToast("Failed to save tenant: " + err.message);
    }
  }

  function resetTenantForm() {
    setEditingId(null);
    setTForm({ plotName: "", houseNo: "", fullName: "", phone: "", monthlyRent: "", securityDeposit: "", moveInDate: todayISO(), status: "Active", rentDueDay: "5", electricityBill: "", waterBill: "", penaltyAmount: "" });
  }

  function editTenant(t: Tenant) {
    setEditingId(t.id);
    setTForm({ plotName: t.plotName, houseNo: t.houseNo, fullName: t.fullName, phone: t.phone, monthlyRent: String(t.monthlyRent), securityDeposit: String(t.securityDeposit), moveInDate: t.moveInDate || todayISO(), status: t.status, rentDueDay: String(t.rentDueDay || 5), electricityBill: String(t.electricityBill || ""), waterBill: String(t.waterBill || ""), penaltyAmount: String(t.penaltyAmount || "") });
    setActiveTab("tenants");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteTenant(id: string, name: string) {
    if (!confirm(`Delete tenant ${name}? Payment history will be kept in the ledger.`)) return;
    if (!online) {
      setTenants(prev => prev.filter(t => t.id !== id));
      setPending(prev => [...prev, { type: "deleteTenant", payload: id }]);
      showToast("Deleted offline — will sync");
      return;
    }
    await fetch(`/api/tenants?id=${id}`, { method: "DELETE" });
    setTenants(prev => prev.filter(t => t.id !== id));
    showToast("Tenant deleted (payment history kept)");
    fetchAll();
  }

  function resetPaymentForm() {
    setEditingPaymentId(null);
    setPForm({ tenantId: "", forMonth: currentYM(), amount: "", channel: "M-Pesa Paybill", txnCode: "", receiptCode: genReceipt(), paymentDate: todayISO(), notes: "" });
    setParsed(null);
  }

  function editPayment(p: Payment) {
    setEditingPaymentId(p.id);
    setPForm({ tenantId: p.tenantId || "", forMonth: p.forMonth, amount: String(p.amount), channel: p.channel, txnCode: p.txnCode, receiptCode: p.receiptCode, paymentDate: p.paymentDate, notes: p.notes });
    setActiveTab("payments");
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(`Editing payment ${p.receiptCode} — update and save`);
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pForm.tenantId) { showToast("Select a tenant/unit"); return; }
    const amount = Number(pForm.amount);
    if (!amount || amount <= 0) { showToast("Enter a valid amount"); return; }
    const txn = pForm.txnCode.trim();
    if (txn) {
      const dup = payments.find(p => p.txnCode.toLowerCase() === txn.toLowerCase() && p.id !== editingPaymentId);
      if (dup) { showToast(`Duplicate code ${txn} already used in receipt ${dup.receiptCode}`); return; }
    }
    const tenant = tenants.find(t => t.id === pForm.tenantId);
    if (!tenant) return;
    const payload = {
      tenantId: pForm.tenantId,
      plotName: tenant.plotName,
      houseNo: tenant.houseNo,
      tenantName: tenant.fullName,
      phone: tenant.phone,
      amount,
      forMonth: pForm.forMonth,
      channel: pForm.channel,
      txnCode: txn,
      receiptCode: pForm.receiptCode.trim() || genReceipt(),
      paymentDate: pForm.paymentDate,
      notes: pForm.notes,
    };
    if (!online) {
      if (editingPaymentId) {
        setPayments(prev => prev.map(x => x.id === editingPaymentId ? { ...x, ...payload, id: editingPaymentId } : x));
        setPending(prev => [...prev, { type: "updatePayment", payload: { id: editingPaymentId, ...payload } }]);
        showToast("Payment updated offline — will sync");
      } else {
        const temp: Payment = { id: `temp-${Date.now()}`, ...payload };
        setPayments(prev => [temp, ...prev]);
        setPending(prev => [...prev, { type: "createPayment", payload }]);
        showToast("Payment saved offline — will sync");
      }
      resetPaymentForm();
      return;
    }
    try {
      if (editingPaymentId) {
        const res = await fetch("/api/payments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingPaymentId, ...payload }) });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || "Failed to update payment"); return; }
        setPayments(prev => prev.map(x => x.id === editingPaymentId ? data : x));
        showToast(`Payment updated — Receipt ${data.receiptCode}`);
        resetPaymentForm();
        fetchAll();
        return;
      }
      const res = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to record payment"); return; }
      setPayments(prev => [data, ...prev]);
      // Check if this payment completes full payment → auto-open message generator
      const tenantForMsg = tenants.find(t => t.id === payload.tenantId);
      const paidAfter = payments.filter(p => p.tenantId === payload.tenantId && p.forMonth === payload.forMonth).reduce((s, p) => s + p.amount, 0) + payload.amount;
      const totalAfter = tenantForMsg ? tenantTotalDue(tenantForMsg, payload.forMonth, paidAfter) : 0;
      const isFull = tenantForMsg && paidAfter >= totalAfter && totalAfter > 0;
      if (isFull && tenantForMsg) {
        showToast(`🎉 Full payment! Receipt ${data.receiptCode} — generating client message...`);
        // Build temp tenant with updated paid context for message
        setTimeout(() => openFullPaymentMessage(tenantForMsg, data), 400);
      } else {
        showToast(`Payment recorded — Receipt ${data.receiptCode}`);
      }
      resetPaymentForm();
      fetchAll();
    } catch (err: any) {
      showToast("Error: " + err.message);
    }
  }

  async function deletePayment(id: string) {
    if (!confirm("Delete this payment record?")) return;
    if (!online) {
      setPayments(prev => prev.filter(p => p.id !== id));
      setPending(prev => [...prev, { type: "deletePayment", payload: id }]);
      showToast("Deleted offline");
      return;
    }
    await fetch(`/api/payments?id=${id}`, { method: "DELETE" });
    setPayments(prev => prev.filter(p => p.id !== id));
    showToast("Payment deleted");
    fetchAll();
  }

  function parseSms() {
    const text = smsInput;
    if (!text.trim()) { showToast("Paste an M-Pesa SMS first"); return; }
    // Code: 10-char alphanumeric at start or after "Code"
    let code = "";
    const codeMatch = text.match(/([A-Z0-9]{10})\s+Confirmed/i) || text.match(/Code[:\s]*([A-Z0-9]{8,12})/i) || text.match(/\b([A-Z0-9]{10})\b/);
    if (codeMatch) code = codeMatch[1].toUpperCase();
    // Amount
    let amount = "";
    const amtMatch = text.match(/KSh\s*([\d,]+\.?\d*)/i) || text.match(/KES\s*([\d,]+\.?\d*)/i) || text.match(/amount.*?([\d,]{2,})/i);
    if (amtMatch) amount = amtMatch[1].replace(/,/g, "").split(".")[0];
    // Phone: find all numbers, take last 9-digit match
    const phones = text.match(/(\+?254|0)\s?7\d{8}/g) || text.match(/\d{10,13}/g) || [];
    let phone = "";
    let matchedTenant: Tenant | undefined;
    for (const ph of phones) {
      const l9 = last9(ph);
      const found = tenants.find(t => last9(t.phone) === l9 && l9.length === 9);
      if (found) { matchedTenant = found; phone = found.phone; break; }
    }
    if (!phone && phones.length) phone = phones[phones.length - 1];
    // Date
    let payDate = todayISO();
    const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (dateMatch) {
      const parts = dateMatch[1].split("/");
      if (parts.length === 3) {
        const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        payDate = `${y}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
    const result = { code, amount, phone, tenantId: matchedTenant?.id || "", tenantLabel: matchedTenant ? `${matchedTenant.plotName} • ${matchedTenant.houseNo} • ${matchedTenant.fullName}` : "" };
    setParsed(result);
    setPForm(prev => ({ ...prev, txnCode: code, amount: amount || prev.amount, tenantId: matchedTenant?.id || prev.tenantId, paymentDate: payDate }));
    if (matchedTenant) showToast(`Matched tenant: ${matchedTenant.fullName}`);
    else showToast("Parsed SMS — select tenant manually if not matched");
  }

  function editPlot(p: Plot) {
    setEditingPlotId(p.id);
    setNewPlot({ name: p.name, location: p.location || "Eldoret" });
    setActiveTab("plots");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetPlotForm() {
    setEditingPlotId(null);
    setNewPlot({ name: "", location: "Eldoret" });
  }

  async function addPlot(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlot.name.trim()) return;
    if (!online) { showToast("Offline — plot will be added on sync"); return; }
    if (editingPlotId) {
      const res = await fetch("/api/plots", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingPlotId, ...newPlot }) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to update plot"); return; }
      setPlots(prev => prev.map(x => x.id === editingPlotId ? data : x));
      showToast("Plot updated — tenants & payments renamed automatically");
      resetPlotForm();
      fetchAll();
      return;
    }
    const res = await fetch("/api/plots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newPlot) });
    if (res.ok) { const p = await res.json(); setPlots(prev => [...prev, p]); setNewPlot({ name: "", location: "Eldoret" }); showToast("Plot added"); fetchAll(); }
  }

  async function deletePlot(id: string, name: string) {
    if (!confirm(`Delete plot "${name}"? Tenants in this plot will remain but lose plot link.`)) return;
    await fetch(`/api/plots?id=${id}`, { method: "DELETE" });
    setPlots(prev => prev.filter(p => p.id !== id));
    showToast("Plot deleted");
    fetchAll();
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettings(sForm);
    if (!online) { showToast("Settings saved offline"); return; }
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sForm) });
    showToast("Agency settings updated");
  }

  function exportJSON() {
    const data = { exportedAt: new Date().toISOString(), version: "ambua-nest-v3", plots, tenants, payments, settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ambua-nest-rent-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file: File) {
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!online) { showToast("Go online to restore backup"); return; }
      const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (res.ok) { showToast("Backup restored successfully"); fetchAll(); }
      else showToast("Restore failed");
    } catch { showToast("Invalid backup file"); }
  }

  function exportCSV(type: string) {
    if (!online) {
      // client-side CSV
      let csv = "";
      if (type === "payments") {
        csv = ["Receipt Code,Payment Date,For Month,Plot,House No,Tenant Name,Phone,Amount (KSh),Channel,Transaction Code,Notes", ...payments.map(p => [p.receiptCode, p.paymentDate, p.forMonth, `"${p.plotName}"`, p.houseNo, `"${p.tenantName}"`, p.phone, p.amount, p.channel, p.txnCode, `"${p.notes}"`].join(","))].join("\n");
      } else {
        csv = ["Plot,House No,Tenant Name,Phone,Monthly Rent,Rent Due Day,Electricity Bill,Water Bill,Penalty,Total Monthly Due,Security Deposit,Move-In Date,Status", ...tenants.map(t => [`"${t.plotName}"`, t.houseNo, `"${t.fullName}"`, t.phone, t.monthlyRent, t.rentDueDay || 5, t.electricityBill || 0, t.waterBill || 0, t.penaltyAmount || 0, (t.monthlyRent || 0) + (t.electricityBill || 0) + (t.waterBill || 0), t.securityDeposit, t.moveInDate, t.status].join(","))].join("\n");
      }
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ambua-nest-${type}-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(url);
      return;
    }
    window.open(`/api/export?type=${type}`, "_blank");
  }

  async function resetAll() {
    if (!confirm("This will delete ALL tenants, payments and plots. Continue?")) return;
    if (!online) { showToast("Go online to reset"); return; }
    await fetch("/api/backup", { method: "DELETE" });
    setTenants([]); setPayments([]); setPlots([]);
    showToast("All data cleared");
    fetchAll();
  }

  async function seedDemo() {
    if (!online) { showToast("Go online to load demo data"); return; }
    const res = await fetch("/api/seed", { method: "POST" });
    if (res.ok) { showToast("Demo data loaded"); fetchAll(); }
  }

  function copyWhatsApp(p: Payment) {
    const tenant = tenants.find(t => t.id === p.tenantId);
    const paidMonth = tenant ? paidForTenant(tenant.id, p.forMonth) : p.amount;
    const total = tenant ? tenantTotalDue(tenant, p.forMonth, paidMonth) : p.amount;
    const balance = Math.max(0, total - paidMonth);
    const msg = `*${settings.agencyName}*\nReceipt: ${p.receiptCode}\nDate: ${p.paymentDate}\nTenant: ${p.tenantName} (${p.houseNo}, ${p.plotName})\nFor Month: ${monthLabel(p.forMonth)}\nAmount Paid: ${fmt(p.amount)}\nChannel: ${p.channel}${p.txnCode ? `\nTxn Code: ${p.txnCode}` : ""}\nBalance for ${monthLabel(p.forMonth)}: ${fmt(balance)}\nThank you! — ${settings.managerName} (${settings.phone})`;
    navigator.clipboard.writeText(msg);
    showToast("WhatsApp receipt copied");
  }

  /* ---------- Full-payment messaging ---------- */
  function generateFullPaymentMessage(tenant: Tenant, payment?: Payment | null): string {
    const month = payment?.forMonth || monthFilter;
    const paid = paidForTenant(tenant.id, month);
    const total = tenantTotalDue(tenant, month, paid);
    const balance = Math.max(0, total - paid);
    const overpaid = Math.max(0, paid - total);
    const penalty = penaltyFor(tenant, month, paid);
    const latestPayment = payment || payments.filter(p => p.tenantId === tenant.id && p.forMonth === month).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0];
    const template = settings.messageTemplate || DEFAULT_TEMPLATE;
    const vars: Record<string, string> = {
      tenantName: tenant.fullName,
      agencyName: settings.agencyName,
      plotName: tenant.plotName,
      houseNo: tenant.houseNo,
      monthLabel: monthLabel(month),
      rent: fmt(tenant.monthlyRent),
      electricity: fmt(tenant.electricityBill || 0),
      water: fmt(tenant.waterBill || 0),
      penalty: fmt(penalty),
      totalDue: fmt(total),
      amountPaid: fmt(paid),
      balance: fmt(balance),
      receiptCode: latestPayment?.receiptCode || "—",
      paymentDate: latestPayment?.paymentDate || todayISO(),
      managerName: settings.managerName,
      phone: settings.phone,
      location: settings.location,
      txnCode: latestPayment?.txnCode || "",
      channel: latestPayment?.channel || "",
      dueDate: dueDateLabel(tenant, month),
      overpaid: overpaid > 0 ? ` (Overpaid by ${fmt(overpaid)} — will be credited)` : "",
    };
    let msg = template;
    Object.entries(vars).forEach(([k, v]) => { msg = msg.split(`{${k}}`).join(v); });
    msg = msg.split("{overpaid}").join(vars.overpaid);
    return msg;
  }

  function openFullPaymentMessage(tenant: Tenant, payment?: Payment | null) {
    const msg = generateFullPaymentMessage(tenant, payment);
    setMsgTenant(tenant);
    setMsgPayment(payment || null);
    setMsgText(msg);
  }

  function isFullyPaid(tenant: Tenant, month: string = monthFilter) {
    const paid = paidForTenant(tenant.id, month);
    return paid >= tenantTotalDue(tenant, month, paid) && tenantTotalDue(tenant, month, paid) > 0;
  }

  const fullyPaidList = useMemo(() => {
    return activeTenants.filter(t => isFullyPaid(t)).map(t => ({
      tenant: t,
      paid: paidForTenant(t.id, monthFilter),
      latest: payments.filter(p => p.tenantId === t.id && p.forMonth === monthFilter).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0],
    }));
  }, [activeTenants, payments, monthFilter]);

  function generateBulkMessages() {
    const all = fullyPaidList.map(({ tenant, latest }) => {
      const msg = generateFullPaymentMessage(tenant, latest);
      return `--- ${tenant.fullName} (${tenant.phone}) ---\n${msg}`;
    }).join("\n\n");
    setBulkMsg(all);
    navigator.clipboard.writeText(all);
    showToast(`Copied ${fullyPaidList.length} full-payment messages`);
  }

  function waLink(phone: string, text: string) {
    const clean = phone.replace(/\D/g, "").replace(/^0/, "254");
    return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
  }
  function smsLink(phone: string, text: string) {
    return `sms:${phone}?&body=${encodeURIComponent(text)}`;
  }

  const maxChart = Math.max(...last6.map(x => Math.max(x.total, x.expected)), 1);

  return (
    <div className="min-h-screen">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-[#0F3D2E] text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-2xl font-black text-[#0F3D2E] shrink-0">A</div>
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold leading-tight tracking-tight">{settings.agencyName}</h1>
                <p className="text-emerald-200 text-xs sm:text-sm mt-0.5">{settings.location} • Manager: {settings.managerName} • {settings.phone}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${online ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30" : "bg-amber-500/20 text-amber-200 border border-amber-400/30"}`}>
                    <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
                    {online ? "Online — Auto-sync ON" : "Offline Mode — Changes saved locally"}
                  </span>
                  {pending.length > 0 && (
                    <button onClick={syncPending} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white text-[#0F3D2E] hover:bg-amber-100">
                      {syncing ? "Syncing..." : `${pending.length} pending — Sync Now`}
                    </button>
                  )}
                  <span className="text-[11px] text-emerald-300/80 hidden sm:inline">Offline-ready • Data auto-saves to this device + cloud</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setActiveTab("tenants")} className="bg-amber-500 hover:bg-amber-400 text-[#0F3D2E] font-bold text-sm px-4 py-2.5 rounded-xl">+ Add Tenant</button>
              <button onClick={() => setActiveTab("payments")} className="bg-white hover:bg-emerald-50 text-[#0F3D2E] font-bold text-sm px-4 py-2.5 rounded-xl">Record Payment</button>
              <button onClick={() => setActiveTab("backup")} className="bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-4 py-2.5 rounded-xl border border-white/20">✏️ Edit Agency Info</button>
              <button onClick={fetchAll} className="bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-4 py-2.5 rounded-xl border border-white/20">↻ Refresh</button>
            </div>
          </div>

          {/* Filters bar */}
          <div className="mt-4 bg-white/10 backdrop-blur rounded-2xl p-3 flex flex-col md:flex-row gap-3 border border-white/10">
            <div className="flex-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Plot Filter</label>
              <select value={plotFilter} onChange={e => setPlotFilter(e.target.value)} className="mt-1 w-full bg-white text-slate-900 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none">
                <option value="all">All Plots ({uniquePlots.length})</option>
                {uniquePlots.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Billing Month</label>
              <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="mt-1 w-full bg-white text-slate-900 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <div className="text-xs text-emerald-100 leading-tight">
                <div className="font-bold text-white">{monthLabel(monthFilter)}</div>
                <div>{kpis.activeCount} active units • {kpis.totalPlots} plots</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {([
            { id: "overview", label: "📊 Overview", desc: "KPIs & Reports" },
            { id: "tenants", label: "🏠 Tenants & Units", desc: `${tenants.length} records` },
            { id: "payments", label: "💰 Payments Ledger", desc: `${payments.length} transactions` },
            { id: "plots", label: "🏢 Plots", desc: `${plots.length} plots` },
            { id: "backup", label: "⚙️ Backup & Settings", desc: "Export / Import" },
          ] as { id: Tab; label: string; desc: string }[]).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`shrink-0 text-left px-4 py-3 rounded-2xl border-2 transition ${activeTab === t.id ? "bg-[#0F3D2E] text-white border-[#0F3D2E] shadow-lg" : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300"}`}>
              <div className="font-bold text-sm">{t.label}</div>
              <div className={`text-[11px] ${activeTab === t.id ? "text-emerald-200" : "text-slate-500"}`}>{t.desc}</div>
            </button>
          ))}
        </div>

        {showGuide && (
          <div className="mt-3 bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-start">
            <div className="flex-1">
              <div className="font-extrabold text-amber-900 text-sm">🔑 You have full edit mandate — start using it now</div>
              <div className="text-xs text-amber-800 mt-1 leading-relaxed">
                <b>1.</b> Edit agency info in <b>Backup & Settings</b> (name, manager, phone, location) — updates header & receipts instantly. &nbsp;
                <b>2.</b> Add your <b>Plots</b> in Plots tab (or type a new plot name when adding a tenant). &nbsp;
                <b>3.</b> Register <b>Tenants</b> with rent & deposit. &nbsp;
                <b>4.</b> Record <b>Payments</b> (paste M-Pesa SMS to auto-fill). &nbsp;
                <b>5.</b> When a client pays in full, <b>💬 Full-Payment Message</b> auto-generates — copy, WhatsApp or SMS it instantly. &nbsp;
                <b>6.</b> Edit or delete <b>any</b> record anytime — KPIs auto-update. Works offline too.
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setActiveTab("backup")} className="bg-[#0F3D2E] text-white text-xs font-bold px-3 py-2 rounded-lg">Edit Agency Info</button>
              <button onClick={() => setShowGuide(false)} className="bg-white border border-amber-300 text-amber-800 text-xs font-bold px-3 py-2 rounded-lg">Dismiss</button>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
          {[
            { label: "Active Units", value: String(kpis.activeCount), sub: `${kpis.totalPlots} plots tracked`, icon: "🏠", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            { label: "Expected (Rent+Bills)", value: fmt(kpis.expected), sub: `${monthLabel(monthFilter)} • Rent ${fmt(kpis.rentOnly)} + Bills ${fmt(kpis.billsTotal)}${kpis.penaltiesTotal ? ` + Penalty ${fmt(kpis.penaltiesTotal)}` : ""}`, icon: "🧾", color: "bg-amber-50 text-amber-700 border-amber-200" },
            { label: "Collected", value: fmt(kpis.collectedMonth), sub: `${kpis.txnCount} transactions`, icon: "✅", color: "bg-green-50 text-green-700 border-green-200" },
            { label: "Balance Due", value: fmt(kpis.balance), sub: `${kpis.collectionRate}% collected`, icon: "⏳", color: "bg-red-50 text-red-700 border-red-200" },
            { label: "Overdue Tenants", value: String(kpis.overdue), sub: "past due date & unpaid", icon: "⚠️", color: "bg-orange-50 text-orange-700 border-orange-200" },
            { label: "Total All Time", value: fmt(kpis.totalAll), sub: "all plots • all months", icon: "💰", color: "bg-slate-900 text-white border-slate-900" },
          ].map(card => (
            <div key={card.label} className={`rounded-2xl border p-4 ${card.color}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">{card.label}</div>
                  <div className="text-lg sm:text-xl font-extrabold mt-1 leading-none">{card.value}</div>
                  <div className="text-[11px] opacity-70 mt-1">{card.sub}</div>
                </div>
                <span className="text-xl">{card.icon}</span>
              </div>
              {card.label === "Balance Due" && (
                <div className="mt-3 h-1.5 bg-black/10 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${kpis.collectionRate}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {loading && <div className="text-center py-8 text-slate-500 text-sm">Loading data...</div>}

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid lg:grid-cols-3 gap-4 mt-4 pb-10">
            <div className="lg:col-span-2 space-y-4">
              {/* Chart */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-extrabold text-slate-900">Collection Trend — Last 6 Months</h3>
                  <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-full">{plotFilter === "all" ? "All Plots" : plotFilter}</span>
                </div>
                <div className="flex items-end gap-2 sm:gap-3 h-44">
                  {last6.map(x => (
                    <div key={x.ym} className="flex-1 flex flex-col items-center gap-2">
                      <div className="text-[10px] font-bold text-slate-700">{fmt(x.total)}</div>
                      <div className="w-full bg-slate-100 rounded-t-xl relative flex items-end" style={{ height: "120px" }}>
                        <div className="absolute bottom-0 w-full bg-emerald-600 rounded-t-xl transition-all" style={{ height: `${Math.max(4, (x.total / maxChart) * 100)}%` }} />
                        {x.expected > 0 && <div className="absolute w-full border-t-2 border-dashed border-amber-500" style={{ bottom: `${(x.expected / maxChart) * 100}%` }} />}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500">{x.label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-600 rounded" /> Collected</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> Expected rent line</span>
                </div>
              </div>

              {/* Plot performance */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 pb-3 flex justify-between items-center">
                  <h3 className="font-extrabold text-slate-900">Plot Performance — {monthLabel(monthFilter)}</h3>
                  <button onClick={() => exportCSV("summary")} className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full hover:bg-emerald-100">Export CSV</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <tr><th className="text-left px-4 py-3">Plot</th><th className="text-center px-3 py-3">Units</th><th className="text-right px-3 py-3">Expected</th><th className="text-right px-3 py-3">Collected</th><th className="text-right px-3 py-3">Balance</th><th className="text-center px-3 py-3">Rate</th></tr>
                    </thead>
                    <tbody>
                      {plotStats.map(s => (
                        <tr key={s.plot} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setPlotFilter(s.plot)}>
                          <td className="px-4 py-3 font-semibold text-slate-800">{s.plot}<div className="text-xs text-slate-400 font-normal">{s.active} active • {s.units} total</div></td>
                          <td className="text-center px-3 py-3">{s.units}</td>
                          <td className="text-right px-3 py-3">{fmt(s.expected)}</td>
                          <td className="text-right px-3 py-3 text-emerald-700 font-semibold">{fmt(s.collected)}</td>
                          <td className="text-right px-3 py-3 text-red-600 font-semibold">{fmt(s.balance)}</td>
                          <td className="text-center px-3 py-3">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.rate >= 80 ? "bg-emerald-100 text-emerald-700" : s.rate >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{s.rate}%</span>
                          </td>
                        </tr>
                      ))}
                      {plotStats.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No plots yet — add tenants or load demo data</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Status breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-extrabold text-slate-900 mb-4">Rent Status Breakdown — {monthLabel(monthFilter)}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(Object.entries(statusBreakdown) as [string, number][]).map(([k, v]) => (
                    <div key={k} className="text-center p-4 rounded-2xl border bg-slate-50">
                      <div className="text-2xl font-extrabold">{v}</div>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-1">{k}</div>
                      <div className="text-[11px] text-slate-400">{activeTenants.length ? Math.round((v / activeTenants.length) * 100) : 0}% of active</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex h-3 rounded-full overflow-hidden bg-slate-100">
                  <div className="bg-emerald-500" style={{ width: `${activeTenants.length ? (statusBreakdown.Paid / activeTenants.length) * 100 : 0}%` }} />
                  <div className="bg-amber-400" style={{ width: `${activeTenants.length ? (statusBreakdown.Partial / activeTenants.length) * 100 : 0}%` }} />
                  <div className="bg-red-400" style={{ width: `${activeTenants.length ? (statusBreakdown.Unpaid / activeTenants.length) * 100 : 0}%` }} />
                  <div className="bg-violet-400" style={{ width: `${activeTenants.length ? (statusBreakdown.Overpaid / activeTenants.length) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-2"><span>Paid</span><span>Partial</span><span>Unpaid</span><span>Overpaid</span></div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Overdue */}
              <div className="bg-white rounded-2xl border border-red-200 p-5 shadow-sm">
                <h3 className="font-extrabold text-red-700 flex items-center gap-2">⚠️ Overdue / Balance List <span className="ml-auto bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">{overdueList.length}</span></h3>
                <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                  {overdueList.map(({ tenant, paid, balance, total, penalty, dueLabel, daysOverdue }) => (
                    <div key={tenant.id} className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
                      <div className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-sm shrink-0">{tenant.fullName.split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">{tenant.fullName}</div>
                        <div className="text-xs text-slate-500">{tenant.plotName} • {tenant.houseNo} • {tenant.phone}</div>
                        <div className="text-xs mt-0.5">Paid {fmt(paid)} / {fmt(total)} • Due {dueLabel} ({daysOverdue}d overdue){penalty > 0 && <> • ⚠️ Penalty {fmt(penalty)}</>}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-extrabold text-red-700 text-sm">{fmt(balance)}</div>
                        <button onClick={() => { setPForm(p => ({ ...p, tenantId: tenant.id, amount: String(balance), forMonth: monthFilter })); setActiveTab("payments"); }} className="text-[11px] font-bold bg-red-600 text-white px-2 py-1 rounded-full mt-1">Collect</button>
                      </div>
                    </div>
                  ))}
                  {overdueList.length === 0 && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl text-center">🎉 All tenants paid for {monthLabel(monthFilter)}</p>}
                </div>
              </div>

              {/* Fully Paid — Generate Messages */}
              <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-sm">
                <h3 className="font-extrabold text-emerald-800 flex items-center gap-2">✅ Fully Paid Clients <span className="ml-auto bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full">{fullyPaidList.length}</span></h3>
                <p className="text-xs text-slate-500 mt-1">Generate thank-you messages for clients who paid in full for {monthLabel(monthFilter)}.</p>
                <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                  {fullyPaidList.map(({ tenant, paid, latest }) => (
                    <div key={tenant.id} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">{tenant.fullName.split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">{tenant.fullName}</div>
                        <div className="text-xs text-slate-500">{tenant.plotName} • {tenant.houseNo} • {tenant.phone}</div>
                        <div className="text-xs text-emerald-700 font-semibold">Paid {fmt(paid)} / {fmt(tenantTotalDue(tenant, monthFilter, paid))} — Fully Paid 🎉</div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => openFullPaymentMessage(tenant, latest)} className="text-[11px] font-bold bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg">💬 Message</button>
                        {tenant.phone && <a href={waLink(tenant.phone, generateFullPaymentMessage(tenant, latest))} target="_blank" rel="noreferrer" className="text-[11px] font-bold bg-green-500 text-white px-2.5 py-1.5 rounded-lg text-center">WhatsApp</a>}
                      </div>
                    </div>
                  ))}
                  {fullyPaidList.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No fully-paid clients for {monthLabel(monthFilter)} yet</p>}
                </div>
                {fullyPaidList.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={generateBulkMessages} className="flex-1 bg-[#0F3D2E] text-white font-bold py-2.5 rounded-xl text-xs">📋 Copy All Messages ({fullyPaidList.length})</button>
                    <button onClick={() => { if (bulkMsg) { navigator.clipboard.writeText(bulkMsg); showToast("Bulk messages copied"); } else generateBulkMessages(); }} className="bg-slate-100 font-bold px-3 py-2.5 rounded-xl text-xs">Copy Again</button>
                  </div>
                )}
                {bulkMsg && (
                  <textarea value={bulkMsg} onChange={e => setBulkMsg(e.target.value)} className="mt-3 w-full border border-slate-200 rounded-xl p-3 text-xs min-h-[120px] bg-slate-50" placeholder="Bulk messages will appear here..." />
                )}
              </div>

              {/* Recent payments */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-extrabold text-slate-900">Recent Payments</h3>
                <div className="mt-3 space-y-2">
                  {payments.slice(0, 6).map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 rounded-xl hover:bg-slate-50 border border-slate-100">
                      <div>
                        <div className="font-bold text-sm">{p.tenantName} <span className="text-slate-400 font-normal">• {p.houseNo}</span></div>
                        <div className="text-xs text-slate-500">{p.plotName} • {monthLabel(p.forMonth)} • {p.paymentDate}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-emerald-700">{fmt(p.amount)}</div>
                        <div className="text-[11px] text-slate-400">{p.receiptCode}</div>
                      </div>
                    </div>
                  ))}
                  {payments.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No payments yet</p>}
                </div>
                <button onClick={() => setActiveTab("payments")} className="w-full mt-3 bg-[#0F3D2E] text-white font-bold py-2.5 rounded-xl text-sm">View Full Ledger →</button>
              </div>

              {/* Quick stats */}
              <div className="bg-[#0F3D2E] text-white rounded-2xl p-5">
                <h3 className="font-extrabold">Quick Insights</h3>
                <ul className="mt-3 space-y-2 text-sm text-emerald-100">
                  <li>• Occupancy: <b className="text-white">{kpis.occupancy}%</b> ({tenants.filter(t => t.status === "Active").length}/{tenants.length} active)</li>
                  <li>• Avg total due: <b className="text-white">{activeTenants.length ? fmt(Math.round(kpis.expected / activeTenants.length)) : fmt(0)}</b> (rent+bills)</li>
                  <li>• Bills this month: <b className="text-white">⚡{fmt(activeTenants.reduce((s, t) => s + (t.electricityBill || 0), 0))} + 💧{fmt(activeTenants.reduce((s, t) => s + (t.waterBill || 0), 0))}</b></li>
                  <li>• Penalties applied: <b className="text-white">{fmt(kpis.penaltiesTotal)}</b></li>
                  <li>• Deposits held: <b className="text-white">{fmt(tenants.reduce((s, t) => s + t.securityDeposit, 0))}</b></li>
                  <li>• Vacated units: <b className="text-white">{tenants.filter(t => t.status === "Vacated").length}</b></li>
                </ul>
                {tenants.length === 0 && (
                  <button onClick={seedDemo} className="w-full mt-4 bg-amber-500 text-[#0F3D2E] font-bold py-2.5 rounded-xl text-sm">Load Demo Data to Explore</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TENANTS TAB */}
        {activeTab === "tenants" && (
          <div className="grid lg:grid-cols-3 gap-4 mt-4 pb-10">
            {/* Form */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm h-fit lg:sticky lg:top-40">
              <h3 className="font-extrabold text-slate-900 text-lg">{editingId ? "Edit Tenant" : "Add New Tenant / Unit"}</h3>
              <p className="text-xs text-slate-500 mt-1">Register a tenant in a plot. New plot names auto-create the plot.</p>
              <form onSubmit={handleTenantSubmit} className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">Plot / Building Name *</label>
                  <input list="plotList" value={tForm.plotName} onChange={e => setTForm({ ...tForm, plotName: e.target.value })} placeholder="e.g. Ambua Heights - Block A" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" required />
                  <datalist id="plotList">{uniquePlots.map(n => <option key={n} value={n} />)}</datalist>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600">House / Unit No. *</label>
                    <input value={tForm.houseNo} onChange={e => setTForm({ ...tForm, houseNo: e.target.value })} placeholder="A1" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" required />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Status</label>
                    <select value={tForm.status} onChange={e => setTForm({ ...tForm, status: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none">
                      <option>Active</option><option>Vacated</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Tenant Full Name *</label>
                  <input value={tForm.fullName} onChange={e => setTForm({ ...tForm, fullName: e.target.value })} placeholder="Full name" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" required />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Phone Number</label>
                  <input value={tForm.phone} onChange={e => setTForm({ ...tForm, phone: e.target.value })} placeholder="07XX XXX XXX" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600">Monthly Rent (KSh)</label>
                    <input type="number" value={tForm.monthlyRent} onChange={e => setTForm({ ...tForm, monthlyRent: e.target.value })} placeholder="25000" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Security Deposit</label>
                    <input type="number" value={tForm.securityDeposit} onChange={e => setTForm({ ...tForm, securityDeposit: e.target.value })} placeholder="25000" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                  <div className="text-xs font-extrabold text-amber-800 uppercase tracking-wider">📅 Due Date & Monthly Bills — Edit These</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600">Rent Due Day (1-28)</label>
                      <input type="number" min={1} max={28} value={tForm.rentDueDay} onChange={e => setTForm({ ...tForm, rentDueDay: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500 bg-white" />
                      <p className="text-[10px] text-slate-500 mt-0.5">Each tenant can have a different due date</p>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">Penalty if Late (KSh)</label>
                      <input type="number" value={tForm.penaltyAmount} onChange={e => setTForm({ ...tForm, penaltyAmount: e.target.value })} placeholder="2000" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500 bg-white" />
                      <p className="text-[10px] text-slate-500 mt-0.5">Applied when past due & unpaid</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600">⚡ Electricity Bill /mo (KSh)</label>
                      <input type="number" value={tForm.electricityBill} onChange={e => setTForm({ ...tForm, electricityBill: e.target.value })} placeholder="1500" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">💧 Water Bill /mo (KSh)</label>
                      <input type="number" value={tForm.waterBill} onChange={e => setTForm({ ...tForm, waterBill: e.target.value })} placeholder="800" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500 bg-white" />
                    </div>
                  </div>
                  <div className="text-[11px] bg-white rounded-lg p-2 text-slate-600">
                    Total monthly due: <b>{fmt((Number(tForm.monthlyRent) || 0) + (Number(tForm.electricityBill) || 0) + (Number(tForm.waterBill) || 0))}</b> (Rent + Electricity + Water) {Number(tForm.penaltyAmount) > 0 && <>+ Penalty <b>{fmt(Number(tForm.penaltyAmount))}</b> if late</>}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Move-In Date</label>
                  <input type="date" value={tForm.moveInDate} onChange={e => setTForm({ ...tForm, moveInDate: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" className="flex-1 bg-[#0F3D2E] hover:bg-emerald-800 text-white font-bold py-3 rounded-xl text-sm">{editingId ? "Update Tenant" : "Add Tenant"}</button>
                  {editingId && <button type="button" onClick={resetTenantForm} className="px-4 bg-slate-100 font-bold rounded-xl text-sm">Cancel</button>}
                </div>
                {!online && <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg text-center">Offline — will save locally and sync later</p>}
              </form>
            </div>

            {/* List */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row gap-3">
                <input value={tenantSearch} onChange={e => setTenantSearch(e.target.value)} placeholder="Search plot, house, name or phone..." className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none">
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option>Paid</option><option>Partial</option><option>Unpaid</option><option>Overpaid</option>
                </select>
              </div>
              <div className="flex gap-2 flex-wrap">
                {["all", "Paid", "Partial", "Unpaid", "Overpaid"].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${statusFilter === s ? "bg-[#0F3D2E] text-white border-[#0F3D2E]" : "bg-white text-slate-600 border-slate-200"}`}>
                    {s === "all" ? "All" : s} {s !== "all" && `(${activeTenants.filter(t => tenantRentStatus(t) === s).length})`}
                  </button>
                ))}
                <span className="ml-auto text-xs text-slate-500 self-center">{displayedTenants.length} shown • {monthLabel(monthFilter)}</span>
              </div>

              {displayedTenants.map(t => {
                const paid = paidForTenant(t.id, monthFilter);
                const totalDue = tenantTotalDue(t, monthFilter, paid);
                const bal = Math.max(0, totalDue - paid);
                const penalty = penaltyFor(t, monthFilter, paid);
                const st = tenantRentStatus(t);
                const totalPaid = paidForTenantAll(t.id);
                const overdue = isPastDue(t, monthFilter) && bal > 0;
                const stColor = st === "Paid" ? "bg-emerald-100 text-emerald-700" : st === "Partial" ? "bg-amber-100 text-amber-700" : st === "Unpaid" ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700";
                return (
                  <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="w-11 h-11 rounded-full bg-[#0F3D2E] text-white flex items-center justify-center font-extrabold shrink-0">{t.fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-slate-900">{t.fullName}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${stColor}`}>{st} • {monthLabel(monthFilter)}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${t.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"}`}>{t.status}</span>
                          {overdue && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">⏰ Overdue — Due {dueDateLabel(t, monthFilter)}</span>}
                        </div>
                        <div className="text-sm text-slate-600 mt-0.5">{t.plotName} • <b>House {t.houseNo}</b> • {t.phone || "No phone"} • <span className="text-xs">Due: {dueDateLabel(t, monthFilter)} (Day {t.rentDueDay || 5})</span></div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                          <div className="bg-slate-50 rounded-lg p-2"><div className="text-slate-400 font-bold uppercase text-[10px]">Rent + Bills Due</div><div className="font-bold">{fmt(totalDue)}</div><div className="text-[10px] text-slate-500">Rent {fmt(t.monthlyRent)} + ⚡{fmt(t.electricityBill || 0)} + 💧{fmt(t.waterBill || 0)}{penalty > 0 && <> + ⚠️{fmt(penalty)}</>}</div></div>
                          <div className="bg-emerald-50 rounded-lg p-2"><div className="text-emerald-600 font-bold uppercase text-[10px]">Paid ({monthLabel(monthFilter)})</div><div className="font-bold text-emerald-700">{fmt(paid)}</div></div>
                          <div className="bg-red-50 rounded-lg p-2"><div className="text-red-500 font-bold uppercase text-[10px]">Balance</div><div className="font-bold text-red-700">{fmt(bal)}</div></div>
                          <div className="bg-amber-50 rounded-lg p-2"><div className="text-amber-600 font-bold uppercase text-[10px]">Total Paid All Time</div><div className="font-bold">{fmt(totalPaid)}</div></div>
                        </div>
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${st === "Paid" || st === "Overpaid" ? "bg-emerald-500" : st === "Partial" ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${totalDue ? Math.min(100, (paid / totalDue) * 100) : 0}%` }} />
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">Deposit: {fmt(t.securityDeposit)} • Moved in: {t.moveInDate || "—"} • ⚡ Electricity: {fmt(t.electricityBill || 0)}/mo • 💧 Water: {fmt(t.waterBill || 0)}/mo • Penalty: {fmt(t.penaltyAmount || 0)}</div>
                      </div>
                      <div className="flex sm:flex-col gap-1.5 shrink-0">
                        <button onClick={() => editTenant(t)} className="text-xs font-bold bg-slate-900 text-white px-3 py-2 rounded-lg">Edit</button>
                        <button onClick={() => { setPForm(p => ({ ...p, tenantId: t.id, amount: bal ? String(bal) : "", forMonth: monthFilter })); setActiveTab("payments"); }} className="text-xs font-bold bg-emerald-600 text-white px-3 py-2 rounded-lg">Collect</button>
                        {(st === "Paid" || st === "Overpaid") && (
                          <button onClick={() => openFullPaymentMessage(t)} className="text-xs font-bold bg-green-600 text-white px-3 py-2 rounded-lg">💬 Full-Pay Msg</button>
                        )}
                        {t.phone && <a href={`https://wa.me/254${t.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="text-xs font-bold bg-green-500 text-white px-3 py-2 rounded-lg text-center">WhatsApp</a>}
                        <button onClick={() => deleteTenant(t.id, t.fullName)} className="text-xs font-bold bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg">Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {displayedTenants.length === 0 && (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                  <div className="text-4xl mb-2">🏠</div>
                  <p className="font-bold text-slate-700">No tenants found</p>
                  <p className="text-sm text-slate-500 mt-1">Add your first tenant using the form or load demo data.</p>
                  <button onClick={seedDemo} className="mt-4 bg-amber-500 text-[#0F3D2E] font-bold px-5 py-2.5 rounded-xl text-sm">Load Demo Data</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === "payments" && (
          <div className="space-y-4 mt-4 pb-10">
            <div className="grid lg:grid-cols-2 gap-4">
              {/* SMS Parser */}
              <div className="bg-[#0F3D2E] text-white rounded-2xl p-5 shadow-sm">
                <h3 className="font-extrabold text-lg flex items-center gap-2">📱 Quick M-Pesa SMS Parser</h3>
                <p className="text-emerald-200 text-xs mt-1">Paste a raw M-Pesa confirmation SMS to auto-extract code, amount & tenant.</p>
                <textarea value={smsInput} onChange={e => setSmsInput(e.target.value)} placeholder="Paste M-Pesa SMS here... e.g. QK7X9P2M4N Confirmed. You have received KSh 25,000 from JOHN DOE 0712345678 on 12/5/26..." className="mt-3 w-full bg-white/10 border border-white/20 rounded-xl p-3 text-sm placeholder:text-emerald-300/60 outline-none min-h-[100px]" />
                <div className="flex gap-2 mt-3">
                  <button onClick={parseSms} className="flex-1 bg-amber-500 hover:bg-amber-400 text-[#0F3D2E] font-extrabold py-2.5 rounded-xl text-sm">Parse SMS → Fill Form</button>
                  <button onClick={() => { setSmsInput(""); setParsed(null); }} className="px-4 bg-white/10 rounded-xl text-sm font-bold">Clear</button>
                </div>
                {parsed && (
                  <div className="mt-3 bg-white text-slate-900 rounded-xl p-3 text-sm grid grid-cols-2 gap-2">
                    <div><div className="text-[10px] font-bold uppercase text-slate-400">Txn Code</div><div className="font-bold">{parsed.code || "—"}</div></div>
                    <div><div className="text-[10px] font-bold uppercase text-slate-400">Amount</div><div className="font-bold text-emerald-700">{parsed.amount ? fmt(Number(parsed.amount)) : "—"}</div></div>
                    <div><div className="text-[10px] font-bold uppercase text-slate-400">Phone</div><div className="font-bold">{parsed.phone || "—"}</div></div>
                    <div><div className="text-[10px] font-bold uppercase text-slate-400">Matched Tenant</div><div className="font-bold text-xs">{parsed.tenantLabel || "Not matched — select manually"}</div></div>
                  </div>
                )}
                <div className="mt-3 text-[11px] text-emerald-300/80">Tip: Matching uses last 9 digits of phone number. Duplicate codes are blocked automatically.</div>
              </div>

              {/* Payment Form */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-900 text-lg">{editingPaymentId ? "✏️ Edit Payment" : "Record Payment"}</h3>
                  {editingPaymentId && <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-full">EDIT MODE</span>}
                </div>
                {editingPaymentId && <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg mt-2">You are editing an existing payment. Update any field and save — balances recalculate automatically.</p>}
                <form onSubmit={handlePaymentSubmit} className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600">Tenant / Unit *</label>
                    <select value={pForm.tenantId} onChange={e => setPForm({ ...pForm, tenantId: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" required>
                      <option value="">Select tenant...</option>
                      {uniquePlots.map(plot => (
                        <optgroup key={plot} label={plot}>
                          {tenants.filter(t => t.plotName === plot).map(t => (
                            <option key={t.id} value={t.id}>{t.houseNo} — {t.fullName} ({t.phone}) • {fmt(t.monthlyRent)}/mo</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {pForm.tenantId && (() => {
                      const t = tenants.find(x => x.id === pForm.tenantId);
                      if (!t) return null;
                      const paid = paidForTenant(t.id, pForm.forMonth);
                      const total = tenantTotalDue(t, pForm.forMonth, paid);
                      const penalty = penaltyFor(t, pForm.forMonth, paid);
                      return <div className="text-xs mt-1.5 bg-slate-50 p-2 rounded-lg space-y-1">
                        <div>Due {dueDateLabel(t, pForm.forMonth)} (Day {t.rentDueDay || 5}) • Rent <b>{fmt(t.monthlyRent)}</b> + ⚡<b>{fmt(t.electricityBill || 0)}</b> + 💧<b>{fmt(t.waterBill || 0)}</b>{penalty > 0 && <> + ⚠️Penalty <b>{fmt(penalty)}</b></>} = <b>{fmt(total)}</b></div>
                        <div>Paid for {monthLabel(pForm.forMonth)}: <b className="text-emerald-700">{fmt(paid)}</b> • Balance: <b className="text-red-600">{fmt(Math.max(0, total - paid))}</b></div>
                      </div>;
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600">For Month *</label>
                      <input type="month" value={pForm.forMonth} onChange={e => setPForm({ ...pForm, forMonth: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" required />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">Amount Paid (KSh) *</label>
                      <input type="number" value={pForm.amount} onChange={e => setPForm({ ...pForm, amount: e.target.value })} placeholder="25000" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600">Channel</label>
                      <select value={pForm.channel} onChange={e => setPForm({ ...pForm, channel: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none">
                        {CHANNELS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">Payment Date</label>
                      <input type="date" value={pForm.paymentDate} onChange={e => setPForm({ ...pForm, paymentDate: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600">M-Pesa / Txn Code</label>
                      <input value={pForm.txnCode} onChange={e => setPForm({ ...pForm, txnCode: e.target.value })} placeholder="QK7X9P2M4N" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none uppercase" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">System Receipt Code</label>
                      <div className="flex gap-1 mt-1">
                        <input value={pForm.receiptCode} onChange={e => setPForm({ ...pForm, receiptCode: e.target.value })} className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" />
                        <button type="button" onClick={() => setPForm({ ...pForm, receiptCode: genReceipt() })} className="bg-slate-100 px-3 rounded-xl text-xs font-bold">↻</button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Notes</label>
                    <input value={pForm.notes} onChange={e => setPForm({ ...pForm, notes: e.target.value })} placeholder="Optional notes" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-[#0F3D2E] hover:bg-emerald-800 text-white font-extrabold py-3 rounded-xl text-sm">{editingPaymentId ? "✓ Save Changes" : "✓ Record Payment"}</button>
                    {editingPaymentId && <button type="button" onClick={resetPaymentForm} className="px-5 bg-slate-100 font-bold rounded-xl text-sm">Cancel</button>}
                  </div>
                  {!online && <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg text-center">Offline — payment will queue and sync later</p>}
                </form>
              </div>
            </div>

            {/* Ledger */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center border-b border-slate-100">
                <div>
                  <h3 className="font-extrabold text-slate-900">Payment Transactions Ledger</h3>
                  <p className="text-xs text-slate-500">{displayedPayments.length} records • Sorted by date • {plotFilter === "all" ? "All Plots" : plotFilter}</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <input value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} placeholder="Search receipt, tenant, code..." className="flex-1 sm:w-64 border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none" />
                  <button onClick={() => exportCSV("payments")} className="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0">Export CSV</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr><th className="text-left px-4 py-3">Date</th><th className="text-left px-3 py-3">Receipt</th><th className="text-left px-3 py-3">Tenant</th><th className="text-left px-3 py-3">Plot / House</th><th className="text-center px-3 py-3">For Month</th><th className="text-right px-3 py-3">Amount</th><th className="text-left px-3 py-3">Channel</th><th className="text-left px-3 py-3">Txn Code</th><th className="text-center px-3 py-3">Actions</th></tr>
                  </thead>
                  <tbody>
                    {displayedPayments.map(p => (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 whitespace-nowrap">{p.paymentDate}</td>
                        <td className="px-3 py-3 font-bold text-slate-700">{p.receiptCode}</td>
                        <td className="px-3 py-3"><div className="font-semibold">{p.tenantName}</div><div className="text-xs text-slate-400">{p.phone}</div></td>
                        <td className="px-3 py-3">{p.plotName}<div className="text-xs text-slate-400">House {p.houseNo}</div></td>
                        <td className="text-center px-3 py-3">{monthLabel(p.forMonth)}</td>
                        <td className="text-right px-3 py-3 font-extrabold text-emerald-700">{fmt(p.amount)}</td>
                        <td className="px-3 py-3 text-xs">{p.channel}</td>
                        <td className="px-3 py-3 text-xs font-mono">{p.txnCode || "—"}</td>
                        <td className="text-center px-3 py-3 whitespace-nowrap">
                          <button onClick={() => setReceipt(p)} className="text-xs font-bold bg-slate-900 text-white px-2.5 py-1.5 rounded-lg mr-1">Receipt</button>
                          {(() => {
                            const t = tenants.find(x => x.id === p.tenantId);
                            const full = t ? isFullyPaid(t, p.forMonth) : false;
                            return full ? <button onClick={() => t && openFullPaymentMessage(t, p)} className="text-xs font-bold bg-green-600 text-white px-2.5 py-1.5 rounded-lg mr-1">💬 Msg</button> : null;
                          })()}
                          <button onClick={() => editPayment(p)} className="text-xs font-bold bg-amber-500 text-[#0F3D2E] px-2.5 py-1.5 rounded-lg mr-1">Edit</button>
                          <button onClick={() => deletePayment(p.id)} className="text-xs font-bold bg-red-50 text-red-700 border border-red-200 px-2.5 py-1.5 rounded-lg">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {displayedPayments.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-slate-400">No payments found</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PLOTS TAB */}
        {activeTab === "plots" && (
          <div className="grid lg:grid-cols-3 gap-4 mt-4 pb-10">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm h-fit">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-lg">{editingPlotId ? "✏️ Edit Plot" : "Add New Plot"}</h3>
                {editingPlotId && <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-full">EDIT MODE</span>}
              </div>
              <p className="text-xs text-slate-500 mt-1">{editingPlotId ? "Renaming a plot updates all its tenants & payments automatically." : "Plots group housing units. Tenants auto-create plots too."}</p>
              <form onSubmit={addPlot} className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">Plot Name *</label>
                  <input value={newPlot.name} onChange={e => setNewPlot({ ...newPlot, name: e.target.value })} placeholder="e.g. Ambua Heights - Block C" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" required />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Location</label>
                  <input value={newPlot.location} onChange={e => setNewPlot({ ...newPlot, location: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-[#0F3D2E] text-white font-bold py-3 rounded-xl text-sm">{editingPlotId ? "Save Plot Changes" : "Add Plot"}</button>
                  {editingPlotId && <button type="button" onClick={resetPlotForm} className="px-4 bg-slate-100 font-bold rounded-xl text-sm">Cancel</button>}
                </div>
              </form>
              <div className="mt-6 bg-slate-50 rounded-xl p-4">
                <h4 className="font-bold text-sm">How plots work</h4>
                <ul className="text-xs text-slate-600 mt-2 space-y-1 list-disc pl-4">
                  <li>Each plot contains multiple housing units (houses/flats).</li>
                  <li>Filter by plot to see KPIs for that plot only.</li>
                  <li>Plot performance shows expected vs collected rent.</li>
                </ul>
              </div>
            </div>
            <div className="lg:col-span-2 grid sm:grid-cols-2 gap-3">
              {plotStats.map(s => (
                <div key={s.plot} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-extrabold text-slate-900">{s.plot}</h4>
                      <p className="text-xs text-slate-500">{s.active} active • {s.units} total units</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.rate >= 80 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{s.rate}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="bg-slate-50 rounded-lg p-2"><div className="text-[10px] font-bold uppercase text-slate-400">Expected</div><div className="font-bold text-sm">{fmt(s.expected)}</div></div>
                    <div className="bg-emerald-50 rounded-lg p-2"><div className="text-[10px] font-bold uppercase text-emerald-600">Collected</div><div className="font-bold text-sm text-emerald-700">{fmt(s.collected)}</div></div>
                    <div className="bg-red-50 rounded-lg p-2"><div className="text-[10px] font-bold uppercase text-red-500">Balance</div><div className="font-bold text-sm text-red-700">{fmt(s.balance)}</div></div>
                  </div>
                  <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${s.rate}%` }} /></div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => { setPlotFilter(s.plot); setActiveTab("overview"); }} className="flex-1 bg-[#0F3D2E] text-white text-xs font-bold py-2 rounded-lg">View</button>
                    <button onClick={() => { const p = plots.find(x => x.name === s.plot); if (p) editPlot(p); else showToast("Plot not in registry — add it first via form"); }} className="bg-amber-500 text-[#0F3D2E] text-xs font-bold px-3 py-2 rounded-lg">Edit</button>
                    <button onClick={() => { const p = plots.find(x => x.name === s.plot); if (p) deletePlot(p.id, s.plot); else showToast("Plot not in registry — delete tenants first"); }} className="bg-red-50 text-red-700 border border-red-200 text-xs font-bold px-3 py-2 rounded-lg">Delete</button>
                  </div>
                </div>
              ))}
              {plotStats.length === 0 && <div className="sm:col-span-2 bg-white rounded-2xl border border-dashed p-10 text-center text-slate-400">No plots yet</div>}
            </div>
          </div>
        )}

        {/* BACKUP TAB */}
        {activeTab === "backup" && (
          <div className="grid lg:grid-cols-2 gap-4 mt-4 pb-10">
            <div className="space-y-4">
              <div className="bg-[#0F3D2E] text-white rounded-2xl p-5 shadow-sm">
                <h3 className="font-extrabold text-lg">🚀 Start Using — Your Edit Mandate</h3>
                <p className="text-emerald-200 text-xs mt-1">You can edit <b className="text-white">everything</b> below — no locks, no approvals. Changes save instantly and sync to cloud.</p>
                <ol className="mt-3 space-y-1.5 text-xs text-emerald-100 list-decimal pl-4">
                  <li><b className="text-white">Edit agency info</b> here → header & receipts update live.</li>
                  <li><b className="text-white">Plots tab</b> → Add / Edit / Delete plots (rename cascades to tenants).</li>
                  <li><b className="text-white">Tenants tab</b> → Add / Edit / Delete any tenant, change rent, deposit, status.</li>
                  <li><b className="text-white">Payments tab</b> → Record, Edit, Delete any payment; paste M-Pesa SMS to auto-fill.</li>
                  <li><b className="text-white">Backup</b> → Export JSON/CSV regularly. Works offline — syncs when online.</li>
                </ol>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setActiveTab("plots")} className="flex-1 bg-amber-500 text-[#0F3D2E] font-bold py-2 rounded-lg text-xs">Go to Plots →</button>
                  <button onClick={() => setActiveTab("tenants")} className="flex-1 bg-white text-[#0F3D2E] font-bold py-2 rounded-lg text-xs">Add Tenants →</button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-extrabold text-slate-900 text-lg">✏️ Agency Header & Receipt Settings — Edit Here</h3>
                <p className="text-xs text-slate-500">Shown on header and printed receipts. Edit and Save — no restart needed.</p>
                <form onSubmit={saveSettings} className="mt-4 space-y-3">
                  <div><label className="text-xs font-bold text-slate-600">Agency Name</label><input value={sForm.agencyName} onChange={e => setSForm({ ...sForm, agencyName: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" /></div>
                  <div><label className="text-xs font-bold text-slate-600">Manager / Account Name</label><input value={sForm.managerName} onChange={e => setSForm({ ...sForm, managerName: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-slate-600">Phone</label><input value={sForm.phone} onChange={e => setSForm({ ...sForm, phone: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" /></div>
                    <div><label className="text-xs font-bold text-slate-600">Location</label><input value={sForm.location} onChange={e => setSForm({ ...sForm, location: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none" /></div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">💬 Full-Payment Message Template</label>
                    <p className="text-[11px] text-slate-500 mt-0.5">Placeholders: {"{tenantName} {agencyName} {plotName} {houseNo} {monthLabel} {rent} {electricity} {water} {penalty} {totalDue} {amountPaid} {balance} {receiptCode} {paymentDate} {dueDate} {managerName} {phone} {location} {txnCode} {channel}"}</p>
                    <textarea value={sForm.messageTemplate || ""} onChange={e => setSForm({ ...sForm, messageTemplate: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none min-h-[140px] font-mono" />
                    <button type="button" onClick={() => setSForm({ ...sForm, messageTemplate: DEFAULT_TEMPLATE })} className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full mt-1">Reset to Default Template</button>
                  </div>
                  <button type="submit" className="w-full bg-[#0F3D2E] text-white font-bold py-3 rounded-xl text-sm">Save Settings & Template</button>
                </form>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-extrabold text-slate-900">Offline & Storage</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between bg-slate-50 p-3 rounded-xl"><span>Connection</span><b className={online ? "text-emerald-700" : "text-amber-700"}>{online ? "Online" : "Offline"}</b></div>
                  <div className="flex justify-between bg-slate-50 p-3 rounded-xl"><span>Pending sync items</span><b>{pending.length}</b></div>
                  <div className="flex justify-between bg-slate-50 p-3 rounded-xl"><span>Tenants stored</span><b>{tenants.length}</b></div>
                  <div className="flex justify-between bg-slate-50 p-3 rounded-xl"><span>Payments stored</span><b>{payments.length}</b></div>
                  <div className="text-[11px] text-slate-500 bg-amber-50 p-3 rounded-xl">Data is stored in PostgreSQL (cloud) + automatically mirrored to this browser (localStorage) for offline use. Keys: ambua_nest_realty_*_v2</div>
                  {pending.length > 0 && <button onClick={syncPending} className="w-full bg-amber-500 text-[#0F3D2E] font-bold py-2.5 rounded-xl text-sm">Sync Now ({pending.length})</button>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-extrabold text-slate-900 text-lg">JSON Backup & Restore</h3>
                <p className="text-xs text-slate-500 mt-1">Full snapshot for safekeeping or moving to another device.</p>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button onClick={exportJSON} className="bg-[#0F3D2E] text-white font-bold py-3 rounded-xl text-sm">⬇ Export JSON Backup</button>
                  <button onClick={() => fileRef.current?.click()} className="bg-white border-2 border-slate-300 font-bold py-3 rounded-xl text-sm">⬆ Restore from JSON</button>
                  <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importJSON(f); }} />
                </div>
                <div className="text-[11px] text-slate-400 mt-2">Filename: ambua-nest-rent-backup-YYYY-MM-DD.json</div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-extrabold text-slate-900 text-lg">CSV Spreadsheet Exports</h3>
                <p className="text-xs text-slate-500 mt-1">Open in Excel / Google Sheets.</p>
                <div className="space-y-2 mt-4">
                  <button onClick={() => exportCSV("payments")} className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl text-sm text-left px-4">📄 Payments Ledger CSV <span className="float-right text-emerald-200 text-xs">with plot, house, tenant & phone</span></button>
                  <button onClick={() => exportCSV("tenants")} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl text-sm text-left px-4">📄 Tenants CSV <span className="float-right text-slate-400 text-xs">all units & rent details</span></button>
                  <button onClick={() => exportCSV("summary")} className="w-full bg-amber-500 text-[#0F3D2E] font-bold py-3 rounded-xl text-sm text-left px-4">📊 Plot Summary CSV <span className="float-right text-amber-800 text-xs">expected vs collected per plot</span></button>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                <h3 className="font-extrabold text-red-700">Danger Zone</h3>
                <p className="text-xs text-red-600 mt-1">Reset clears all tenants, payments and plots from the database.</p>
                <div className="flex gap-2 mt-4">
                  <button onClick={resetAll} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl text-sm">Reset All Data</button>
                  <button onClick={seedDemo} className="flex-1 bg-white border border-red-300 text-red-700 font-bold py-3 rounded-xl text-sm">Load Demo Data</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setReceipt(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div id="receipt-print" className="p-6">
              <div className="text-center border-b-2 border-[#0F3D2E] pb-4">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#0F3D2E] text-amber-400 flex items-center justify-center text-xl font-black">A</div>
                <h2 className="font-extrabold text-lg text-[#0F3D2E] mt-2">{settings.agencyName}</h2>
                <p className="text-xs text-slate-500">{settings.location} • {settings.managerName} • {settings.phone}</p>
                <span className="inline-block mt-2 bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">OFFICIAL RENT RECEIPT</span>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Receipt No.</span><b>{receipt.receiptCode}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Payment Date</span><b>{receipt.paymentDate}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Tenant</span><b>{receipt.tenantName}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Plot / House</span><b>{receipt.plotName} • {receipt.houseNo}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Phone</span><b>{receipt.phone}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">For Month</span><b>{monthLabel(receipt.forMonth)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Channel</span><b>{receipt.channel}</b></div>
                {receipt.txnCode && <div className="flex justify-between"><span className="text-slate-500">Txn Code</span><b className="font-mono">{receipt.txnCode}</b></div>}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center mt-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Amount Received</div>
                  <div className="text-2xl font-extrabold text-emerald-800 mt-1">{fmt(receipt.amount)}</div>
                  <div className="text-xs text-emerald-700 mt-1 italic">{numberToWords(receipt.amount)}</div>
                </div>
                {(() => {
                  const t = tenants.find(x => x.id === receipt.tenantId);
                  if (!t) return null;
                  const paid = paidForTenant(t.id, receipt.forMonth);
                  const total = tenantTotalDue(t, receipt.forMonth, paid);
                  const bal = Math.max(0, total - paid);
                  const penalty = penaltyFor(t, receipt.forMonth, paid);
                  return (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs mt-3">
                        <div className="bg-slate-50 p-2 rounded-lg"><div className="text-slate-400 font-bold uppercase text-[10px]">Total Due</div><div className="font-bold">{fmt(total)}</div><div className="text-[10px] text-slate-500">Rent {fmt(t.monthlyRent)} + ⚡{fmt(t.electricityBill || 0)} + 💧{fmt(t.waterBill || 0)}{penalty > 0 && <> + ⚠️{fmt(penalty)}</>}</div></div>
                        <div className="bg-emerald-50 p-2 rounded-lg"><div className="text-emerald-600 font-bold uppercase text-[10px]">Paid This Month</div><div className="font-bold text-emerald-700">{fmt(paid)}</div></div>
                        <div className="bg-red-50 p-2 rounded-lg"><div className="text-red-500 font-bold uppercase text-[10px]">Balance</div><div className="font-bold text-red-700">{fmt(bal)}</div></div>
                      </div>
                      <div className="text-[11px] text-slate-500 text-center mt-1">Due date: {dueDateLabel(t, receipt.forMonth)} (Day {t.rentDueDay || 5})</div>
                    </div>
                  );
                })()}
                {receipt.notes && <div className="text-xs bg-slate-50 p-3 rounded-lg mt-3"><b>Notes:</b> {receipt.notes}</div>}
                <p className="text-center text-[11px] text-slate-400 mt-4">Thank you for your payment. • {settings.agencyName}</p>
              </div>
            </div>
            <div className="no-print flex flex-wrap gap-2 p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => window.print()} className="flex-1 bg-[#0F3D2E] text-white font-bold py-2.5 rounded-xl text-sm">🖨 Print Receipt</button>
              <button onClick={() => copyWhatsApp(receipt)} className="flex-1 bg-green-500 text-white font-bold py-2.5 rounded-xl text-sm">💬 Copy WhatsApp</button>
              {(() => {
                const t = tenants.find(x => x.id === receipt.tenantId);
                const full = t ? isFullyPaid(t, receipt.forMonth) : false;
                return full && t ? <button onClick={() => { setReceipt(null); openFullPaymentMessage(t, receipt); }} className="flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-sm">✅ Full-Pay Message</button> : null;
              })()}
              <button onClick={() => setReceipt(null)} className="px-4 bg-white border border-slate-300 font-bold rounded-xl text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Payment Message Modal */}
      {msgTenant && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setMsgTenant(null); setMsgPayment(null); }}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 className="font-extrabold text-lg text-emerald-800">✅ Full-Payment Message</h3>
                <p className="text-xs text-slate-500 mt-0.5">{msgTenant.fullName} • {msgTenant.plotName} • House {msgTenant.houseNo} • {msgTenant.phone}</p>
                <span className="inline-block mt-2 bg-emerald-100 text-emerald-700 text-[11px] font-bold px-2 py-1 rounded-full">Fully Paid for {monthLabel(msgPayment?.forMonth || monthFilter)} 🎉</span>
              </div>
              <button onClick={() => { setMsgTenant(null); setMsgPayment(null); }} className="w-8 h-8 rounded-full bg-slate-100 font-bold">×</button>
            </div>
            <div className="p-5">
              <label className="text-xs font-bold text-slate-600">Generated Message (editable)</label>
              <textarea value={msgText} onChange={e => setMsgText(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-3 text-sm min-h-[220px] outline-none focus:border-emerald-500" />
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => { navigator.clipboard.writeText(msgText); showToast("Message copied — paste in WhatsApp/SMS"); }} className="bg-slate-900 text-white font-bold py-3 rounded-xl text-sm">📋 Copy Message</button>
                {msgTenant.phone && <a href={waLink(msgTenant.phone, msgText)} target="_blank" rel="noreferrer" className="bg-green-500 text-white font-bold py-3 rounded-xl text-sm text-center">💬 Send via WhatsApp</a>}
                {msgTenant.phone && <a href={smsLink(msgTenant.phone, msgText)} className="bg-amber-500 text-[#0F3D2E] font-bold py-3 rounded-xl text-sm text-center">📱 Send via SMS</a>}
                <button onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(`<pre style="font-family:sans-serif;padding:20px;white-space:pre-wrap">${msgText.replace(/</g, "&lt;")}</pre>`); w.document.close(); w.print(); } }} className="bg-white border-2 border-slate-300 font-bold py-3 rounded-xl text-sm">🖨 Print Message</button>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 text-center">Tip: Edit the template in Backup & Settings to customize all future messages.</p>
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 text-center text-xs text-slate-400">
        {settings.agencyName} • {settings.location} • Manager: {settings.managerName} • {settings.phone} • Offline-ready • Auto-syncs to cloud
      </footer>
    </div>
  );
}
