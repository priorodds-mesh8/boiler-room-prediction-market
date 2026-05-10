/* global React, AgentSim */
const { useState } = React;
const {
  Chip, Tag, Reticle, BracketHeading,
  ProbStrip, MiniProb,
  HudCell, IntelCard, ActionControl,
  DealCard, TopRail, PriorityStack,
} = AgentSim;

// ─────────────────────────────────────────────
//  SAMPLE DATA
// ─────────────────────────────────────────────

const STACK_ITEMS = [
  { kind: "agent",   dealId: "D-02 · Helix",     title: "Closer-09 booked exec readout for Thursday w/ CRO Maya Patel.",
    body: "Mutual close plan signed; legal aligned on MSA redlines. Confidence on outcome lifts 4pp on the team baseline.",
    disagreement: 22, source: "agent · closer-09",   freshness: "+2h" },
  { kind: "metric",  dealId: "D-04 · Northwind", title: "Champion email cadence dropped 71% week-over-week.",
    body: "VP Eng (champion) last replied Day 9. Activity score collapsed; deal aging signal fired.",
    disagreement: 19, source: "crm · activity",      freshness: "+6h" },
  { kind: "gossip",  dealId: "D-01 · Atlas",     title: "Procurement allegedly running parallel RFP with Vector AI.",
    body: "Unverified — surfaced via SDR network. Cross-check vs. legal exchange volume before pricing in.",
    disagreement: 17, source: "rumor · sdr-net",     freshness: "+11h",
    rumorReliability: "C2" },
  { kind: "process", dealId: "D-03 · Beacon",    title: "Security review cleared SOC2 + DPA on Day 12.",
    body: "Two of three procurement gates closed. Standard close-cycle median 8 days from this state.",
    disagreement: 12, source: "process · sec-ops",   freshness: "+1d" },
  { kind: "metric",  dealId: "D-02 · Helix",     title: "Pipeline coverage rebalanced; ACV revised –12% to $410K.",
    body: "Mutual scoping cut Phase-2 modules. ML revises win-prob downward, market hasn't repriced yet.",
    disagreement: 9,  source: "crm · forecast",      freshness: "+1d" },
  { kind: "gossip",  dealId: "D-05 · Polaris",   title: "Heard the new CFO froze net-new spend until Q3 board.",
    body: "Sourced from a single SE conversation; no corroborating ticket. Treat as low-signal.",
    disagreement: 6,  source: "rumor · field",       freshness: "+1d",
    rumorReliability: "D3" },
];

const DEALS_3 = [
  { code: "D-01", account: "Atlas Logistics",  acv: "$1.20M", close: "Q2-W11", stage: "Late",  target: "Closed-Won by final day",
    targetProb: 50, ml: 42, mkt: 58, fng: 64, pnl: +28, stance: "buy",  conf: 4 },
  { code: "D-02", account: "Helix Therapeutics", acv: "$410K", close: "Q2-W9",  stage: "Mid",  target: "ACV ≥ $400K  &  Won",
    targetProb: 50, ml: 71, mkt: 65, fng: 49, pnl: -14, stance: "sell", conf: 3 },
  { code: "D-03", account: "Beacon Health",    acv: "$880K", close: "Q2-W10", stage: "Late",  target: "Won  &  no procurement slip",
    targetProb: 50, ml: 55, mkt: 51, fng: 56, pnl: +6,  stance: "hold", conf: 2 },
];

