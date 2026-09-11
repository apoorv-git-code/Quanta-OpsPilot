"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ShieldAlert,
  Users,
  Package,
  Terminal,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Zap,
  Stethoscope,
  Briefcase,
  Settings,
  Bell,
  Cpu,
  ArrowDownRight,
  Pause,
  Play,
  Trash2,
  X,
  Send,
  Fingerprint,
  FileText,
  PhoneCall,
  Wifi,
  WifiOff,
  TrendingDown,
  Activity,
  AlertTriangle,
  UserPlus,
  Bot,
  ListFilter,
  ToggleLeft,
  ToggleRight,
  Scale,
  Lock,
  User,
  Search
} from "lucide-react";

/**
 * OPSPILOT HEALTH KERNEL
 * Interactive hospital-operations control surface: clinical prior-auth,
 * per-diem staffing negotiation, supply logistics, and a live system log.
 */

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const NEGOTIATION_API_URL =
  (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_NEGOTIATION_API_URL) ||
  "http://localhost:8000/api/negotiate";

<<<<<<< HEAD
const API_TIMEOUT_MS = 4000;
=======
const JUSTIFY_API_URL =
  (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_JUSTIFY_API_URL) ||
  "http://localhost:8000/api/v1/prior-auth/justify";

const API_TIMEOUT_MS = 4000;
const JUSTIFY_TIMEOUT_MS = 15000;
>>>>>>> origin/master

// ---------------------------------------------------------------------------
// DATA
// ---------------------------------------------------------------------------

const PATIENTS = [
  { id: "PAT-001", name: "Elias, Marshall", dob: "1978-04-12", gender: "M", vitals: { hr: [72, 75, 71, 78, 82, 80, 76, 74, 73, 75, 78, 85, 88, 82, 78, 75, 74, 73, 72, 71, 70, 72, 74, 75], bp: "138/88", spo2: 98, temp: 98.6 }, history: [{ date: "2023-10-12", event: "Appendectomy", type: "SURGICAL" }, { date: "2023-05-04", event: "Hypertension diagnosis", type: "MEDICAL" }, { date: "2022-12-01", event: "ACL repair", type: "SURGICAL" }], medications: [{ name: "Lisinopril", dosage: "10mg", frequency: "QD" }, { name: "Metformin", dosage: "500mg", frequency: "BID" }] },
  { id: "PAT-002", name: "Chen, Wei", dob: "1992-11-30", gender: "F", vitals: { hr: [60, 62, 61, 63, 60, 59, 61, 62, 63, 62, 61, 60, 62, 65, 66, 64, 62, 61, 60, 59, 60, 61, 62, 63], bp: "110/70", spo2: 99, temp: 98.4 }, history: [{ date: "2024-01-15", event: "Acute bronchitis", type: "MEDICAL" }], medications: [{ name: "Albuterol", dosage: "90mcg", frequency: "PRN" }] },
  { id: "PAT-003", name: "Garcia, Ana", dob: "1965-08-22", gender: "F", vitals: { hr: [88, 90, 92, 95, 98, 94, 90, 88, 85, 84, 83, 82, 85, 87, 89, 90, 91, 92, 90, 88, 86, 85, 84, 83], bp: "145/95", spo2: 94, temp: 100.2 }, history: [{ date: "2023-11-20", event: "Diabetes type 2", type: "MEDICAL" }, { date: "2023-08-15", event: "Diabetic retinopathy", type: "MEDICAL" }], medications: [{ name: "Insulin glargine", dosage: "20 units", frequency: "HS" }, { name: "Atorvastatin", dosage: "40mg", frequency: "QD" }] },
];

const INITIAL_AUDITS = [
  { id: "A-991", patientId: "PAT-001", type: "Prior auth · MRI lumbar spine", status: "FLAGGED", severity: "HIGH", timestamp: "14:22:01", approvalProb: 42, riskScore: 88 },
  { id: "A-992", patientId: "PAT-002", type: "Pharmacy · Antibiotics", status: "APPROVED", severity: "LOW", timestamp: "14:18:55", approvalProb: 98, riskScore: 12 },
  { id: "A-993", patientId: "PAT-003", type: "Prior auth · Insulin pump", status: "DENIED", severity: "CRITICAL", timestamp: "14:15:20", approvalProb: 15, riskScore: 95 },
  { id: "A-994", patientId: "PAT-001", type: "Imaging · CT scan, chest", status: "APPROVED", severity: "MEDIUM", timestamp: "14:10:03", approvalProb: 89, riskScore: 24 },
];

const PRECEDENTS: Record<string, Array<{ id: string; sim: number; outcome: string; cost: string; days: number; note: string }>> = {
  "A-991": [
    { id: "CA-811", sim: 94, outcome: "APPROVED", cost: "$1,200", days: 2, note: "Appealed with neuro deficit notes" },
    { id: "CA-702", sim: 88, outcome: "DENIED", cost: "$0", days: 14, note: "Failed auth code submission" },
    { id: "CA-665", sim: 75, outcome: "APPROVED", cost: "$1,150", days: 4, note: "Peer-to-peer success" }
  ],
  "A-993": [
    { id: "CA-442", sim: 98, outcome: "DENIED", cost: "$0", days: 1, note: "Strict trial requirement missing" },
    { id: "CA-319", sim: 82, outcome: "APPROVED", cost: "$4,500", days: 21, note: "Escalated to MD review" }
  ]
};

const POLICY_ROWS_BY_AUDIT: Record<string, Array<{ category: string; req: string; ext: string; confidence: number; match: boolean }>> = {
  "A-991": [
    { category: "Medical necessity", req: "Pre-existing condition documented", ext: "Hypertension on file", confidence: 97, match: true },
    { category: "Medical necessity", req: "Conservative treatment attempted", ext: "6 weeks PT logged", confidence: 92, match: true },
    { category: "Documentation", req: "Authorization code, field 4", ext: "NULL_VALUE", confidence: 100, match: false },
    { category: "Documentation", req: "Imaging within prior 12 months", ext: "Last imaging: 14 mo ago", confidence: 95, match: false },
  ],
  "A-992": [
    { category: "Medical necessity", req: "Diagnosis code matches formulary", ext: "J20.9 acute bronchitis", confidence: 99, match: true },
    { category: "Documentation", req: "Quantity within 30-day limit", ext: "1 inhaler, PRN", confidence: 100, match: true },
  ],
  "A-993": [
    { category: "Medical necessity", req: "A1C above threshold (>8.0)", ext: "Last A1C: 9.2", confidence: 99, match: true },
    { category: "Documentation", req: "Endocrinologist referral on file", ext: "NULL_VALUE", confidence: 100, match: false },
    { category: "Documentation", req: "Prior pump trial documented", ext: "No trial period on record", confidence: 90, match: false },
  ],
  "A-994": [
    { category: "Medical necessity", req: "Ordering physician credentialed", ext: "Dr. R. Okafor active", confidence: 100, match: true },
    { category: "Medical necessity", req: "Clinical justification attached", ext: "Rule-out PE", confidence: 94, match: true },
  ],
};

