/* global React */
const { useState, useMemo } = React;

// ─────────────────────────────────────────────
//  PRIMITIVES
// ─────────────────────────────────────────────

const Chip = ({ kind = "", dot, children, style }) => (
  <span className={`chip ${dot ? "dot" : ""} ${kind}`} style={style}>{children}</span>
);

const Tag = ({ children, style }) => <span className="tag" style={style}>{children}</span>;

// Square reticle / corner brackets used as a board motif
const Reticle = ({ size = 10, color = "var(--border-2)", style }) => (
  <span style={{ display: "inline-block", width: size, height: size, position: "relative", ...style }}>
    <span style={{ position: "absolute", left: 0, top: 0, width: 4, height: 1, background: color }} />
    <span style={{ position: "absolute", left: 0, top: 0, width: 1, height: 4, background: color }} />
    <span style={{ position: "absolute", right: 0, top: 0, width: 4, height: 1, background: color }} />
    <span style={{ position: "absolute", right: 0, top: 0, width: 1, height: 4, background: color }} />
    <span style={{ position: "absolute", left: 0, bottom: 0, width: 4, height: 1, background: color }} />
    <span style={{ position: "absolute", left: 0, bottom: 0, width: 1, height: 4, background: color }} />
    <span style={{ position: "absolute", right: 0, bottom: 0, width: 4, height: 1, background: color }} />
    <span style={{ position: "absolute", right: 0, bottom: 0, width: 1, height: 4, background: color }} />
  </span>
);

// Bracketed section header — game-like
const BracketHeading = ({ kicker, title, right, style }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, ...style }}>
    <Reticle />
    <div style={{ font: "600 10px/1 var(--mono)", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)" }}>
      {kicker}
    </div>
    {title ? (
      <div style={{ font: "500 13px/1 var(--sans)", color: "var(--text)" }}>{title}</div>
    ) : null}
    <div style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
    {right}
  </div>
);

// ─────────────────────────────────────────────
//  PROBABILITY STRIP — visualises ML, Market, FNG (and outcome on results)
// ─────────────────────────────────────────────
const ProbStrip = ({ ml, mkt, fng, target = 60, outcome, height = 26, showTarget = true }) => {
  const Marker = ({ value, color, label, top = false, big = false }) => (
    <div style={{ position: "absolute", left: `${value}%`, top: 0, bottom: 0, transform: "translateX(-50%)" }}>
      <div style={{
        position: "absolute", top: top ? -10 : "auto", bottom: top ? "auto" : -10,
        left: "50%", transform: "translateX(-50%)",
        font: "600 8.5px/1 var(--mono)", letterSpacing: "0.06em",
        color, whiteSpace: "nowrap"
      }}>{label}</div>
      <div style={{
        position: "absolute", top: 2, bottom: 2, left: "50%",
        transform: "translateX(-50%)",
        width: big ? 3 : 2, background: color
      }} />
    </div>
  );

  return (
    <div style={{ position: "relative", paddingTop: 12, paddingBottom: 12 }}>
      {/* target band */}
      {showTarget && (
        <div style={{
          position: "absolute", top: 12, height: height,
          left: `${target - 0.5}%`, width: 1.5,
          background: "color-mix(in oklab, var(--amber) 80%, transparent)",
          boxShadow: "0 0 0 0.5px color-mix(in oklab, var(--amber) 40%, transparent)",
          zIndex: 3
        }} />
      )}
      <div style={{
        position: "relative", height,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 2,
        overflow: "hidden"
      }}>
        {/* tick marks every 10 */}
        {[10,20,30,40,50,60,70,80,90].map(t => (
          <div key={t} style={{ position: "absolute", left: `${t}%`, top: 0, bottom: 0, width: 1, background: t === 50 ? "var(--border-2)" : "var(--hairline)" }} />
        ))}
        {/* outcome shading (for results) */}
        {outcome === "win" && (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, transparent 60%, color-mix(in oklab, var(--buy) 20%, transparent) 100%)" }} />
        )}
        {outcome === "loss" && (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, color-mix(in oklab, var(--sell) 20%, transparent) 0%, transparent 40%, transparent 100%)" }} />
        )}
        <Marker value={ml}  color="var(--ml)"  label={`ML ${ml}`}   top />
        <Marker value={mkt} color="var(--mkt)" label={`MKT ${mkt}`} top={false} big />
        <Marker value={fng} color="var(--fng)" label={`FNG ${fng}`} top />
        {outcome === "win" && (
          <div style={{ position: "absolute", left: "100%", top: 0, bottom: 0, transform: "translateX(-100%)", width: 6, background: "var(--buy)" }} />
        )}
        {outcome === "loss" && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: "var(--sell)" }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, font: "500 9px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.08em" }}>
        <span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span>
      </div>
    </div>
  );
};