const DEALS_10 = [
  ...DEALS_3,
  { code: "D-04", account: "Northwind Retail", acv: "$220K", target: "Renewal expand ≥ 15%", targetProb: 50, ml: 62, mkt: 48, fng: 35, pnl: -22, stance: "sell", conf: 5 },
  { code: "D-05", account: "Polaris Bank",     acv: "$2.10M", target: "Won by final day",         targetProb: 50, ml: 30, mkt: 28, fng: 31, pnl: +3,  stance: "hold", conf: 1 },
  { code: "D-06", account: "Vector AI",        acv: "$540K",  target: "Multi-yr signed",       targetProb: 50, ml: 52, mkt: 60, fng: 67, pnl: +14, stance: "buy",  conf: 3 },
  { code: "D-07", account: "Quanta Foods",     acv: "$130K",  target: "ACV ≥ $150K",           targetProb: 50, ml: 39, mkt: 44, fng: 42, pnl: -2,  stance: "hold", conf: 2 },
  { code: "D-08", account: "Meridian Power",   acv: "$1.80M", target: "Won  &  on schedule",   targetProb: 50, ml: 48, mkt: 55, fng: 71, pnl: +24, stance: "buy",  conf: 4 },
  { code: "D-09", account: "Cobalt Aerospace", acv: "$3.40M", target: "Phase-1 closed",        targetProb: 50, ml: 22, mkt: 31, fng: 18, pnl: -8,  stance: "sell", conf: 4 },
  { code: "D-10", account: "Pier 9 Studios",   acv: "$95K",   target: "Won by Day 25",         targetProb: 50, ml: 78, mkt: 81, fng: 79, pnl: +1,  stance: "hold", conf: 1 },
];