function shiftTime(dayOffset: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const INITIAL_SHIFTS = [
  { id: "S-101", role: "RN · ICU", unit: "Critical Care", startTime: shiftTime(0, 7), urgency: 95, basePay: 65, currentBid: 78, filled: false },
  { id: "S-102", role: "LPN · Med-Surg", unit: "Ward 4B", startTime: shiftTime(0, 19), urgency: 40, basePay: 45, currentBid: 48, filled: false },
  { id: "S-103", role: "RN · ER", unit: "Emergency", startTime: shiftTime(1, 7), urgency: 82, basePay: 72, currentBid: 85, filled: false },
];

const CANDIDATES = [
  { id: "C-01", name: "R. Alvarez, RN", rating: 4.8, minRate: 75, reliability: 98, tag: "Premium" },
  { id: "C-02", name: "T. Kowalski, RN", rating: 4.2, minRate: 68, reliability: 85, tag: "Standard" },
  { id: "C-03", name: "J. Park, RN", rating: 4.9, minRate: 80, reliability: 99, tag: "Premium" },
];

const INVENTORY_ITEMS = [
  { id: "INV-441", name: "Saline 500ml IV", category: "Fluids", currentStock: 450, maxStock: 2000, reorderPoint: 500, dailyBurn: 120, unitCost: 4.50, autoReorder: true, alert: "LOW" },
  { id: "INV-442", name: "N95 Respirators", category: "PPE", currentStock: 8200, maxStock: 10000, reorderPoint: 2000, dailyBurn: 400, unitCost: 1.10, autoReorder: true, alert: "OK" },
  { id: "INV-443", name: "Morphine 10mg Vial", category: "Pharmacy", currentStock: 45, maxStock: 500, reorderPoint: 100, dailyBurn: 25, unitCost: 15.00, autoReorder: false, alert: "CRITICAL" },
  { id: "INV-444", name: "Surgical Sutures (Mix)", category: "Med/Surg", currentStock: 320, maxStock: 1000, reorderPoint: 200, dailyBurn: 30, unitCost: 2.50, autoReorder: true, alert: "OK" },
];

const INITIAL_SHIPMENTS = [
  { id: "PO-441", itemId: "INV-441", status: "IN_TRANSIT", eta: "2h 15m", stage: 3 },
  { id: "PO-443", itemId: "INV-443", status: "ORDERED", eta: "12h 00m", stage: 0 },
];

const PIPELINE_STAGES = ["ORDERED", "VENDOR", "REROUTED", "TRANSIT", "DELIVERED"];

// ---------------------------------------------------------------------------
// BOOT SCREEN STUFF
// ---------------------------------------------------------------------------
const BOOT_LINES = [
  { text: "establishing secure session...", ok: false },
  { text: "handshake: TLS 1.3 negotiated", ok: true },
  { text: "authenticating usr_root_admin...", ok: false },
  { text: "biometric signature verified", ok: true },
  { text: "loading clinical reasoning models...", ok: true },
  { text: "syncing staffing marketplace feed...", ok: true },
  { text: "initializing logistics telemetry...", ok: true },
  { text: "compiling policy vector index...", ok: true },
  { text: "kernel ready.", ok: true },
];

const MODULE_OPTIONS = [
  { id: "CLINICAL", icon: Stethoscope, title: "Clinical PA", desc: "Prior-auth verification, predictive approval scoring, and precedent mapping.", accent: "indigo" },
  { id: "STAFFING", icon: Users, title: "Staffing Ops", desc: "Live shift negotiation marketplace with AI-driven bidding strategies.", accent: "amber" },
  { id: "LOGISTICS", icon: Package, title: "Logistics", desc: "Inventory burn-down forecasting, stockout risk analysis, and auto-rerouting.", accent: "sky" },
];

const ACCENT_STYLES: Record<string, { ring: string; icon: string; title: string }> = {
  indigo: { ring: "hover:ring-indigo-500/40 hover:shadow-indigo-500/10", icon: "text-indigo-600 bg-indigo-500/10", title: "group-hover:text-indigo-700" },
  amber: { ring: "hover:ring-amber-500/40 hover:shadow-amber-500/10", icon: "text-amber-600 bg-amber-500/10", title: "group-hover:text-amber-700" },
  sky: { ring: "hover:ring-sky-500/40 hover:shadow-sky-500/10", icon: "text-sky-600 bg-sky-500/10", title: "group-hover:text-sky-700" },
};

// ---------------------------------------------------------------------------
// SMALL UI PRIMITIVES
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  APPROVED: "text-emerald-600 border-emerald-600/30 bg-emerald-600/10",
  DENIED: "text-rose-600 border-rose-600/30 bg-rose-600/10",
  FLAGGED: "text-amber-600 border-amber-600/30 bg-amber-600/10",
  HIGH: "text-amber-600 border-amber-600/30 bg-amber-600/10",
  MEDIUM: "text-sky-600 border-sky-600/30 bg-sky-600/10",
  LOW: "text-emerald-600 border-emerald-600/30 bg-emerald-600/10",
  OK: "text-emerald-600 border-emerald-600/30 bg-emerald-600/10",
  CRITICAL: "text-rose-600 border-rose-600/40 bg-rose-600/10",
  ORDERED: "text-zinc-600 border-zinc-500/30 bg-zinc-500/10",
  REROUTED: "text-violet-600 border-violet-600/30 bg-violet-600/10",
  IN_TRANSIT: "text-sky-600 border-sky-600/30 bg-sky-600/10",
  DELIVERED: "text-emerald-600 border-emerald-600/30 bg-emerald-600/10",
};

function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span className={`px-1.5 py-0.5 border rounded-sm text-[9px] font-medium tracking-wide uppercase ${STATUS_STYLES[status] || "text-zinc-600 border-zinc-400 bg-zinc-100"} ${className}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function makeTrend(base: number, amplitude: number, points = 24, seed = 0) {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const wobble = Math.sin((i + seed) / 3.1) * amplitude + Math.sin((i + seed) / 1.6) * amplitude * 0.35;
    out.push(+(base + wobble).toFixed(1));
  }
  return out;
}

function Sparkline({ data, color = "#059669", width = 120, height = 30 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const padY = Math.max(2, height * 0.13);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const toXY = (v: number, i: number): [number, number] => [(i / (data.length - 1)) * width, padY + (1 - (v - min) / range) * (height - padY * 2)];
  const pts = data.map(toXY);

  let path = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    path += ` Q ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`;
  }
  const [lastX, lastY] = pts[pts.length - 1];
  path += ` T ${lastX},${lastY}`;

  const areaPath = `${path} L ${lastX},${height} L ${pts[0][0]},${height} Z`;
  const gradId = `spark-fill-${color.replace("#", "")}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible shrink-0 w-full max-w-[120px]">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LOGISTICS: FORECAST SVG
// ---------------------------------------------------------------------------
function ForecastChart({ current, max, reorder, burnRate, width = 300, height = 120 }: { current: number; max: number; reorder: number; burnRate: number; width?: number; height?: number }) {
  const daysToZero = current / burnRate;
  const daysToReorder = (current - reorder) / burnRate;
  const maxDays = Math.max(7, Math.ceil(daysToZero) + 1);
  
  const padY = 15, padX = 10;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const toY = (val: number) => padY + plotH - (val / max) * plotH;
  const toX = (day: number) => padX + (day / maxDays) * plotW;

  const yCurrent = toY(current);
  const yReorder = toY(reorder);
  const xReorder = toX(Math.max(0, daysToReorder));
  const xZero = toX(daysToZero);

  return (
    <div className="relative w-full h-full flex flex-col font-mono text-[9px] text-zinc-500">
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible preserve-3d">
        <line x1={padX} y1={yReorder} x2={width - padX} y2={yReorder} stroke="#d97706" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        <text x={padX + 2} y={yReorder - 4} fill="#d97706" opacity="0.7" fontSize="8">REORDER PT ({reorder})</text>
        <line x1={padX} y1={yCurrent} x2={xZero} y2={toY(0)} stroke="#4f46e5" strokeWidth="2" />
        <polygon points={`${padX},${toY(0)} ${padX},${yCurrent} ${xZero},${toY(0)}`} fill="url(#burnGrad)" opacity="0.2" />
        <line x1={xZero} y1={padY} x2={xZero} y2={toY(0)} stroke="#e11d48" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        <text x={xZero - 20} y={padY - 4} fill="#e11d48" opacity="0.9" fontSize="8">STOCKOUT</text>
        {daysToReorder > 0 && <circle cx={xReorder} cy={yReorder} r="3" fill="#d97706" className="animate-pulse" />}
        <defs>
          <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="1" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute bottom-0 left-[10px] right-[10px] flex justify-between pt-1 border-t border-black/[0.08]">
        <span>Today</span>
        <span>Day {Math.floor(maxDays / 2)}</span>
        <span>Day {maxDays}</span>
      </div>
    </div>
  );
}

function Toasts({ toasts, onDismiss }: { toasts: Array<{ id: number; message: string; kind: string }>; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-10 right-4 z-[100] flex flex-col gap-2 w-72 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`border rounded-sm px-3 py-2 text-[11px] shadow-lg backdrop-blur bg-white/95 animate-[fadein_.15s_ease-out] pointer-events-auto ${
            t.kind === "error" ? "border-rose-600/40 text-rose-600" : t.kind === "warn" ? "border-amber-600/40 text-amber-600" : "border-indigo-600/40 text-indigo-600"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="leading-snug">{t.message}</span>
            <button onClick={() => onDismiss(t.id)} className="text-zinc-400 hover:text-zinc-600 shrink-0">
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEGOTIATION BACKEND CLIENT
// ---------------------------------------------------------------------------
function simulateNegotiationTurn({ candidate, kind, maxBid, strategy }: { candidate: any; kind: string; maxBid: number; strategy: string }) {
  if (kind === "bid") {
    let willFill = false;
    if (strategy === "Aggressive" && maxBid >= candidate.minRate) willFill = true;
    if (strategy === "Balanced" && maxBid >= candidate.minRate + 2) willFill = true;
    if (strategy === "Accommodating" && maxBid >= candidate.minRate - 2) willFill = true;

    return {
      nurse: candidate.name,
      willFill,
      reply: willFill ? `Works for me. Strategy [${strategy}] aligned. I'll take $${maxBid}/hr.` : `With a [${strategy}] approach, $${maxBid} is still too low for me.`,
      sentiment: willFill ? "POSITIVE" : "NEGATIVE"
    };
  }
  return {
    nurse: candidate.name,
    willFill: null,
    reply: `Noted. Re-calibrating strategy to ${strategy}.`,
    sentiment: "NEUTRAL"
  };
}

async function callNegotiationApi(payload: any) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(NEGOTIATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}