// Mini probability strip without labels — for compact deal rows
const MiniProb = ({ ml, mkt, fng, target = 60, height = 14 }) => (
  <div style={{ position: "relative", height, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 2, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border-2)" }} />
    <div style={{ position: "absolute", left: `${target}%`, top: -1, bottom: -1, width: 1, background: "var(--amber)", opacity: 0.7 }} />
    <div style={{ position: "absolute", left: `${ml}%`,  top: 2, bottom: 2, width: 2, background: "var(--ml)",  transform: "translateX(-50%)" }} />
    <div style={{ position: "absolute", left: `${mkt}%`, top: 1, bottom: 1, width: 2, background: "var(--mkt)", transform: "translateX(-50%)" }} />
    <div style={{ position: "absolute", left: `${fng}%`, top: 2, bottom: 2, width: 2, background: "var(--fng)", transform: "translateX(-50%)" }} />
  </div>
);

// ─────────────────────────────────────────────
//  TOP RAIL / HUD
// ─────────────────────────────────────────────
const HudCell = ({ kicker, value, sub, accent, span = 1, mono = true, right }) => (
  <div style={{
    flex: span,
    padding: "10px 14px",
    borderRight: "1px solid var(--hairline)",
    display: "flex", flexDirection: "column", gap: 4,
    minWidth: 0,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ font: "600 9px/1 var(--mono)", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dim)" }}>{kicker}</div>
      {right}
    </div>
    <div style={{ font: `600 18px/1 ${mono ? "var(--mono)" : "var(--sans)"}`, color: accent || "var(--text)", letterSpacing: "0.01em" }}>{value}</div>
    {sub && <div style={{ font: "500 10px/1 var(--mono)", color: "var(--muted)", letterSpacing: "0.04em" }}>{sub}</div>}
  </div>
);

// ─────────────────────────────────────────────
//  INTEL CARD — used in priority stack and library
// ─────────────────────────────────────────────
const KIND_META = {
  metric:  { label: "METRIC",  color: "var(--ml)",     glyph: "▦" },
  process: { label: "PROCESS", color: "var(--ink)",    glyph: "◇" },
  agent:   { label: "AGENT",   color: "var(--fng)",    glyph: "◉" },
  gossip:  { label: "RUMOR",   color: "var(--rumor)",  glyph: "≈" },
  signal:  { label: "SIGNAL",  color: "var(--signal)", glyph: "✦" },
};

const IntelCard = ({ kind, dealId, title, body, disagreement, source, freshness, compact, rumorReliability }) => {
  const meta = KIND_META[kind];
  const isGossip = kind === "gossip";
  return (
    <div className="card" style={{
      padding: compact ? "10px 12px" : "12px 14px",
      borderColor: isGossip ? "color-mix(in oklab, var(--rumor) 30%, var(--border))" : "var(--border)",
      position: "relative",
      overflow: "hidden",
    }}>
      {isGossip && (
        <div className="rumor-stripes" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
      )}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: compact ? 6 : 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="tag" style={{ color: meta.color, borderColor: `color-mix(in oklab, ${meta.color} 40%, var(--border))` }}>
            {meta.glyph} {meta.label}
          </span>
          <span className="tag" style={{ color: "var(--muted)" }}>{dealId}</span>
          {isGossip && rumorReliability && (
            <span className="tag" style={{ color: "var(--rumor)", background: "transparent", borderColor: "color-mix(in oklab, var(--rumor) 50%, var(--border))" }}>
              REL · {rumorReliability}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {disagreement != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ font: "600 9px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.1em" }}>Δ</span>
              <span style={{ font: "600 12px/1 var(--mono)", color: disagreement > 18 ? "var(--amber)" : "var(--ink)" }}>
                {disagreement}
              </span>
            </div>
          )}
        </div>
        <div style={{ font: `600 ${compact ? 12 : 13}px/1.35 var(--sans)`, color: "var(--text)" }}>
          {title}
        </div>
        {!compact && body && (
          <div style={{ font: "400 11px/1.5 var(--sans)", color: "var(--muted)" }}>{body}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ font: "500 9.5px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.08em" }}>
            {source}
          </span>
          <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
          <span style={{ font: "500 9.5px/1 var(--mono)", color: "var(--dim)" }}>{freshness}</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  ACTION CONTROL — Buy/Hold/Sell + 1..5 confidence
// ─────────────────────────────────────────────
const ActionControl = ({ stance = "buy", conf = 3 }) => {
  const opts = [
    { id: "buy",  label: "BUY",  color: "var(--buy)" },
    { id: "hold", label: "HOLD", color: "var(--hold)" },
    { id: "sell", label: "SELL", color: "var(--sell)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
        {opts.map((o, i) => {
          const active = stance === o.id;
          return (
            <div key={o.id} style={{
              flex: 1, padding: "7px 8px",
              font: "600 10.5px/1 var(--mono)", letterSpacing: "0.1em",
              textAlign: "center",
              background: active ? `color-mix(in oklab, ${o.color} 14%, var(--surface-2))` : "var(--surface-2)",
              color: active ? o.color : "var(--muted)",
              borderRight: i < opts.length - 1 ? "1px solid var(--border)" : "0",
              boxShadow: active ? `inset 0 -2px 0 ${o.color}` : "none",
            }}>{o.label}</div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <div style={{ font: "600 9px/1 var(--mono)", letterSpacing: "0.14em", color: "var(--dim)" }}>CONF</div>
        {[1,2,3,4,5].map(n => {
          const active = n <= conf;
          return (
            <div key={n} style={{
              flex: 1, height: 18,
              border: "1px solid var(--border)",
              background: active ? "var(--fng)" : "var(--surface-2)",
              opacity: active ? (0.4 + n * 0.12) : 1,
              borderRadius: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              font: "600 10px/1 var(--mono)",
              color: active ? "#002028" : "var(--dim)"
            }}>{n}</div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
//  DEAL CARD — varies in density
// ─────────────────────────────────────────────
const DealCard = ({ deal, density = "default" }) => {
  // density: default | dense
  const dense = density === "dense";
  const pnlColor = deal.pnl >= 0 ? "var(--buy)" : "var(--sell)";

  if (dense) {
    return (
      <div className="card" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 28, font: "600 12px/1 var(--mono)", color: "var(--dim)" }}>{deal.code}</div>
        <div style={{ width: 180, minWidth: 0 }}>
          <div style={{ font: "600 12px/1.2 var(--sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.account}</div>
          <div style={{ font: "500 10px/1.2 var(--mono)", color: "var(--muted)", marginTop: 3, letterSpacing: "0.04em" }}>
            {deal.acv}  ·  {deal.target}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <MiniProb ml={deal.ml} mkt={deal.mkt} fng={deal.fng} target={deal.targetProb} />
        </div>
        <div style={{ width: 90, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ font: "500 9px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.1em" }}>FNG · MKT</div>
          <div style={{ font: "600 12px/1 var(--mono)" }}>
            <span style={{ color: "var(--fng)" }}>{deal.fng}</span>
            <span style={{ color: "var(--dim)" }}> · </span>
            <span style={{ color: "var(--mkt)" }}>{deal.mkt}</span>
          </div>
        </div>
        <div style={{ width: 70, textAlign: "right", font: "600 13px/1 var(--mono)", color: pnlColor }}>
          {deal.pnl >= 0 ? "+" : ""}{deal.pnl}<span style={{ color: "var(--dim)", fontSize: 9, marginLeft: 2 }}>pp</span>
        </div>
        <div style={{ width: 200 }}>
          <ActionControl stance={deal.stance} conf={deal.conf} />
        </div>
      </div>
    );
  }

  // default
  return (
    <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="tag" style={{ color: "var(--ink)" }}>{deal.code}</span>
            <span className="tag" style={{ color: deal.stage === "Late" ? "var(--amber)" : "var(--muted)" }}>{deal.stage}</span>
          </div>
          <div style={{ font: "600 15px/1.2 var(--sans)", marginTop: 6 }}>{deal.account}</div>
          <div style={{ font: "500 11px/1.3 var(--mono)", color: "var(--muted)", marginTop: 4 }}>
            {deal.acv} ACV · close {deal.close}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ font: "500 9px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.14em", textTransform: "uppercase" }}>P&L</div>
          <div style={{ font: "700 22px/1 var(--mono)", color: pnlColor, marginTop: 6 }}>
            {deal.pnl >= 0 ? "+" : ""}{deal.pnl}
            <span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 3 }}>pp</span>
          </div>
        </div>
      </div>

      <div className="hr" />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ font: "500 9px/1 var(--mono)", letterSpacing: "0.16em", color: "var(--dim)" }}>TARGET</div>
        <div style={{ font: "600 11px/1 var(--sans)", color: "var(--amber)" }}>{deal.target}</div>
        <div style={{ flex: 1 }} />
        <div style={{ font: "500 9px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.1em" }}>P(target) · 30d</div>
      </div>

      <ProbStrip ml={deal.ml} mkt={deal.mkt} fng={deal.fng} target={deal.targetProb} />

      <ActionControl stance={deal.stance} conf={deal.conf} />
    </div>
  );
};

// ─────────────────────────────────────────────
//  TOP RAIL
// ─────────────────────────────────────────────
const TopRail = ({ day = 14, mode = "TEAM", wallet = 1240, pnl = +186, leader = "FNG", deals = 3 }) => (
  <div className="card" style={{ display: "flex", alignItems: "stretch", padding: 0, borderRadius: 4 }}>
    <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, borderRight: "1px solid var(--hairline)", minWidth: 168 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 4,
        border: "1px solid var(--fng)",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "color-mix(in oklab, var(--fng) 12%, transparent)",
        color: "var(--fng)", font: "700 12px/1 var(--mono)"
      }}>FNG</div>
      <div>
        <div style={{ font: "600 10px/1 var(--mono)", color: "var(--dim)", letterSpacing: "0.16em" }}>PLAYER</div>
        <div style={{ font: "600 13px/1.2 var(--sans)", marginTop: 4 }}>fng_2604</div>
      </div>
    </div>
    <HudCell kicker="DAY" value={`${day} / 30`} sub={`Run · ${deals} deals`} />
    <HudCell kicker="WALLET" value={`§ ${wallet.toLocaleString()}`} sub="Free margin §412" />
    <HudCell kicker="LIVE P&L"  value={`${pnl >= 0 ? "+" : ""}${pnl} pp`} sub="vs. opening market"
      accent={pnl >= 0 ? "var(--buy)" : "var(--sell)"} />
    <HudCell kicker="MODE"  value={mode} sub={mode === "TEAM" ? "FNG vs 4 agents" : mode === "AGENT FOCUS" ? "1v1 · Closer-09" : "FNG vs market"} mono={false} />
    <HudCell kicker="LEADER" value={leader} sub={leader === "FNG" ? "+18 pp ahead" : "FNG –6 pp"}
      accent={leader === "FNG" ? "var(--fng)" : "var(--text)"} />
    <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 8, minWidth: 200 }}>
      <button className="btn ghost" style={{ height: 36 }}>Skip Day</button>
      <button className="btn primary" style={{ height: 36, flex: 1 }}>Lock & Advance ▸</button>
    </div>
  </div>
);

// ─────────────────────────────────────────────
//  PRIORITY STACK (intel feed, ranked by Δ disagreement)
// ─────────────────────────────────────────────
const PriorityStack = ({ items, dense }) => (
  <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
    <BracketHeading
      kicker="PRIORITY STACK"
      title={<span style={{ color: "var(--muted)" }}>ranked by ML ↔ MKT ↔ FNG disagreement</span>}
      right={
        <div style={{ display: "flex", gap: 6 }}>
          <span className="tag" style={{ color: "var(--ml)" }}>ML</span>
          <span className="tag" style={{ color: "var(--mkt)" }}>MKT</span>
          <span className="tag" style={{ color: "var(--fng)" }}>FNG</span>
        </div>
      }
    />
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <div style={{
            width: 22, paddingTop: 10,
            font: "700 12px/1 var(--mono)", color: "var(--dim)",
            textAlign: "center"
          }}>{String(i + 1).padStart(2, "0")}</div>
          <div style={{ flex: 1 }}>
            <IntelCard {...it} compact={dense} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

window.AgentSim = {
  Chip, Tag, Reticle, BracketHeading,
  ProbStrip, MiniProb,
  HudCell, IntelCard, ActionControl,
  DealCard, TopRail, PriorityStack,
  KIND_META,
};