// ─────────────────────────────────────────────
//  SETUP SCREEN
// ─────────────────────────────────────────────
function ScreenSetup() {
  const [mode, setMode] = useState("TEAM");
  const [count, setCount] = useState(3);

  const modes = [
    { id: "TEAM",         label: "Team",           tag: "FNG vs 4 agents",
      desc: "Full bench. Closer, SE, SDR and Pricing personas play live alongside you. Wallet scaled per role.",
      diagram: <ModeDiagramTeam /> },
    { id: "AGENT FOCUS",  label: "Agent Focus",    tag: "1-on-1 duel",
      desc: "Square off against a single AI persona (Closer-09 by default). Same intel deck, half the noise.",
      diagram: <ModeDiagramAgent /> },
    { id: "SILENT MARKET",label: "Silent Market",  tag: "FNG vs market",
      desc: "No agent personas. You forecast against pure ML baseline + crowd market. The chess clock variant.",
      diagram: <ModeDiagramSilent /> },
  ];

  return (
    <div className="board-bg" style={{ width: 1280, height: 880, padding: 36, display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Reticle size={14} color="var(--fng)" />
        <div style={{ font: "600 11px/1 var(--mono)", color: "var(--fng)", letterSpacing: "0.24em" }}>BOILER ROOM · AGENT SIM</div>
        <div style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
        <div style={{ font: "500 11px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.14em" }}>RUN · 2604-A · DRAFTING</div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
        <div>
          <div style={{ font: "500 11px/1 var(--mono)", letterSpacing: "0.2em", color: "var(--muted)" }}>WAR ROOM // SETUP</div>
          <h1 style={{ margin: "10px 0 0", font: "500 44px/1.05 var(--sans)", letterSpacing: "-0.02em" }}>
            Build the run.<br/>
            <span style={{ color: "var(--muted)" }}>FNG against the agents.</span>
          </h1>
        </div>
        <div style={{ flex: 1 }} />
        <div className="card-flat" style={{ padding: "12px 14px", maxWidth: 320 }}>
          <div style={{ font: "500 9px/1 var(--mono)", letterSpacing: "0.16em", color: "var(--dim)" }}>BRIEFING</div>
          <div style={{ font: "500 11.5px/1.5 var(--sans)", color: "var(--ink)", marginTop: 6 }}>
            System will assign live deals from your pipeline + per-deal outcome targets. 30 in-game days. P&L scored on probability proximity.
          </div>
        </div>
      </div>

      {/* MODE */}
      <div>
        <BracketHeading kicker="01 · MODE" title="how the table is set" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
          {modes.map(m => {
            const active = mode === m.id;
            return (
              <div key={m.id} className={`card ${active ? "fng-glow" : ""}`}
                onClick={() => setMode(m.id)}
                style={{
                  padding: 18, cursor: "pointer",
                  borderColor: active ? "var(--fng)" : "var(--border)",
                  background: active ? "color-mix(in oklab, var(--fng) 5%, var(--surface))" : "var(--surface)",
                  display: "flex", flexDirection: "column", gap: 12,
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tag style={{ color: active ? "var(--fng)" : "var(--muted)", borderColor: active ? "color-mix(in oklab, var(--fng) 50%, var(--border))" : "var(--border)" }}>{m.tag}</Tag>
                  <div style={{ flex: 1 }} />
                  <div style={{
                    width: 16, height: 16, borderRadius: 999,
                    border: `1.5px solid ${active ? "var(--fng)" : "var(--border-2)"}`,
                    background: active ? "var(--fng)" : "transparent",
                    boxShadow: active ? "inset 0 0 0 3px var(--bg)" : "none"
                  }} />
                </div>
                <div>{m.diagram}</div>
                <div>
                  <div style={{ font: "600 18px/1.1 var(--sans)", letterSpacing: "-0.01em" }}>{m.label}</div>
                  <div style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--muted)", marginTop: 6 }}>{m.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DEAL COUNT */}
      <div>
        <BracketHeading kicker="02 · DEAL COUNT" title="how many positions to take" />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {[1,3,5,10].map(n => {
            const active = count === n;
            return (
              <div key={n} onClick={() => setCount(n)}
                className="card" style={{
                  flex: 1, padding: "16px 18px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 18,
                  borderColor: active ? "var(--fng)" : "var(--border)",
                  background: active ? "color-mix(in oklab, var(--fng) 5%, var(--surface))" : "var(--surface)",
                }}>
                <div style={{ font: `600 38px/1 var(--mono)`, color: active ? "var(--fng)" : "var(--text)", letterSpacing: "-0.02em" }}>
                  {String(n).padStart(2, "0")}
                </div>
                <div>
                  <div style={{ font: "600 11px/1 var(--sans)", color: "var(--text)" }}>
                    {n === 1  ? "Sniper"   : n === 3 ? "Standard" : n === 5 ? "Bench" : "Floor"}
                  </div>
                  <div style={{ font: "400 10.5px/1.4 var(--sans)", color: "var(--muted)", marginTop: 4 }}>
                    {n === 1  ? "Single high-ACV deal"
                    : n === 3 ? "Three concurrent deals"
                    : n === 5 ? "Mixed cohort, recommended"
                    : "Full pipeline floor · dense layout"}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span style={{ font: "500 9px/1 var(--mono)", letterSpacing: "0.14em", color: "var(--dim)" }}>WALLET</span>
                  <span style={{ font: "600 12px/1 var(--mono)", color: "var(--ink)" }}>§ {(n * 400).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DEPLOY */}
      <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
        <Tag style={{ color: "var(--amber)" }}>03 · ASSIGNMENT</Tag>
        <div style={{ font: "500 11.5px/1.4 var(--sans)", color: "var(--muted)" }}>
          On deploy, system selects {count} deal{count > 1 ? "s" : ""} from your pipeline matching mode constraints, then locks per-deal outcome targets. You will not be able to reroll mid-run.
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn ghost">Reseed pool</button>
        <button className="btn primary" style={{ height: 38, padding: "0 22px" }}>
          ▸ Deploy run · {count} deal{count > 1 ? "s" : ""} · {mode}
        </button>
      </div>
    </div>
  );
}

// Tiny mode diagrams — geometric, wireframe-feel
function ModeDiagramTeam() {
  return (
    <svg viewBox="0 0 240 80" style={{ width: "100%", height: 70 }}>
      <g fill="none" stroke="var(--border-2)" strokeWidth="1">
        <rect x="6" y="20" width="46" height="40" rx="2" />
        <rect x="62" y="20" width="46" height="40" rx="2" />
        <rect x="118" y="20" width="46" height="40" rx="2" />
        <rect x="174" y="20" width="46" height="40" rx="2" />
      </g>
      <text x="29"  y="44" textAnchor="middle" fill="var(--muted)" style={{ font: "600 9px var(--mono)" }}>SE</text>
      <text x="85"  y="44" textAnchor="middle" fill="var(--muted)" style={{ font: "600 9px var(--mono)" }}>SDR</text>
      <text x="141" y="44" textAnchor="middle" fill="var(--muted)" style={{ font: "600 9px var(--mono)" }}>CLR</text>
      <text x="197" y="44" textAnchor="middle" fill="var(--muted)" style={{ font: "600 9px var(--mono)" }}>PRC</text>
      <rect x="100" y="2" width="40" height="14" rx="2" fill="none" stroke="var(--fng)" />
      <text x="120" y="12" textAnchor="middle" fill="var(--fng)" style={{ font: "700 8px var(--mono)" }}>FNG</text>
      <line x1="120" y1="16" x2="120" y2="20" stroke="var(--fng)" strokeDasharray="2 2" />
    </svg>
  );
}
function ModeDiagramAgent() {
  return (
    <svg viewBox="0 0 240 80" style={{ width: "100%", height: 70 }}>
      <rect x="20"  y="22" width="80" height="36" rx="2" fill="none" stroke="var(--fng)" />
      <text x="60"  y="44" textAnchor="middle" fill="var(--fng)" style={{ font: "700 10px var(--mono)" }}>FNG</text>
      <rect x="140" y="22" width="80" height="36" rx="2" fill="none" stroke="var(--border-2)" />
      <text x="180" y="40" textAnchor="middle" fill="var(--text)" style={{ font: "600 9px var(--mono)" }}>CLOSER</text>
      <text x="180" y="52" textAnchor="middle" fill="var(--muted)" style={{ font: "500 8px var(--mono)" }}>09</text>
      <line x1="100" y1="40" x2="140" y2="40" stroke="var(--border-2)" strokeDasharray="2 3" />
      <circle cx="120" cy="40" r="4" fill="none" stroke="var(--amber)" />
    </svg>
  );
}
function ModeDiagramSilent() {
  return (
    <svg viewBox="0 0 240 80" style={{ width: "100%", height: 70 }}>
      <rect x="14" y="22" width="60" height="36" rx="2" fill="none" stroke="var(--fng)" />
      <text x="44" y="44" textAnchor="middle" fill="var(--fng)" style={{ font: "700 10px var(--mono)" }}>FNG</text>
      {[100, 130, 160, 190].map((x, i) => (
        <line key={i} x1={x} y1="20" x2={x} y2="60" stroke="var(--border-2)" />
      ))}
      <line x1="100" y1="40" x2="220" y2="40" stroke="var(--mkt)" strokeDasharray="3 3" />
      <text x="160" y="14" textAnchor="middle" fill="var(--muted)" style={{ font: "600 8px var(--mono)" }}>MARKET MID</text>
      <text x="160" y="74" textAnchor="middle" fill="var(--muted)" style={{ font: "600 8px var(--mono)" }}>ML BASELINE</text>
    </svg>
  );
}

// ─────────────────────────────────────────────
//  RUN SCREEN — 3 deals (default density)
// ─────────────────────────────────────────────
function ScreenRun3() {
  return (
    <div className="board-bg" style={{ width: 1440, height: 980, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <RunHeader runLabel="RUN · 2604-A" />
      <TopRail day={14} mode="TEAM" wallet={1240} pnl={+186} leader="FNG" deals={3} />

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, flex: 1, minHeight: 0 }}>
        <PriorityStack items={STACK_ITEMS.slice(0, 5)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BracketHeading
            kicker="ACTIVE DEALS · 03"
            title={<span style={{ color: "var(--muted)" }}>positions due before Day 15 · all stances must be set to advance</span>}
            right={<>
              <Chip kind="ml"  dot>ML BASELINE</Chip>
              <Chip kind="mkt" dot>MARKET MID</Chip>
              <Chip kind="fng" dot>FNG STANCE</Chip>
              <Chip kind="amber" dot>TARGET</Chip>
            </>}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {DEALS_3.map(d => <DealCard key={d.code} deal={d} />)}
          </div>

          {/* Day timeline */}
          <DayTimeline day={14} />

          {/* Agent leaderboard mini */}
          <AgentLeaderboard />
        </div>
      </div>
    </div>
  );
}

function RunHeader({ runLabel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Reticle size={14} color="var(--fng)" />
      <div style={{ font: "600 11px/1 var(--mono)", color: "var(--fng)", letterSpacing: "0.24em" }}>BOILER ROOM · AGENT SIM</div>
      <div style={{ font: "500 11px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.14em" }}>// {runLabel}</div>
      <div style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn ghost">Tape</button>
        <button className="btn ghost">Rules</button>
        <button className="btn ghost">Concede</button>
      </div>
    </div>
  );
}

function DayTimeline({ day = 14, maxDays = 30 }) {
  return (
    <div className="card" style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ font: "600 10px/1 var(--mono)", letterSpacing: "0.16em", color: "var(--dim)" }}>RUN TIMELINE</div>
        <div style={{ flex: 1, position: "relative", height: 18 }}>
          {Array.from({ length: maxDays }).map((_, i) => {
            const past = i < day;
            const today = i === day - 1;
            return (
              <div key={i} style={{
                position: "absolute", left: `${(i / Math.max(1, maxDays - 1)) * 100}%`,
                top: today ? 0 : 4, bottom: today ? 0 : 4,
                width: today ? 4 : 2,
                background: today ? "var(--fng)" : past ? "var(--border-2)" : "var(--hairline)",
                transform: "translateX(-50%)"
              }} />
            );
          })}
          <div style={{ position: "absolute", left: `${((day - 1) / Math.max(1, maxDays - 1)) * 100}%`, top: -16, transform: "translateX(-50%)", font: "600 9px/1 var(--mono)", color: "var(--fng)" }}>D{day}</div>
        </div>
        <div style={{ font: "500 10px/1 var(--mono)", color: "var(--muted)" }}>D01 → D{maxDays}</div>
      </div>
    </div>
  );
}

function AgentLeaderboard() {
  const rows = [
    { name: "FNG · you",     pnl: +186, prob: 64, color: "var(--fng)", rank: 1 },
    { name: "Closer-09",     pnl: +142, prob: 59, color: "var(--text)", rank: 2 },
    { name: "Pricing-04",    pnl: +88,  prob: 55, color: "var(--text)", rank: 3 },
    { name: "SE-12",         pnl: -34,  prob: 48, color: "var(--muted)", rank: 4 },
    { name: "SDR-Net",       pnl: -120, prob: 42, color: "var(--muted)", rank: 5 },
  ];
  return (
    <div className="card" style={{ padding: 14 }}>
      <BracketHeading kicker="STANDINGS · LIVE" title={<span style={{ color: "var(--muted)" }}>aggregate P&L across run</span>} />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(r => {
          const w = Math.abs(r.pnl) / 200 * 100;
          return (
            <div key={r.name} style={{ display: "grid", gridTemplateColumns: "26px 1fr 60px 200px 60px", alignItems: "center", gap: 10, padding: "4px 0" }}>
              <div style={{ font: "600 11px/1 var(--mono)", color: "var(--dim)" }}>0{r.rank}</div>
              <div style={{ font: `600 12px/1 var(--sans)`, color: r.color }}>{r.name}</div>
              <div style={{ font: "500 10px/1 var(--mono)", color: "var(--muted)" }}>p̂ {r.prob}</div>
              <div style={{ position: "relative", height: 8, background: "var(--surface-2)", border: "1px solid var(--hairline)", borderRadius: 1 }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border-2)" }} />
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  ...(r.pnl >= 0
                    ? { left: "50%", width: `${w / 2}%`, background: "var(--buy)" }
                    : { right: "50%", width: `${w / 2}%`, background: "var(--sell)" })
                }} />
              </div>
              <div style={{ textAlign: "right", font: "600 12px/1 var(--mono)", color: r.pnl >= 0 ? "var(--buy)" : "var(--sell)" }}>
                {r.pnl >= 0 ? "+" : ""}{r.pnl}<span style={{ color: "var(--dim)", fontSize: 9, marginLeft: 2 }}>pp</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  RUN SCREEN — 10 deals (dense, scaled layout)
// ─────────────────────────────────────────────
function ScreenRun10() {
  return (
    <div className="board-bg" style={{ width: 1440, height: 1080, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <RunHeader runLabel="RUN · 2604-B · FLOOR" />
      <TopRail day={22} mode="SILENT MARKET" wallet={4000} pnl={+62} leader="FNG" deals={10} />

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14, flex: 1, minHeight: 0 }}>
        <PriorityStack items={STACK_ITEMS.slice(0, 6)} dense />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <BracketHeading
            kicker="ACTIVE DEALS · 10"
            title={<span style={{ color: "var(--muted)" }}>floor mode · compact rows · sort: |Δ| MKT–FNG ↓</span>}
            right={<>
              <Chip kind="ml"  dot>ML</Chip>
              <Chip kind="mkt" dot>MKT</Chip>
              <Chip kind="fng" dot>FNG</Chip>
            </>}
          />
          {/* Column header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 12px", font: "600 9px/1 var(--mono)", letterSpacing: "0.14em", color: "var(--dim)" }}>
            <div style={{ width: 28 }}>ID</div>
            <div style={{ width: 180 }}>ACCOUNT · TARGET</div>
            <div style={{ flex: 1 }}>PROBABILITY · 0–100</div>
            <div style={{ width: 90 }}>FNG · MKT</div>
            <div style={{ width: 70, textAlign: "right" }}>P&L</div>
            <div style={{ width: 200 }}>STANCE / CONF</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}>
            {DEALS_10.map(d => <DealCard key={d.code} deal={d} density="dense" />)}
          </div>
          <DayTimeline day={22} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  CARD LIBRARY — shows the 4 card kinds at full size
// ─────────────────────────────────────────────
function ScreenCards() {
  const samples = [
    { kind: "metric", dealId: "D-04 · Northwind", title: "Champion email cadence dropped 71% week-over-week.",
      body: "VP Eng (champion) last replied Day 9. Activity score collapsed; deal aging signal fired. Historical base rate: +12pp adverse.",
      disagreement: 19, source: "crm · activity · deterministic", freshness: "+6h" },
    { kind: "process", dealId: "D-03 · Beacon", title: "Security review cleared SOC2 + DPA on Day 12.",
      body: "Two of three procurement gates closed (Sec ✓, Legal ✓, Finance ⏳). Standard close-cycle median 8 days from this state.",
      disagreement: 12, source: "process · sec-ops", freshness: "+1d" },
    { kind: "agent", dealId: "D-02 · Helix", title: "Closer-09 booked exec readout for Thursday w/ CRO Maya Patel.",
      body: "Mutual close plan signed; legal aligned on MSA redlines. Closer-09 marks champion engagement +HIGH; revises buy stance to conf 4.",
      disagreement: 22, source: "agent · closer-09 · in-character", freshness: "+2h" },
    { kind: "gossip", dealId: "D-01 · Atlas", title: "Procurement allegedly running parallel RFP with Vector AI.",
      body: "Unverified — surfaced via SDR network. Cross-check vs. legal exchange volume before pricing in. May be planted.",
      disagreement: 17, source: "rumor · sdr-net", freshness: "+11h", rumorReliability: "C2" },
  ];
  return (
    <div className="board-bg" style={{ width: 980, height: 880, padding: 32, display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{ font: "500 11px/1 var(--mono)", letterSpacing: "0.2em", color: "var(--muted)" }}>INTEL VOCABULARY</div>
        <h2 style={{ margin: "8px 0 0", font: "500 30px/1.1 var(--sans)", letterSpacing: "-0.01em" }}>Four card classes feed the stack.</h2>
        <div style={{ font: "400 12px/1.55 var(--sans)", color: "var(--muted)", marginTop: 8, maxWidth: 640 }}>
          Every day surfaces 6–14 cards. The Priority Stack ranks them by Δ disagreement so executives only act on real divergence.
          Gossip cards are visibly badged so a careful reader can ignore them.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {samples.map((s, i) => (
          <div key={i}>
            <div style={{ font: "600 9px/1 var(--mono)", letterSpacing: "0.18em", color: "var(--dim)", marginBottom: 8 }}>
              {String(i + 1).padStart(2, "0")} · {AgentSim.KIND_META[s.kind].label}
            </div>
            <IntelCard {...s} />
          </div>
        ))}
      </div>

      <div className="card-flat" style={{ padding: "12px 14px", display: "flex", gap: 18, alignItems: "center" }}>
        <Tag style={{ color: "var(--amber)" }}>RUMOR LEDGER</Tag>
        <div style={{ font: "400 11.5px/1.4 var(--sans)", color: "var(--muted)", flex: 1 }}>
          Gossip carries a reliability code (A1 → D5, NATO-style). Acting on D-tier rumor counts toward a noise penalty in your run summary.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["A1","B2","C2","D3","D5"].map(c => (
            <Tag key={c} style={{ color: c.startsWith("A") ? "var(--buy)" : c.startsWith("B") ? "var(--ml)" : c.startsWith("C") ? "var(--amber)" : "var(--rumor)" }}>{c}</Tag>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  RESULTS SCREEN
// ─────────────────────────────────────────────
function ScreenResults() {
  const results = [
    { code: "D-01", account: "Atlas Logistics",  target: "Closed-Won by final day",   ml: 42, mkt: 58, fng: 64, outcome: "win",  fngPnl: +36, mktPnl: +12 },
    { code: "D-02", account: "Helix Therapeutics", target: "ACV ≥ $400K & Won",     ml: 71, mkt: 65, fng: 49, outcome: "loss", fngPnl: +51, mktPnl: -18 },
    { code: "D-03", account: "Beacon Health",    target: "Won & no procurement slip", ml: 55, mkt: 51, fng: 56, outcome: "win",  fngPnl: +6,  mktPnl: -1 },
  ];
  const totalFng = results.reduce((a, r) => a + r.fngPnl, 0);

  return (
    <div className="board-bg" style={{ width: 1440, height: 980, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <RunHeader runLabel="RUN · 2604-A · DAY 30 · CLOSED" />

      {/* Result banner */}
      <div className="card fng-glow" style={{
        padding: "20px 24px",
        display: "flex", alignItems: "center", gap: 28,
        background: "linear-gradient(90deg, color-mix(in oklab, var(--fng) 8%, var(--surface)) 0%, var(--surface) 60%)",
        borderColor: "var(--fng)"
      }}>
        <div>
          <div style={{ font: "600 10px/1 var(--mono)", letterSpacing: "0.22em", color: "var(--fng)" }}>FORECAST WINNER</div>
          <div style={{ font: "500 44px/1 var(--sans)", marginTop: 8, letterSpacing: "-0.02em" }}>
            FNG <span style={{ color: "var(--muted)" }}>takes the run.</span>
          </div>
          <div style={{ font: "400 12px/1.5 var(--sans)", color: "var(--muted)", marginTop: 6, maxWidth: 480 }}>
            Closest aggregate probability across 3 deals. Outperformed market mid by +18 pp, beat ML baseline by +24 pp.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <ResultStat label="P&L" value={`+${totalFng}`} unit="pp" big accent="var(--buy)" />
        <ResultStat label="BRIER" value="0.142" unit="↓ better" accent="var(--fng)" />
        <ResultStat label="HIT RATE" value="2 / 3" unit="targets called" />
        <ResultStat label="WALLET" value={`§ 1,612`} unit="closed at" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 18, flex: 1, minHeight: 0 }}>
        {/* Per-deal comparison */}
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <BracketHeading kicker="PER-DEAL · SETTLEMENT" title={<span style={{ color: "var(--muted)" }}>ml ↔ market ↔ fng vs. actual outcome</span>} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {results.map(r => (
              <div key={r.code} style={{ display: "grid", gridTemplateColumns: "120px 1fr 140px", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ font: "600 10px/1 var(--mono)", color: "var(--dim)" }}>{r.code}</div>
                  <div style={{ font: "600 14px/1.2 var(--sans)", marginTop: 4 }}>{r.account}</div>
                  <div style={{ font: "500 10px/1.3 var(--mono)", color: "var(--muted)", marginTop: 4 }}>{r.target}</div>
                </div>
                <ProbStrip ml={r.ml} mkt={r.mkt} fng={r.fng} target={r.outcome === "win" ? 100 : 0} outcome={r.outcome} showTarget={false} />
                <div style={{ textAlign: "right" }}>
                  <Tag style={{ color: r.outcome === "win" ? "var(--buy)" : "var(--sell)", borderColor: `color-mix(in oklab, ${r.outcome === "win" ? "var(--buy)" : "var(--sell)"} 50%, var(--border))` }}>
                    {r.outcome === "win" ? "▲ OUTCOME · WIN" : "▼ OUTCOME · LOSS"}
                  </Tag>
                  <div style={{ font: "700 22px/1 var(--mono)", color: r.fngPnl >= 0 ? "var(--buy)" : "var(--sell)", marginTop: 8 }}>
                    {r.fngPnl >= 0 ? "+" : ""}{r.fngPnl}<span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 3 }}>pp</span>
                  </div>
                  <div style={{ font: "500 10px/1 var(--mono)", color: "var(--muted)", marginTop: 4 }}>FNG vs market: {r.mktPnl >= 0 ? "+" : ""}{r.mktPnl - r.fngPnl}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Final leaderboard */}
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <BracketHeading kicker="FINAL P&L" />
          <FinalLeaderboard />
          <div className="hr" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ font: "600 10px/1 var(--mono)", letterSpacing: "0.16em", color: "var(--dim)" }}>NEXT</div>
            <button className="btn primary" style={{ height: 36 }}>Replay run with annotations</button>
            <button className="btn" style={{ height: 36 }}>Draft new run</button>
            <button className="btn ghost" style={{ height: 36 }}>Export tape · CSV</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value, unit, accent = "var(--text)", big }) {
  return (
    <div style={{ paddingRight: 24, borderRight: "1px solid var(--hairline)", minWidth: 110 }}>
      <div style={{ font: "600 9px/1 var(--mono)", letterSpacing: "0.18em", color: "var(--dim)" }}>{label}</div>
      <div style={{ font: `700 ${big ? 30 : 22}px/1 var(--mono)`, color: accent, marginTop: 8, letterSpacing: "-0.01em" }}>{value}</div>
      <div style={{ font: "500 10px/1 var(--mono)", color: "var(--muted)", marginTop: 4 }}>{unit}</div>
    </div>
  );
}

function FinalLeaderboard() {
  const rows = [
    { rank: 1, name: "FNG · you", pnl: +93, brier: 0.142, color: "var(--fng)", winner: true },
    { rank: 2, name: "Closer-09",  pnl: +71, brier: 0.168 },
    { rank: 3, name: "Pricing-04", pnl: +24, brier: 0.211 },
    { rank: 4, name: "Market mid", pnl: +0,  brier: 0.232 },
    { rank: 5, name: "ML baseline", pnl: -18, brier: 0.247 },
    { rank: 6, name: "SE-12",      pnl: -22, brier: 0.252 },
    { rank: 7, name: "SDR-Net",    pnl: -41, brier: 0.293 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map(r => (
        <div key={r.name} style={{
          display: "grid", gridTemplateColumns: "26px 1fr 64px 60px",
          gap: 10, alignItems: "center",
          padding: "8px 10px",
          background: r.winner ? "color-mix(in oklab, var(--fng) 10%, var(--surface))" : "transparent",
          border: r.winner ? "1px solid color-mix(in oklab, var(--fng) 50%, var(--border))" : "1px solid transparent",
          borderRadius: 3,
        }}>
          <div style={{ font: "600 12px/1 var(--mono)", color: "var(--dim)" }}>{String(r.rank).padStart(2,"0")}</div>
          <div style={{ font: "600 12px/1 var(--sans)", color: r.color || "var(--text)" }}>{r.name}</div>
          <div style={{ font: "600 12px/1 var(--mono)", color: r.pnl >= 0 ? "var(--buy)" : "var(--sell)", textAlign: "right" }}>
            {r.pnl >= 0 ? "+" : ""}{r.pnl}<span style={{ color: "var(--dim)", fontSize: 9, marginLeft: 2 }}>pp</span>
          </div>
          <div style={{ font: "500 11px/1 var(--mono)", color: "var(--muted)", textAlign: "right" }}>{r.brier.toFixed(3)}</div>
        </div>
      ))}
    </div>
  );
}

window.AgentSimScreens = {
  ScreenSetup, ScreenRun3, ScreenRun10, ScreenCards, ScreenResults
};