<<<<<<< HEAD
=======
async function callJustifyApi(payload: any) {
  const controller = new AbortController();
  // Letter drafting is a slower LLM call than a negotiation ping, so it gets a longer timeout.
  const timer = setTimeout(() => controller.abort(), JUSTIFY_TIMEOUT_MS);
  try {
    const res = await fetch(JUSTIFY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}

>>>>>>> origin/master
// ---------------------------------------------------------------------------
// MAIN KERNEL Component
// ---------------------------------------------------------------------------
function ReactiveDotField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf: number;
    let particles: Array<{ baseX: number; baseY: number; x: number; y: number; r: number; twinkleSeed: number }> = [];
    let width = 0, height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const buildParticles = () => {
      const spacing = 46;
      particles = [];
      for (let y = spacing / 2; y < height; y += spacing) {
        for (let x = spacing / 2; x < width; x += spacing) {
          const jitterX = (Math.random() - 0.5) * 14;
          const jitterY = (Math.random() - 0.5) * 14;
          particles.push({
            baseX: x + jitterX, baseY: y + jitterY,
            x: x + jitterX, y: y + jitterY,
            r: Math.random() * 0.6 + 0.6,
            twinkleSeed: Math.random() * Math.PI * 2,
          });
        }
      }
    };

    const resize = () => {
      if (!canvas.parentElement) return;
      width = canvas.parentElement.clientWidth;
      height = canvas.parentElement.clientHeight;
      if (!width || !height) return;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    };

    const radius = 130, repel = 22;
    let t = 0;

    const tick = () => {
      t += 0.01;
      ctx.clearRect(0, 0, width, height);
      const { x: mx, y: my } = mouseRef.current;

      for (const p of particles) {
        const dx = p.baseX - mx, dy = p.baseY - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let targetX = p.baseX, targetY = p.baseY;

        if (dist < radius) {
          const force = (1 - dist / radius) * repel;
          const angle = Math.atan2(dy, dx);
          targetX = p.baseX + Math.cos(angle) * force;
          targetY = p.baseY + Math.sin(angle) * force;
        }

        p.x += (targetX - p.x) * 0.12;
        p.y += (targetY - p.y) * 0.12;

        const twinkle = 0.35 + Math.sin(t + p.twinkleSeed) * 0.15;
        const proximity = Math.max(0, 1 - dist / radius);
        const alpha = Math.min(0.85, twinkle + proximity * 0.5);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + proximity * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(79, 70, 229, ${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    const handlePointerMove = (e: MouseEvent) => {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches || e.touches.length === 0 || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const touch = e.touches[0];
      mouseRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    const handleLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };

    const ro = new ResizeObserver(() => resize());
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resize(); requestAnimationFrame(resize); tick();

    const handleVisibility = () => { document.hidden ? cancelAnimationFrame(raf) : tick(); };

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleLeave, { passive: true });
    window.addEventListener("mouseleave", handleLeave);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleLeave);
      window.removeEventListener("mouseleave", handleLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return <div className="absolute inset-0 pointer-events-none overflow-hidden"><canvas ref={canvasRef} className="absolute inset-0" /></div>;
}

type ThreadMessage = {
  sender: string;
  msg: string;
  kind?: string;
  sentiment?: string;
};

function buildThread(shift: typeof INITIAL_SHIFTS[0], candidate: typeof CANDIDATES[0]): ThreadMessage[] {
  return [
    { sender: "SYSTEM", msg: `Shift deficit identified: ${shift.id} — ${shift.role}, ${shift.unit}.`, kind: "info" },
    { sender: "AGENT", msg: `Opening bid sent to ${candidate.name} at $${shift.basePay}/hr.`, kind: "action" },
    { sender: candidate.name, msg: `That's under my contract minimum right now.`, kind: "info", sentiment: "NEGATIVE" },
    { sender: "AGENT", msg: `Pending human authorization — awaiting bid/strategy approval.`, kind: "info" },
  ];
}

export default function OpsPilotKernel() {
  const [mounted, setMounted] = useState(false);
  const [activeModule, setActiveModule] = useState("CLINICAL");
  const [time, setTime] = useState(new Date());

  useEffect(() => { setMounted(true); }, []);

  // Toasts
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: string }>>([]);
  const toastId = useRef(0);
  const pushToast = useCallback((message: string, kind = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  // ---------------- AUTHENTICATION & BOOT ----------------
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authMode, setAuthMode] = useState("LOGIN");
  const [authForm, setAuthForm] = useState({ email: "admin@opspilot.internal", password: "••••••••", confirm: "••••••••" });
  const [authError, setAuthError] = useState("");

  const [booted, setBooted] = useState(true);
  const [bootLineCount, setBootLineCount] = useState(BOOT_LINES.length);
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsAuthenticated(true);
    setBooted(true);
  };

  useEffect(() => {
    // Only run boot sequence if authenticated and not already booted
    if (!isAuthenticated || booted) return;
    if (bootLineCount < BOOT_LINES.length) {
      const t = setTimeout(() => setBootLineCount((c) => c + 1), bootLineCount === 0 ? 550 : 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPickerVisible(true), 300);
    return () => clearTimeout(t);
  }, [bootLineCount, booted, isAuthenticated]);

  const skipBoot = () => { 
    if (isAuthenticated) {
      setBootLineCount(BOOT_LINES.length); 
      setPickerVisible(true); 
    }
  };
  
  const enterModule = (id: string) => { setActiveModule(id); setBooted(true); };
  const returnToPicker = () => { setBooted(false); setBootLineCount(BOOT_LINES.length); setPickerVisible(true); };

  // ---------------- CLINICAL ----------------
  const [audits, setAudits] = useState(INITIAL_AUDITS);
  const [selectedAuditId, setSelectedAuditId] = useState(INITIAL_AUDITS[0].id);
  const selectedAudit = useMemo(() => audits.find((a) => a.id === selectedAuditId) ?? audits[0], [audits, selectedAuditId]);
  const [selectedPatientId, setSelectedPatientId] = useState(selectedAudit.patientId);
  const selectedPatient = useMemo(() => PATIENTS.find((p) => p.id === selectedPatientId) || PATIENTS[0], [selectedPatientId]);
  
  const auditPrecedents = PRECEDENTS[selectedAudit.id] || [];
  const [clinicalTab, setClinicalTab] = useState("POLICY");

  const vitalTrends = useMemo(() => {
    const v = selectedPatient.vitals;
    const systolic = parseInt(v.bp, 10) || 120;
    const seed = selectedPatientId.charCodeAt(selectedPatientId.length - 1);
    return {
      bp: makeTrend(systolic, 3.5, 24, seed),
      spo2: makeTrend(v.spo2, 1, 24, seed + 5),
      temp: makeTrend(v.temp, 0.3, 24, seed + 9),
    };
  }, [selectedPatient, selectedPatientId]);

  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealSent, setAppealSent] = useState(false);
<<<<<<< HEAD
=======
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealSource, setAppealSource] = useState<"backend" | "local">("local");
>>>>>>> origin/master

  const selectAudit = (audit: typeof INITIAL_AUDITS[0]) => {
    setSelectedAuditId(audit.id);
    setSelectedPatientId(audit.patientId);
    setClinicalTab("POLICY");
  };

  const forceOverride = () => {
    if (selectedAudit.status === "APPROVED") return pushToast(`${selectedAudit.id} is already approved.`, "warn");
    setAudits((prev) => prev.map((a) => (a.id === selectedAudit.id ? { ...a, status: "APPROVED" } : a)));
    pushToast(`${selectedAudit.id} force-approved by USR_ROOT.`, "info");
  };

  const requestPeerReview = () => pushToast(`Peer-to-peer review requested for ${selectedAudit.id}.`, "info");

<<<<<<< HEAD
  const openAppeal = () => {
    setAppealSent(false);
    setAppealText(
      `RE: Appeal — ${selectedAudit.type} (${selectedAudit.id})\nPatient: ${selectedPatient.name} · DOB ${selectedPatient.dob}\n\nThis request meets medical-necessity criteria based on the documented clinical history` +
        (selectedPatient.history[0] ? ` (${selectedPatient.history[0].event}, ${selectedPatient.history[0].date})` : "") +
        `. We ask that the denial be reconsidered in light of the attached chart notes and current vitals (BP ${selectedPatient.vitals.bp}, SpO2 ${selectedPatient.vitals.spo2}%).`
    );
    setAppealOpen(true);
=======
  const buildLocalAppealDraft = () =>
    `RE: Appeal — ${selectedAudit.type} (${selectedAudit.id})\nPatient: ${selectedPatient.name} · DOB ${selectedPatient.dob}\n\nThis request meets medical-necessity criteria based on the documented clinical history` +
    (selectedPatient.history[0] ? ` (${selectedPatient.history[0].event}, ${selectedPatient.history[0].date})` : "") +
    `. We ask that the denial be reconsidered in light of the attached chart notes and current vitals (BP ${selectedPatient.vitals.bp}, SpO2 ${selectedPatient.vitals.spo2}%).`;

  const openAppeal = async () => {
    setAppealSent(false);
    setAppealOpen(true);
    setAppealLoading(true);
    setAppealText("Drafting letter from clinical reasoning agent...");

    // The letter argues for the first unmet policy criterion on this audit.
    const policyRows = POLICY_ROWS_BY_AUDIT[selectedAudit.id] ?? [];
    const unmetRow = policyRows.find((r) => !r.match);

    const patientChartExcerpt =
      `Patient: ${selectedPatient.name}, DOB ${selectedPatient.dob}, ${selectedPatient.gender}. ` +
      `Vitals: BP ${selectedPatient.vitals.bp}, SpO2 ${selectedPatient.vitals.spo2}%, Temp ${selectedPatient.vitals.temp}°F. ` +
      `History: ${selectedPatient.history.map((h) => `${h.event} (${h.date})`).join("; ")}. ` +
      `Medications: ${selectedPatient.medications.map((m) => `${m.name} ${m.dosage} ${m.frequency}`).join("; ")}.`;

    const payload = {
      patient_chart_excerpt: patientChartExcerpt,
      unmet_criterion: unmetRow ? unmetRow.req : selectedAudit.type,
      policy_context: unmetRow ? `${unmetRow.category}: ${unmetRow.req} — chart shows "${unmetRow.ext}"` : "General policy criteria for this audit type.",
    };

    const result: any = await callJustifyApi(payload);
    setAppealLoading(false);

    if (result.ok && result.data && result.data.draft_letter) {
      setAppealSource("backend");
      setAppealText(result.data.draft_letter);
    } else {
      setAppealSource("local");
      setAppealText(buildLocalAppealDraft());
      pushToast("Justification backend unavailable — showing local draft instead.", "warn");
    }
>>>>>>> origin/master
  };

  const sendAppeal = () => {
    setAppealSent(true);
    setAudits((prev) => prev.map((a) => (a.id === selectedAudit.id ? { ...a, status: "FLAGGED" } : a)));
    pushToast(`Appeal filed for ${selectedAudit.id}. Payer response expected within 72h.`, "info");
  };

  // ---------------- STAFFING ----------------
  const [shifts, setShifts] = useState(INITIAL_SHIFTS);
  const [selectedShiftId, setSelectedShiftId] = useState(INITIAL_SHIFTS[0].id);
  const selectedShift = useMemo(() => shifts.find((s) => s.id === selectedShiftId) || shifts[0], [shifts, selectedShiftId]);
  
  const [selectedCandidateId, setSelectedCandidateId] = useState(CANDIDATES[0].id);
  const selectedCandidate = useMemo(() => CANDIDATES.find(c => c.id === selectedCandidateId) || CANDIDATES[0], [selectedCandidateId]);
  const [negStrategy, setNegStrategy] = useState("Balanced");
  const [maxBid, setMaxBid] = useState(selectedShift.currentBid);
  const [thread, setThread] = useState<ThreadMessage[]>(() => buildThread(INITIAL_SHIFTS[0], CANDIDATES[0]));
  const [commandInput, setCommandInput] = useState("");
  const [negotiationBusy, setNegotiationBusy] = useState(false);
  const [backendMode, setBackendMode] = useState("sim");
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const selectShift = (shift: typeof INITIAL_SHIFTS[0]) => {
    setSelectedShiftId(shift.id);
    setMaxBid(shift.currentBid);
    setThread(buildThread(shift, selectedCandidate));
  };

  const selectCandidate = (c: typeof CANDIDATES[0]) => {
    setSelectedCandidateId(c.id);
    setThread(buildThread(selectedShift, c));
  }

  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [thread]);

  const runNegotiationTurn = async ({ kind, message }: { kind: string; message?: string | null }) => {
    setNegotiationBusy(true);
    const payload = {
      shiftId: selectedShift.id, role: selectedShift.role, unit: selectedShift.unit,
      basePay: selectedShift.basePay, currentBid: selectedShift.currentBid,
      maxBid, strategy: negStrategy, candidate: selectedCandidate.name, kind, message: message || null,
    };
    const result = await callNegotiationApi(payload);
    setNegotiationBusy(false);
    if (result.ok) {
      setBackendMode("live");
      return result.data;
    }
    setBackendMode("sim");
    return simulateNegotiationTurn({ candidate: selectedCandidate, kind, maxBid, strategy: negStrategy });
  };

  const executeBid = async () => {
    if (selectedShift.filled) return pushToast(`${selectedShift.id} is already filled.`, "warn");
    
    setThread((t) => [...t, { sender: "AGENT", msg: `Executing bid at $${maxBid}/hr [Strategy: ${negStrategy}]`, kind: "action" }]);
    const { nurse, willFill, reply, sentiment } = await runNegotiationTurn({ kind: "bid" });
    
    setThread((t) => [...t, { sender: nurse, msg: reply, kind: "info", sentiment }]);
    if (willFill) {
      setShifts((prev) => prev.map((s) => (s.id === selectedShift.id ? { ...s, filled: true, currentBid: maxBid, urgency: 0 } : s)));
      pushToast(`${selectedShift.id} filled at $${maxBid}/hr by ${nurse}.`, "info");
    } else {
      pushToast(`Bid rejected. Adjust Strategy or Max Bid.`, "warn");
    }
  };

  const sendCommand = async () => {
    const text = commandInput.trim();
    if (!text) return;
    setThread((t) => [...t, { sender: "USR_ROOT", msg: text, kind: "action" }]);
    setCommandInput("");
    const { reply } = await runNegotiationTurn({ kind: "message", message: text });
    setThread((t) => [...t, { sender: "AGENT", msg: reply, kind: "info" }]);
  };

  // ---------------- LOGISTICS ----------------
  const [inventory, setInventory] = useState(INVENTORY_ITEMS);
  const [invFilter, setInvFilter] = useState("ALL"); 
  const [selectedInvId, setSelectedInvId] = useState(INVENTORY_ITEMS[0].id);
  const selectedInv = useMemo(() => inventory.find(i => i.id === selectedInvId) || inventory[0], [inventory, selectedInvId]);

  const [shipments, setShipments] = useState(INITIAL_SHIPMENTS);
  const activeOrders = useMemo(() => shipments.filter(s => s.itemId === selectedInvId), [shipments, selectedInvId]);

  const toggleAutoReorder = (id: string) => {
    setInventory(prev => prev.map(item => item.id === id ? { ...item, autoReorder: !item.autoReorder } : item));
    pushToast(`Auto-reorder policy updated for ${id}.`, "info");
  };

  const advanceShipment = (poId: string) => {
    setShipments((prev) =>
      prev.map((p) => {
        if (p.id !== poId) return p;
        const nextStage = p.stage + 1;
        const nextStatus = nextStage >= 4 ? "DELIVERED" : nextStage === 2 ? "REROUTED" : "IN_TRANSIT";
        if(nextStage === 4) pushToast(`${p.id} delivered. Stock updated.`, "info");
        return { ...p, stage: nextStage, status: nextStatus, eta: nextStage >= 4 ? "Completed" : p.eta };
      })
    );
  };

  const filteredInv = useMemo(() => {
    if(invFilter === "ALL") return inventory;
    if(invFilter === "CRITICAL") return inventory.filter(i => i.alert === "CRITICAL" || i.alert === "LOW");
    return inventory.filter(i => i.category === invFilter);
  }, [inventory, invFilter]);

  // ---------------- KERNEL ----------------
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState("ALL");
  const [streaming, setStreaming] = useState(true);
  const logIdRef = useRef(0);

  useEffect(() => {
    const clockInterval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    if (!streaming || !isAuthenticated) return;
    const modules = ["AGENT_RAG", "NEGOTIATOR", "LOGISTICS", "KERNEL"];
    const messages = [
      "Process affinity rebalanced across worker pool",
      "Cache warm for prior-auth policy index",
      "Nurse marketplace heartbeat received",
      "Vendor webhook retried after timeout",
      "Audit queue re-ranked by severity",
      "Negotiation thread checkpointed",
      "Shipment ETA recalculated from carrier feed",
      "Token budget within nominal range",
    ];
    const interval = setInterval(() => {
      const level = Math.random() < 0.1 ? "ERROR" : Math.random() < 0.5 ? "ACTION" : "INFO";
      const entry = {
        id: ++logIdRef.current,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        module: modules[Math.floor(Math.random() * modules.length)],
        message: messages[Math.floor(Math.random() * messages.length)],
        level,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 200));
    }, 2200);
    return () => clearInterval(interval);
  }, [streaming, isAuthenticated]);

  const filteredLogs = logs.filter((l) => logFilter === "ALL" || l.level === logFilter);

  // ---------------------------------------------------------------------------
  // We use this dict to safely handle swapping text classes without conflicts
  // ---------------------------------------------------------------------------
  const cn = {
    bgApp: "bg-[#F3EBDD]",
    bgPanel: "bg-white",
    bgPanelFade: "bg-white/80",
    bgMuted: "bg-black/[0.04]",
    bgInput: "bg-[#F3EBDD]",
    bgHover: "hover:bg-black/[0.06]",
    textMain: "text-zinc-900",
    textMuted: "text-zinc-500",
    textSub: "text-zinc-700",
    borderMain: "border-black/[0.12]",
    borderLight: "border-black/[0.08]"
  };

  return (
    <div className={`h-screen w-full ${cn.bgApp} ${cn.textMain} font-sans flex overflow-hidden text-[13px] selection:bg-indigo-500/30 selection:text-indigo-900 relative`}>
      <ReactiveDotField />
      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {/* BOOT / AUTH / LANDING */}
      {!booted && (
        <div className={`fixed inset-0 z-[200] ${cn.bgApp} flex flex-col items-center justify-center px-6 cursor-pointer select-none overflow-y-auto py-10`} onClick={!pickerVisible ? skipBoot : undefined}>
          
          <div className="absolute inset-0 opacity-[0.15] pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(79,70,229,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(79,70,229,0.2) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />
          <div className="absolute inset-x-0 h-24 pointer-events-none bg-gradient-to-b from-transparent via-indigo-500/[0.06] to-transparent" style={{ animation: "scanSweep 4s linear infinite" }} />
          
          <div className="hidden sm:flex absolute top-10 left-14 flex-col gap-1 font-mono text-[9px] text-zinc-500 pointer-events-none" style={{ animation: "fadein 0.8s ease-out 0.3s both" }}>
            <span>NODE&nbsp;&nbsp;us-east-1c</span><span>SEC&nbsp;&nbsp;&nbsp;&nbsp;AES-256-GCM</span>
          </div>
          <div className="hidden sm:flex absolute top-10 right-14 flex-col gap-1 font-mono text-[9px] text-zinc-500 text-right pointer-events-none" style={{ animation: "fadein 0.8s ease-out 0.3s both" }}>
            <span className="flex items-center gap-1.5 justify-end"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LINK ESTABLISHED</span>
            <span>BUILD&nbsp;2026.09.09</span>
          </div>

          <div className="relative flex flex-col items-center shrink-0">
            <div className="absolute -inset-x-10 -inset-y-6 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 sm:w-56 sm:h-56 rounded-full border border-indigo-600/20" style={{ animation: "pulseRing 2.4s ease-out infinite" }} />
            </div>
            <div className="flex gap-[2px] sm:gap-1 relative">
              {"OPSPILOT".split("").map((ch, i) => (
                <span key={i} className={`text-4xl sm:text-6xl font-bold ${cn.textMain} tracking-tight inline-block`} style={{ animation: `bootLetter 0.5s ease-out ${i * 0.05}s both` }}>{ch}</span>
              ))}
            </div>
            <div className="mt-3 text-[10px] sm:text-xs tracking-[0.5em] text-indigo-700 font-semibold relative" style={{ animation: `fadein 0.6s ease-out 0.8s both` }}>
              HOSPITAL COMMAND CENTRE
            </div>
            <div className="mt-4 h-[1px] w-24 sm:w-32 bg-indigo-600/50 origin-left" style={{ animation: `bootLine 0.8s ease-out 1s both` }} />
          </div>

          {/* AUTHENTICATION GATEWAY */}
          {!isAuthenticated ? (
            <div className={`mt-8 w-full max-w-sm shrink-0 relative ${cn.bgPanelFade} backdrop-blur-md p-6 border ${cn.borderMain} rounded-xl shadow-xl shadow-zinc-200/50`} style={{ animation: `fadein 0.6s ease-out 1.2s both` }} onClick={(e) => e.stopPropagation()}>
              <div className={`flex border-b ${cn.borderLight} mb-6`}>
                <button onClick={() => {setAuthMode("LOGIN"); setAuthError("");}} className={`flex-1 pb-2.5 text-[10.5px] font-mono tracking-widest transition-colors ${authMode==="LOGIN" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-zinc-400 hover:text-zinc-600"}`}>AUTHORIZE</button>
                <button onClick={() => {setAuthMode("SIGNUP"); setAuthError("");}} className={`flex-1 pb-2.5 text-[10.5px] font-mono tracking-widest transition-colors ${authMode==="SIGNUP" ? "text-indigo-600 border-b-2 border-indigo-600" : "text-zinc-400 hover:text-zinc-600"}`}>REQUEST ACCESS</button>
              </div>

              <form onSubmit={handleAuth} className="flex flex-col gap-4">
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input 
                    type="text" 
                    placeholder="SYS_ID // EMAIL" 
                    value={authForm.email}
                    onChange={(e) => setAuthForm({...authForm, email: e.target.value})}
                    className={`w-full h-11 ${cn.bgInput} border ${cn.borderMain} rounded-lg pl-9 pr-3 text-[11px] ${cn.textMain} font-mono tracking-wide placeholder:text-zinc-400 focus:outline-none focus:border-indigo-600/50 focus:ring-1 focus:ring-indigo-600/20 transition-all`}
                  />
                </div>
                
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input 
                    type="password" 
                    placeholder="ACCESS_TOKEN // PASSWORD" 
                    value={authForm.password}
                    onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                    className={`w-full h-11 ${cn.bgInput} border ${cn.borderMain} rounded-lg pl-9 pr-3 text-[11px] ${cn.textMain} font-mono tracking-wide placeholder:text-zinc-400 focus:outline-none focus:border-indigo-600/50 focus:ring-1 focus:ring-indigo-600/20 transition-all`}
                  />
                </div>

                {authMode === "SIGNUP" && (
                  <div className="relative" style={{ animation: "fadein 0.3s ease-out both" }}>
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="password" 
                      placeholder="CONFIRM ACCESS_TOKEN" 
                      value={authForm.confirm}
                      onChange={(e) => setAuthForm({...authForm, confirm: e.target.value})}
                      className={`w-full h-11 ${cn.bgInput} border ${cn.borderMain} rounded-lg pl-9 pr-3 text-[11px] ${cn.textMain} font-mono tracking-wide placeholder:text-zinc-400 focus:outline-none focus:border-indigo-600/50 focus:ring-1 focus:ring-indigo-600/20 transition-all`}
                    />
                  </div>
                )}

                {authError && (
                  <div className="text-rose-600 text-[9.5px] font-mono text-center tracking-widest uppercase animate-pulse border border-rose-600/20 bg-rose-600/10 py-1.5 rounded">
                    {authError}
                  </div>
                )}

                <button type="submit" className={`mt-2 w-full h-11 bg-indigo-100 border border-indigo-600/30 text-indigo-700 font-mono text-[11px] font-semibold tracking-widest rounded-lg hover:bg-indigo-200 transition-all active:scale-[0.98]`}>
                  {authMode === "LOGIN" ? "INITIATE HANDSHAKE" : "GENERATE CREDENTIALS"}
                </button>
              </form>
            </div>
          ) : !pickerVisible ? (
            <div className="mt-10 sm:mt-12 w-full max-w-md shrink-0 relative">
              <div className="font-mono text-[10.5px] sm:text-[11px] text-zinc-500 space-y-1.5 min-h-[180px]">
                {BOOT_LINES.slice(0, bootLineCount).map((line, i) => (
                  <div key={i} className="flex gap-2 items-center" style={{ animation: "fadein 0.25s ease-out both" }}>
                    <span className={line.ok ? "text-emerald-600" : "text-indigo-600"}>{line.ok ? "✓" : "›"}</span>
                    <span className={i === BOOT_LINES.length - 1 ? "text-emerald-600 font-semibold" : "text-zinc-600"}>{line.text}</span>
                  </div>
                ))}
                {bootLineCount < BOOT_LINES.length && (
                  <div className="flex gap-2 items-center text-zinc-400">
                    <span className="text-indigo-600">›</span><span className="inline-block w-1.5 h-3 bg-indigo-600 animate-pulse" />
                  </div>
                )}
              </div>
              <div className={`mt-4 h-[2px] w-full ${cn.bgMuted} rounded-full overflow-hidden`}>
                <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 transition-all duration-500 ease-out" style={{ width: `${(bootLineCount / BOOT_LINES.length) * 100}%` }} />
              </div>
            </div>
          ) : (
            <div className="mt-10 sm:mt-12 w-full max-w-4xl shrink-0 relative" style={{ animation: `fadein 0.6s ease-out both` }} onClick={(e) => e.stopPropagation()}>
              <div className="text-center text-[10.5px] tracking-widest text-zinc-500 mb-6 uppercase flex items-center justify-center gap-2">
                <span className="w-6 h-[1px] bg-zinc-300" /> Select operating module <span className="w-6 h-[1px] bg-zinc-300" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {MODULE_OPTIONS.map((m, i) => {
                  const Icon = m.icon;
                  const accent = ACCENT_STYLES[m.accent];
                  return (
                    <button key={m.id} onClick={() => enterModule(m.id)} style={{ animation: `fadein 0.5s ease-out ${0.1 + i * 0.08}s both` }} className={`group relative overflow-hidden text-left p-5 rounded-xl border ${cn.borderLight} ${cn.bgPanel} transition-all hover:ring-1 hover:-translate-y-0.5 ${accent.ring} shadow-xl shadow-zinc-200/50`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-4 ${accent.icon}`}><Icon size={18} /></div>
                      <div className={`text-[13px] font-semibold ${cn.textMain} mb-1.5 transition-colors ${accent.title}`}>{m.title}</div>
                      <div className="text-[10.5px] text-zinc-500 leading-relaxed mb-4">{m.desc}</div>
                      <div className={`text-[10px] font-medium ${cn.textSub} transition-colors flex items-center gap-1`}>Enter <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" /></div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LEFT ICON RAIL */}
      <aside className={`hidden md:flex w-[52px] flex-col items-center py-4 gap-6 ${cn.bgPanelFade} backdrop-blur-md z-50 relative border-r ${cn.borderLight}`}>
        <button onClick={returnToPicker} className="w-8 h-8 bg-indigo-600/90 hover:bg-indigo-700 rounded flex items-center justify-center text-white shrink-0 transition-colors"><Cpu size={17} /></button>
        <nav className="flex flex-col gap-3">
          {[{ id: "CLINICAL", icon: Stethoscope }, { id: "STAFFING", icon: Users }, { id: "LOGISTICS", icon: Package }, { id: "KERNEL", icon: Terminal }].map(({ id, icon: Icon }) => (
            <button key={id} onClick={() => setActiveModule(id)} className={`p-2.5 rounded-lg transition-all ${activeModule === id ? "text-indigo-700 bg-indigo-600/10 ring-1 ring-indigo-600/30" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"}`}>
              <Icon size={19} />
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-4 text-zinc-400">
          <Settings size={17} className="cursor-pointer hover:text-zinc-700 transition-colors" />
          <Bell size={17} className="cursor-pointer hover:text-zinc-700 transition-colors" onClick={() => pushToast("No alerts", "info")} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden z-10 bg-transparent">
        {/* TOP TELEMETRY BAR */}
        <header className={`h-8 ${cn.bgPanelFade} backdrop-blur-md flex items-center justify-between px-4 text-[10px] z-40 shrink-0 border-b ${cn.borderLight}`}>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span className="text-emerald-700 font-semibold tracking-wide hidden sm:inline">KERNEL ACTIVE</span></div>
            <div className="hidden md:flex gap-4 text-zinc-500 font-mono">
              <span>lat <span className="text-zinc-900">14ms</span></span>
              <span>bw <span className="text-zinc-900">4.2 GB/s</span></span>
              <span>mod <span className="text-indigo-700 uppercase">{activeModule}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono">
            <div className="text-zinc-500">{mounted ? time.toLocaleTimeString() : "--:--:--"}</div>
            <div className="flex items-center gap-1.5 text-indigo-700"><Fingerprint size={11} /><span className="hidden sm:inline">usr_root</span></div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 md:p-4 pb-20 md:pb-4">
          
          {/* ============================ CLINICAL ============================ */}
          {activeModule === "CLINICAL" && (
            <div className="flex flex-col md:grid md:grid-cols-12 gap-4 min-h-full">
              {/* Audit queue */}
              <div className={`md:col-span-3 flex flex-col shrink-0 ${cn.bgPanelFade} border ${cn.borderLight} rounded-xl overflow-hidden shadow-xl shadow-zinc-200/50`}>
                <div className={`p-3 flex items-center justify-between border-b ${cn.borderLight} ${cn.bgMuted}`}>
                  <span className="text-[11px] font-semibold text-zinc-800 flex items-center gap-2"><ShieldAlert size={13} className="text-amber-600" /> Audit queue</span>
                  <Filter size={12} className="text-zinc-400 cursor-pointer hover:text-zinc-600" />
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                  {audits.map((audit) => (
                    <button
                      key={audit.id} onClick={() => selectAudit(audit)}
                      className={`w-full text-left p-3 rounded-lg transition-all border ${selectedAuditId === audit.id ? "bg-indigo-50 border-indigo-600/30" : "bg-transparent border-transparent hover:bg-black/[0.03]"}`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <StatusBadge status={audit.status} />
                        <span className="text-[9px] text-zinc-500 font-mono">{audit.id}</span>
                      </div>
                      <div className={`text-[11px] font-medium mb-0.5 leading-snug ${cn.textMain}`}>{audit.type}</div>
                      <div className="flex justify-between items-end mt-2">
                        <div className="text-[9px] text-zinc-500">{PATIENTS.find((p) => p.id === audit.patientId)?.name}</div>
                        <div className={`text-[9px] flex items-center gap-1 ${audit.riskScore > 80 ? "text-rose-600" : "text-zinc-500"}`}>
                          <Activity size={10} /> Risk {audit.riskScore}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* EHR / Precedent Grid */}
              <div className="md:col-span-9 flex flex-col lg:grid lg:grid-cols-3 lg:grid-rows-[auto_1fr] gap-4">
                
                {/* Top Row: Identity & Mini-tabs */}
                <div className="lg:col-span-3 flex flex-col md:flex-row gap-4 h-auto">
                  <div className={`flex-1 p-4 border ${cn.borderLight} rounded-xl ${cn.bgPanelFade} shadow-xl shadow-zinc-200/50 flex flex-col justify-between`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-lg font-semibold text-zinc-900 tracking-tight">{selectedPatient.name}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">DOB {selectedPatient.dob} · {selectedPatient.gender} · {selectedPatient.id}</div>
                      </div>
                      <div className="text-[9px] text-emerald-700 font-semibold border border-emerald-600/30 bg-emerald-600/10 px-2 py-1 rounded">STABLE</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[{ label: "HR", value: selectedPatient.vitals.hr.at(-1), trend: selectedPatient.vitals.hr, color: "#059669" },
                        { label: "BP", value: selectedPatient.vitals.bp, trend: vitalTrends.bp, color: "#4f46e5" },
                        { label: "SpO2", value: selectedPatient.vitals.spo2+"%", trend: vitalTrends.spo2, color: "#0284c7" },
                        { label: "Temp", value: selectedPatient.vitals.temp+"°", trend: vitalTrends.temp, color: "#d97706" }].map((v) => (
                        <div key={v.label} className={`p-2 border ${cn.borderLight} rounded-lg ${cn.bgMuted} flex flex-col gap-1`}>
                          <div className="text-[9px] text-zinc-500">{v.label}</div>
                          <div className="text-sm font-semibold text-zinc-800">{v.value}</div>
                          <Sparkline data={v.trend} color={v.color} width={60} height={16} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Auth Likelihood / Quick Actions */}
                  <div className={`w-full md:w-64 p-4 border ${cn.borderLight} rounded-xl ${cn.bgPanelFade} shadow-xl shadow-zinc-200/50 flex flex-col`}>
                    <div className="text-[10px] font-semibold text-zinc-600 mb-3 flex items-center gap-1.5"><Bot size={12}/> Predictor Model</div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e4e4e7" strokeWidth="3" />
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={selectedAudit.approvalProb > 50 ? "#059669" : "#e11d48"} strokeWidth="3" strokeDasharray={`${selectedAudit.approvalProb}, 100`} />
                        </svg>
                        <span className="absolute text-[11px] font-bold text-zinc-800">{selectedAudit.approvalProb}%</span>
                      </div>
                      <div className="text-[9px] text-zinc-500 leading-tight">Likelihood of approval on primary submission based on historical payer data.</div>
                    </div>
                    <div className="mt-auto flex gap-2">
                      <button onClick={forceOverride} className="flex-1 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[10px] rounded-md transition-colors font-medium border border-zinc-200">Override</button>
                      <button onClick={openAppeal} className="flex-1 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-600/30 text-[10px] rounded-md transition-colors font-medium">Draft Appeal</button>
                    </div>
                  </div>
                </div>

                {/* Main Content Area (Tabs) */}
                <div className={`lg:col-span-3 flex flex-col border ${cn.borderLight} rounded-xl ${cn.bgPanelFade} shadow-xl shadow-zinc-200/50 min-h-[300px]`}>
                  <div className={`flex border-b ${cn.borderLight} ${cn.bgMuted}`}>
                    <button onClick={() => setClinicalTab("POLICY")} className={`px-4 py-2.5 text-[10px] font-semibold tracking-wider transition-colors ${clinicalTab==="POLICY" ? "text-indigo-700 border-b-2 border-indigo-600" : "text-zinc-500 hover:text-zinc-800"}`}>POLICY MATCH</button>
                    <button onClick={() => setClinicalTab("PRECEDENT")} className={`px-4 py-2.5 text-[10px] font-semibold tracking-wider transition-colors ${clinicalTab==="PRECEDENT" ? "text-indigo-700 border-b-2 border-indigo-600" : "text-zinc-500 hover:text-zinc-800"}`}>PRECEDENT CASES</button>
                  </div>
                  
                  {clinicalTab === "POLICY" && (
                    <div className="flex-1 overflow-x-auto p-2">
                      <table className="w-full text-[10px] text-left">
                        <thead>
                          <tr className={`text-zinc-500 border-b ${cn.borderLight}`}>
                            <th className="p-2 font-medium">Category</th>
                            <th className="p-2 font-medium">Requirement</th>
                            <th className="p-2 font-medium">Chart Extract</th>
                            <th className="p-2 font-medium">Conf</th>
                            <th className="p-2 font-medium w-8 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${cn.borderLight}`}>
                          {(POLICY_ROWS_BY_AUDIT[selectedAudit.id] ?? []).map((row, i) => (
                            <tr key={i} className={`${cn.bgHover} transition-colors`}>
                              <td className="p-2 text-zinc-500 whitespace-nowrap">{row.category}</td>
                              <td className="p-2 text-zinc-800">{row.req}</td>
                              <td className="p-2 text-zinc-600 italic">"{row.ext}"</td>
                              <td className="p-2 text-zinc-500 font-mono">{row.confidence}%</td>
                              <td className="p-2 text-center">
                                {row.match ? <CheckCircle2 size={13} className="text-emerald-600 mx-auto" /> : <XCircle size={13} className="text-rose-600 mx-auto" />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {clinicalTab === "PRECEDENT" && (
                    <div className="flex-1 p-4 overflow-y-auto">
                      {auditPrecedents.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {auditPrecedents.map((prec, i) => (
                            <div key={i} className={`border ${cn.borderLight} ${cn.bgMuted} rounded-lg p-3 flex flex-col gap-2`}>
                              <div className="flex justify-between items-start">
                                <div className="text-[11px] font-mono text-indigo-700">{prec.id}</div>
                                <StatusBadge status={prec.outcome} />
                              </div>
                              <div className={`flex gap-4 text-[10px] text-zinc-500 border-y ${cn.borderLight} py-2 my-1`}>
                                <div>Sim: <span className="text-zinc-800 font-semibold">{prec.sim}%</span></div>
                                <div>Impact: <span className="text-zinc-800">{prec.cost}</span></div>
                                <div>Time: <span className="text-zinc-800">{prec.days}d</span></div>
                              </div>
                              <div className="text-[10px] text-zinc-600 flex items-start gap-1.5"><Scale size={11} className="mt-0.5 shrink-0 text-zinc-500"/> {prec.note}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-[11px]">
                          <Search size={24} className="mb-2 opacity-50" />
                          No high-similarity precedent cases found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================ STAFFING ============================ */}
          {activeModule === "STAFFING" && (
            <div className="flex flex-col md:grid md:grid-cols-12 gap-4 min-h-full">
              {/* Deficits */}
              <div className={`md:col-span-3 flex flex-col shrink-0 ${cn.bgPanelFade} border ${cn.borderLight} rounded-xl overflow-hidden shadow-xl shadow-zinc-200/50`}>
                <div className={`p-3 text-[11px] font-semibold text-zinc-800 border-b ${cn.borderLight} flex items-center gap-2 ${cn.bgMuted}`}><AlertTriangle size={13} className="text-amber-600" /> Shift Deficits</div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                  {shifts.map((shift) => (
                    <button key={shift.id} onClick={() => selectShift(shift)} className={`w-full text-left p-3 rounded-lg border transition-all ${selectedShiftId === shift.id ? "bg-indigo-50 border-indigo-600/30" : "bg-transparent border-transparent hover:bg-black/[0.03]"}`}>
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="text-[11px] font-medium text-zinc-900">{shift.role}</div>
                        {shift.filled ? <StatusBadge status="APPROVED" /> : <StatusBadge status={shift.urgency > 80 ? "CRITICAL" : shift.urgency > 50 ? "MEDIUM" : "LOW"} />}
                      </div>
                      <div className="text-[9px] text-zinc-500 mb-2 font-mono">
                        {shift.unit} · {mounted ? new Date(shift.startTime).toLocaleString(undefined, { weekday: "short", hour: "numeric" }) : ""}
                      </div>
                      <div className="w-full h-1 bg-zinc-200 rounded-full overflow-hidden">
                        <div className={`h-full ${shift.filled ? "bg-emerald-600" : shift.urgency > 80 ? "bg-rose-600" : shift.urgency > 50 ? "bg-amber-600" : "bg-indigo-600"}`} style={{ width: `${shift.filled ? 100 : shift.urgency}%` }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Thread & Controls */}
              <div className={`md:col-span-6 flex flex-col border ${cn.borderLight} ${cn.bgPanelFade} rounded-xl overflow-hidden shadow-xl shadow-zinc-200/50`}>
                <div className={`p-3 flex items-center justify-between border-b ${cn.borderLight} ${cn.bgMuted}`}>
                  <span className="text-[11px] font-semibold text-zinc-800 flex items-center gap-2"><Zap size={13} className="text-indigo-600" /> Live Negotiation — {selectedShift.role}</span>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border ${backendMode === "live" ? "text-emerald-700 border-emerald-600/30 bg-emerald-600/10" : "text-zinc-600 border-zinc-300 bg-zinc-100"}`}>
                      {backendMode === "live" ? <Wifi size={10} /> : <WifiOff size={10} />} {backendMode === "live" ? "API CONNECTED" : "LOCAL SIM"}
                    </span>
                  </div>
                </div>
                
                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  {thread.map((chat, i) => (
                    <div key={i} className={`flex flex-col ${chat.sender === "AGENT" || chat.sender === "SYSTEM" || chat.sender === "USR_ROOT" ? "items-start" : "items-end"}`}>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className={`text-[9px] font-mono font-bold ${chat.sender === "AGENT" ? "text-indigo-700" : chat.sender === "SYSTEM" ? "text-emerald-700" : chat.sender === "USR_ROOT" ? "text-amber-700" : "text-sky-700"}`}>{chat.sender}</span>
                        {chat.sentiment && <span className={`text-[8px] px-1 rounded-sm border ${chat.sentiment === "POSITIVE" ? "text-emerald-700 border-emerald-600/30" : chat.sentiment === "NEGATIVE" ? "text-rose-700 border-rose-600/30" : "text-zinc-500 border-zinc-300"}`}>{chat.sentiment}</span>}
                      </div>
                      <div className={`text-[11px] p-2.5 rounded-lg max-w-[85%] leading-relaxed ${chat.sender === "AGENT" ? "bg-indigo-50 text-indigo-900 border border-indigo-600/20" : chat.sender === "SYSTEM" ? "bg-zinc-100 text-zinc-600 border border-black/[0.08]" : chat.sender === "USR_ROOT" ? "bg-amber-50 text-amber-900 border border-amber-600/20" : "bg-sky-50 text-sky-900 border border-sky-600/20"}`}>
                        {chat.msg}
                      </div>
                    </div>
                  ))}
                  {negotiationBusy && (
                    <div className="flex items-start">
                      <div className="text-[11px] p-2 text-zinc-500 italic animate-pulse">Awaiting response...</div>
                    </div>
                  )}
                  <div ref={threadEndRef} />
                </div>

                <div className={`p-3 ${cn.bgMuted} border-t ${cn.borderLight} flex gap-2`}>
                  <input
                    value={commandInput} onChange={(e) => setCommandInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !negotiationBusy && sendCommand()}
                    placeholder="Provide context or counter-offer to agent..." disabled={negotiationBusy}
                    className={`flex-1 h-9 ${cn.bgPanel} border ${cn.borderMain} rounded-lg px-3 text-[11px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-600/50`}
                  />
                  <button onClick={sendCommand} disabled={negotiationBusy} className="h-9 px-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"><Send size={14}/></button>
                </div>
              </div>

              {/* Strategy & Marketplace */}
              <div className="md:col-span-3 flex flex-col gap-4 shrink-0">
                <div className={`p-3 border ${cn.borderLight} ${cn.bgPanelFade} rounded-xl shadow-xl shadow-zinc-200/50 flex flex-col`}>
                  <div className="text-[11px] font-semibold text-zinc-800 mb-3 flex items-center gap-1.5"><UserPlus size={13} className="text-sky-600"/> Available Candidates</div>
                  <div className="space-y-1.5 flex-1">
                    {CANDIDATES.map(c => (
                      <button key={c.id} onClick={() => selectCandidate(c)} disabled={selectedShift.filled} className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-colors ${selectedCandidateId === c.id ? "bg-sky-50 border-sky-600/30" : "bg-transparent border-transparent hover:bg-black/[0.03]"} disabled:opacity-40`}>
                        <div>
                          <div className="text-[10px] text-zinc-900 font-medium">{c.name}</div>
                          <div className="text-[9px] text-zinc-500 font-mono mt-0.5">★ {c.rating} | Min ${c.minRate}</div>
                        </div>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded border ${c.tag === "Premium" ? "text-amber-700 border-amber-600/30" : "text-zinc-600 border-zinc-300"}`}>{c.tag}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`p-4 border ${cn.borderLight} ${cn.bgPanelFade} rounded-xl shadow-xl shadow-zinc-200/50 flex flex-col gap-4`}>
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-2"><span>Max Authorized Bid</span><span className="text-zinc-900 font-mono">${maxBid}/hr</span></div>
                    <input type="range" min={selectedShift.basePay} max={120} step={1} value={maxBid} onChange={(e) => setMaxBid(Number(e.target.value))} disabled={selectedShift.filled} className="w-full h-1 bg-zinc-300 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-40" />
                  </div>
                  
                  <div>
                    <div className="text-[10px] text-zinc-500 mb-2">Agent Strategy Profile</div>
                    <div className={`flex gap-1 p-1 ${cn.bgMuted} rounded-lg border ${cn.borderLight}`}>
                      {["Aggressive", "Balanced", "Accommodating"].map(s => (
                        <button key={s} onClick={() => setNegStrategy(s)} disabled={selectedShift.filled} className={`flex-1 py-1.5 text-[9px] rounded-md transition-colors ${negStrategy === s ? "bg-indigo-600 text-white shadow-md" : "text-zinc-600 hover:text-zinc-800"} disabled:opacity-40`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={executeBid} disabled={selectedShift.filled || negotiationBusy} className="w-full py-2.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-600/30 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-40 mt-2 flex items-center justify-center gap-2">
                    <Zap size={14} /> Execute Strategy
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================ LOGISTICS & INVENTORY ============================ */}
          {activeModule === "LOGISTICS" && (
            <div className="flex flex-col md:grid md:grid-cols-12 gap-4 min-h-full">
              
              {/* Left Column: Inventory List */}
              <div className={`md:col-span-4 flex flex-col border ${cn.borderLight} ${cn.bgPanelFade} rounded-xl shadow-xl shadow-zinc-200/50 overflow-hidden`}>
                <div className={`p-3 border-b ${cn.borderLight} flex flex-col gap-3 ${cn.bgMuted}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-800 flex items-center gap-2"><ListFilter size={13} className="text-sky-600" /> Inventory Assets</span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {["ALL", "CRITICAL", "Fluids", "PPE", "Pharmacy"].map(f => (
                      <button key={f} onClick={() => setInvFilter(f)} className={`px-2 py-1 text-[9px] font-mono rounded-full border transition-colors whitespace-nowrap ${invFilter === f ? "bg-sky-100 text-sky-700 border-sky-600/30" : "bg-transparent text-zinc-500 border-zinc-300 hover:border-zinc-400"}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                  {filteredInv.map(item => {
                    const stockPct = (item.currentStock / item.maxStock) * 100;
                    return (
                      <button key={item.id} onClick={() => setSelectedInvId(item.id)} className={`w-full text-left p-3 rounded-lg border transition-all ${selectedInvId === item.id ? "bg-sky-50 border-sky-600/30" : "bg-transparent border-transparent hover:bg-black/[0.03]"}`}>
                        <div className="flex justify-between items-start mb-1">
                          <div className="text-[11px] font-medium text-zinc-900">{item.name}</div>
                          <StatusBadge status={item.alert} />
                        </div>
                        <div className="text-[9px] text-zinc-500 font-mono mb-2">{item.id} · {item.category}</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                            <div className={`h-full ${stockPct < 25 ? "bg-rose-600" : stockPct < 50 ? "bg-amber-600" : "bg-sky-600"}`} style={{ width: `${stockPct}%` }} />
                          </div>
                          <span className="text-[9px] text-zinc-500 font-mono w-8 text-right">{Math.round(stockPct)}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Details & Forecast */}
              <div className="md:col-span-8 flex flex-col gap-4">
                {/* Top Detail Card */}
                <div className={`p-4 border ${cn.borderLight} ${cn.bgPanelFade} rounded-xl shadow-xl shadow-zinc-200/50`}>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900">{selectedInv.name}</h2>
                      <div className="text-[10px] text-zinc-500 font-mono mt-1">ID: {selectedInv.id} | Unit Cost: ${selectedInv.unitCost.toFixed(2)}</div>
                    </div>
                    <button onClick={() => toggleAutoReorder(selectedInv.id)} className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-colors ${selectedInv.autoReorder ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700" : "border-zinc-300 bg-zinc-100 text-zinc-500 hover:text-zinc-800"}`}>
                      {selectedInv.autoReorder ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      <span className="text-[10px] font-semibold uppercase tracking-wide">Auto-Reorder</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-zinc-500">Current Stock</span>
                      <span className="text-xl font-mono text-zinc-900">{selectedInv.currentStock} <span className="text-[10px] text-zinc-500">/ {selectedInv.maxStock}</span></span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-zinc-500">Daily Burn Rate</span>
                      <span className="text-xl font-mono text-zinc-900">{selectedInv.dailyBurn} <span className="text-[10px] text-zinc-500">units</span></span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-zinc-500">Reorder Point</span>
                      <span className="text-xl font-mono text-amber-600">{selectedInv.reorderPoint}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-zinc-500">Days to Zero</span>
                      <span className={`text-xl font-mono ${selectedInv.currentStock/selectedInv.dailyBurn < 3 ? "text-rose-600" : "text-emerald-600"}`}>{(selectedInv.currentStock/selectedInv.dailyBurn).toFixed(1)} <span className="text-[10px] text-zinc-500">days</span></span>
                    </div>
                  </div>

                  {/* SVG Chart Panel */}
                  <div className={`h-40 border ${cn.borderLight} ${cn.bgPanel} rounded-lg p-2 relative overflow-hidden`}>
                    <div className="absolute top-2 left-2 text-[9px] font-semibold text-zinc-500 flex items-center gap-1.5"><TrendingDown size={11}/> Predictive Burn-down (7-14 Day)</div>
                    <ForecastChart current={selectedInv.currentStock} max={selectedInv.maxStock} reorder={selectedInv.reorderPoint} burnRate={selectedInv.dailyBurn} />
                  </div>
                </div>

                {/* Pipeline Card */}
                <div className={`flex-1 p-4 border ${cn.borderLight} ${cn.bgPanelFade} rounded-xl shadow-xl shadow-zinc-200/50 flex flex-col`}>
                  <div className="text-[11px] font-semibold text-zinc-800 mb-4 flex items-center gap-2"><ArrowDownRight size={13} className="text-emerald-600" /> Active Purchase Orders</div>
                  
                  {activeOrders.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 text-[11px]">
                      <Package size={24} className="mb-2 opacity-50" /> No active inbound shipments for this item.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeOrders.map(order => (
                        <div key={order.id} className={`border ${cn.borderLight} ${cn.bgMuted} rounded-lg p-4`}>
                          <div className="flex justify-between items-center mb-6">
                            <span className="font-mono text-[11px] text-indigo-700">{order.id}</span>
                            <button onClick={() => advanceShipment(order.id)} disabled={order.stage >= 4} className={`text-[9px] px-2 py-1 bg-white border ${cn.borderMain} rounded hover:bg-zinc-50 disabled:opacity-30 transition-colors text-zinc-600`}>Advance Stage</button>
                          </div>
                          
                          {/* Pipeline visualization */}
                          <div className="flex items-start overflow-x-auto no-scrollbar pb-2">
                            <div className="flex items-start w-full min-w-[300px]">
                              {PIPELINE_STAGES.map((label, idx) => {
                                const state = idx < order.stage ? "done" : idx === order.stage ? "current" : "pending";
                                const isLast = idx === PIPELINE_STAGES.length - 1;
                                return (
                                  <React.Fragment key={idx}>
                                    <div className="flex flex-col items-center gap-2 shrink-0">
                                      <div className={`w-3 h-3 rounded-full border flex items-center justify-center transition-colors ${state === "done" ? "bg-emerald-500 border-emerald-600" : state === "current" ? "bg-sky-500 border-sky-600 animate-pulse" : "bg-zinc-200 border-zinc-300"}`}>
                                        {state === "done" && <CheckCircle2 size={8} className="text-white" />}
                                      </div>
                                      <div className={`text-[8px] font-mono ${state === "pending" ? "text-zinc-400" : "text-zinc-700"}`}>{label}</div>
                                    </div>
                                    {!isLast && <div className={`flex-1 mt-[5px] h-[1px] ${idx < order.stage ? "bg-emerald-500/50" : "bg-zinc-200"}`} />}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>

                          <div className={`mt-4 pt-3 border-t ${cn.borderLight} flex justify-between text-[10px] text-zinc-500 font-mono`}>
                            <span>Status: <span className="text-zinc-800">{order.status}</span></span>
                            <span>ETA: <span className="text-indigo-700">{order.eta}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ============================ KERNEL ============================ */}
          {activeModule === "KERNEL" && (
            <div className={`min-h-[500px] md:h-full flex flex-col border ${cn.borderLight} ${cn.bgPanelFade} rounded-xl shadow-xl shadow-zinc-200/50 overflow-hidden`}>
              <div className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${cn.borderLight} ${cn.bgMuted}`}>
                <div className="flex items-center gap-2.5">
                  <Terminal size={14} className="text-indigo-600" />
                  <span className="text-[11px] font-semibold text-zinc-900 uppercase tracking-widest">Syslog Stream</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {["ALL", "INFO", "ACTION", "ERROR"].map((f) => (
                    <button key={f} onClick={() => setLogFilter(f)} className={`px-2.5 py-1 text-[9px] border rounded transition-colors ${logFilter === f ? "bg-indigo-600 text-white border-indigo-600 font-semibold" : "bg-white text-zinc-500 border-zinc-300 hover:border-zinc-400"}`}>{f}</button>
                  ))}
                  <div className="hidden sm:block w-px h-4 bg-zinc-300 mx-1" />
                  <button onClick={() => setStreaming((s) => !s)} className="p-1.5 border border-zinc-300 rounded bg-white text-zinc-500 hover:text-zinc-700 transition-colors ml-auto sm:ml-0">{streaming ? <Pause size={12} /> : <Play size={12} />}</button>
                  <button onClick={() => setLogs([])} className="p-1.5 border border-zinc-300 rounded bg-white text-zinc-500 hover:text-rose-600 hover:border-rose-600/50 transition-colors"><Trash2 size={12} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 text-[10.5px] font-mono space-y-1">
                {filteredLogs.map((log) => (
                  <div key={log.id} className={`flex flex-col sm:flex-row sm:gap-4 ${cn.bgHover} py-1 px-2 rounded transition-colors`}>
                    <span className="text-zinc-400 shrink-0">[{log.timestamp}]</span>
                    <div className="flex gap-4 sm:contents">
                      <span className={`shrink-0 sm:w-14 font-semibold ${log.level === "ERROR" ? "text-rose-600" : log.level === "ACTION" ? "text-amber-600" : "text-sky-600"}`}>{log.level}</span>
                      <span className="text-zinc-500 shrink-0 sm:w-24">{log.module}</span>
                    </div>
                    <span className="text-zinc-700 mt-1 sm:mt-0">{log.message}</span>
                  </div>
                ))}
                {filteredLogs.length === 0 && (
                  <div className="text-zinc-400 text-center py-20 tracking-widest text-xs">{streaming ? "WAITING FOR DATA..." : "STREAM PAUSED"}</div>
                )}
              </div>
              <div className={`p-2 text-[9px] text-zinc-500 flex justify-between border-t ${cn.borderLight} uppercase tracking-wider font-mono ${cn.bgMuted}`}>
                <span>Buffer: {logs.length}/200</span>
                <span className={streaming ? "text-emerald-600" : "text-amber-600"}>{streaming ? "● LIVE" : "॥ PAUSED"}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* APPEAL MODAL */}
      {appealOpen && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm" onClick={() => setAppealOpen(false)}>
          <div className={`w-full max-w-lg ${cn.bgPanel} border ${cn.borderLight} rounded-xl shadow-2xl`} onClick={(e) => e.stopPropagation()}>
            <div className={`p-4 border-b ${cn.borderLight} flex items-center justify-between`}>
              <span className="text-[11.5px] font-semibold text-zinc-900 flex items-center gap-2"><FileText size={14} className="text-indigo-600" /> Clinical Appeal Draft</span>
              <button onClick={() => setAppealOpen(false)} className="text-zinc-400 hover:text-zinc-700"><X size={15} /></button>
            </div>
            <div className="p-4">

              <textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} disabled={appealLoading} rows={9} className={`w-full ${cn.bgInput} border ${cn.borderMain} rounded-lg p-3 text-[11px] ${cn.textMain} leading-relaxed font-mono focus:outline-none focus:border-indigo-600/50 resize-none disabled:opacity-60`} />
            </div>
            <div className={`p-4 border-t ${cn.borderLight} flex justify-between items-center ${cn.bgMuted} rounded-b-xl`}>
              <span className="text-[9.5px] text-zinc-500 font-mono flex items-center gap-1.5">
                {appealSent ? "Status: TRANSMITTED (72h SLA)" : appealLoading ? "Status: DRAFTING..." : "Status: DRAFT"}
                {!appealLoading && !appealSent && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded border text-[8px] ${appealSource === "backend" ? "text-emerald-700 border-emerald-600/30 bg-emerald-500/10" : "text-zinc-500 border-zinc-400/30 bg-zinc-500/10"}`}>
                    {appealSource === "backend" ? "AI-drafted" : "local fallback"}
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setAppealOpen(false)} className="px-4 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-900 border border-zinc-300 hover:border-zinc-400 rounded transition-colors bg-white">Close</button>
                <button onClick={sendAppeal} disabled={appealSent || appealLoading} className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-semibold rounded hover:bg-indigo-500 transition-colors disabled:opacity-50">{appealSent ? "Transmitted" : "Transmit"}</button>
>>>>>>> origin/master
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #a1a1aa; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bootLetter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bootLine { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes scanSweep { 0% { transform: translateY(-120%); } 100% { transform: translateY(220vh); } }
        @keyframes pulseRing { 0% { transform: scale(0.85); opacity: 0.5; } 70% { opacity: 0; } 100% { transform: scale(1.15); opacity: 0; } }
        .preserve-3d { transform-style: preserve-3d; }
      `}</style>
    </div>
  );
}
