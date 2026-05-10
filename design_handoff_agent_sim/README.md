# Handoff: Boiler Room — Agent Sim

## Overview
Agent Sim is a turn-based card-strategy forecasting game embedded inside Boiler Room. The player ("FNG") competes against AI sales-agent personas to produce the closest probability forecast for assigned enterprise sales-deal outcomes. The product is for executives, so it must feel tactical and game-like while remaining credible for enterprise forecasting — a "Revenue War Room", not a generic CRM dashboard.

The bundled HTML in this folder is a **design reference**, not production code. It is a hi-fi wireframe built in React + Babel inline, and includes 5 artboards: Setup, Run-3-deals, Run-10-deals (floor density), Results, and an Intel-card library. Use these as the source of truth for layout, hierarchy, copy, and interaction model when reimplementing in the live Boiler Room codebase against real CRM/pipeline data.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these HTML designs in the Boiler Room codebase's existing environment** (React + whatever component library / token system Boiler Room uses) following its established patterns. Treat the JSX in `components.jsx` and `screens.jsx` as a structural blueprint, not a drop-in.

If Boiler Room does not yet have a frontend environment, recreate in React + TypeScript with CSS modules or vanilla-extract; the design tokens in `tokens.css` translate cleanly to either.

## Fidelity
**High-fidelity wireframe.** Final colors, typography (Geist + Geist Mono), spacing, copy, and interaction model are settled. The developer should recreate the UI close to pixel-fidelity using Boiler Room's existing component library where one exists (buttons, chips, cards), and lift exact values from `tokens.css` for color/space/type tokens that have no equivalent.

The data shown is mock — every number, account name, and probability needs to be wired to live sources (see "Data Wiring" below).

---

## Screens / Views

### 1. Setup screen — `ScreenSetup`
Source: `screens.jsx`. Frame: 1280×880.

**Purpose:** Player drafts a run before stepping onto the board.

**Layout (top to bottom):**
- Title bar — small reticle glyph + `BOILER ROOM · AGENT SIM` mono kicker (cyan #22d3ee), spacer rule, run id `RUN · 2604-A · DRAFTING` on the right.
- Hero — left: `WAR ROOM // SETUP` micro-kicker + 44px Geist-500 headline ("Build the run. / FNG against the agents."). Right: a small `BRIEFING` card explaining the run mechanic.
- **01 · MODE** — three equal-width selectable cards in a CSS grid:
  - **Team** — "FNG vs 4 agents". Diagram shows 4 role boxes (SE, SDR, CLR, PRC) with FNG card hovering above.
  - **Agent Focus** — "1-on-1 duel". Diagram shows two boxes (FNG vs CLOSER-09) connected by a dashed line through an amber circle.
  - **Silent Market** — "FNG vs market". Diagram shows FNG on the left and market grid on the right with `MARKET MID` and `ML BASELINE` lines.
  - Active mode gets cyan border + faint cyan tint background + `fng-glow` (cyan box shadow) + filled radio dot.
- **02 · DEAL COUNT** — four equal-width selectable cards: 1 (Sniper), 3 (Standard), 5 (Bench, recommended), 10 (Floor). Each card: big mono number on the left (38px, cyan when active), name + description, wallet allocation on the right (`§ N × 400`).
- **03 · ASSIGNMENT** — single-row footer card with amber tag, briefing copy, `Reseed pool` ghost button, primary `▸ Deploy run · N deals · MODE` button.

**State:** `mode: "TEAM" | "AGENT FOCUS" | "SILENT MARKET"`, `count: 1 | 3 | 5 | 10`. Clicking either selector updates state and styling.

### 2. Run screen — `ScreenRun3` (default density)
Source: `screens.jsx`. Frame: 1440×980. Day 14, Team mode, 3 deals.

**Layout:**
- **Run header** — Reticle + `BOILER ROOM · AGENT SIM // RUN · 2604-A` left; `Tape`, `Rules`, `Concede` ghost buttons right.
- **Top rail (HUD)** — single horizontal card with hairline-divided cells:
  - Player chip (FNG cyan box + handle `fng_2604`)
  - `DAY 14 / 30` · `Run · 3 deals`
  - `WALLET § 1,240` · `Free margin §412`
  - `LIVE P&L +186 pp` (green) · `vs. opening market`
  - `MODE TEAM` · `FNG vs 4 agents`
  - `LEADER FNG` · `+18 pp ahead` (cyan)
  - `Skip Day` ghost + `Lock & Advance ▸` primary
- **Two-column body (380px / 1fr):**
  - Left: **Priority Stack** — `BracketHeading` + numbered list (01, 02, ...) of intel cards ranked by Δ disagreement.
  - Right column:
    - `BracketHeading` "ACTIVE DEALS · 03" with ML / MKT / FNG / TARGET legend chips.
    - 3-column grid of `DealCard`s.
    - `DayTimeline` — full 30-day strip with today marker.
    - `AgentLeaderboard` — 5 rows (FNG, Closer-09, Pricing-04, SE-12, SDR-Net) with bipolar P&L bars.

**DealCard (default):**
- Top: `D-NN` + stage tag (`Late` is amber); account name (15px Geist-600); `$ ACV · close Q2-WNN`.
- Right: large P&L mono number (`+28 pp` in green or red).
- Hairline divider.
- Target row: amber `TARGET` text e.g. "Closed-Won by Day 30".
- Probability strip (`ProbStrip`):
  - Outer band 0–100 with tick marks every 10, heavier 50% mid line.
  - Amber vertical line at the target probability.
  - ML marker (blue, label above), Market marker (white, big bar, label below), FNG marker (cyan, label above).
- `ActionControl`: segmented Buy / Hold / Sell (active gets tinted bg + 2px underline in stance color); below it a 5-cell confidence ladder — active cells fill cyan with progressive opacity (0.4 + n×0.12).

### 3. Run screen — `ScreenRun10` (floor density)
Source: `screens.jsx`. Frame: 1440×1080. Day 22, Silent Market mode, 10 deals.

Same shell as Run-3 with the following swaps:
- Stack uses `dense` mode (compact intel cards, no body copy).
- Active deals area uses a column-header strip + one-row `DealCard` per deal:
  - 28px ID · 180px account+target · flexible `MiniProb` strip · 90px FNG·MKT readout · 70px right-aligned P&L · 200px ActionControl.
- No per-deal ProbStrip labels; the legend lives in the section header.

**Why two densities:** the same component should switch via a `density` prop. 1, 3, 5 deals → default; 10 deals → dense rows. The user explicitly required the layout to support all four counts without visual overload.

### 4. Results screen — `ScreenResults`
Source: `screens.jsx`. Frame: 1440×980.

**Layout:**
- Run header (`DAY 30 · CLOSED`).
- **Winner banner** — large card with cyan border, faint cyan gradient background, `fng-glow`. Left: `FORECAST WINNER` kicker + 44px headline ("FNG takes the run."). Right: 4 stat cells (P&L `+93 pp`, Brier `0.142`, Hit Rate `2 / 3`, Wallet `§ 1,612`).
- Two-column body (1fr / 360px):
  - **Per-deal settlement** — for each deal: account block (left) + `ProbStrip` showing ML/MKT/FNG markers with outcome shading (green-right for win, red-left for loss) and a 6px solid bar at the actual outcome end + outcome tag + P&L (right).
  - **Final leaderboard** — 7 rows (FNG, Closer-09, Pricing-04, Market mid, ML baseline, SE-12, SDR-Net), winner row highlighted cyan. Columns: rank, name, P&L, Brier. Footer CTAs: `Replay run with annotations`, `Draft new run`, `Export tape · CSV`.

### 5. Intel card library — `ScreenCards`
Source: `screens.jsx`. Frame: 980×880.

Shows the four intel-card classes at full size. Each card variant uses the shared `IntelCard` component:
- **METRIC** (blue glyph ▦) — deterministic CRM/pipeline data. Source label `crm · activity · deterministic`.
- **PROCESS** (white glyph ◇) — legal/security/procurement gating. Source label `process · sec-ops`.
- **AGENT** (cyan glyph ◉) — in-character actions from AI sales-agent personas. Source label `agent · closer-09 · in-character`.
- **GOSSIP / RUMOR** (purple glyph ≈) — diagonal-stripe overlay (`.rumor-stripes`), purple border, `RUMOR` tag, plus a NATO-style reliability code (A1 → D5) shown as a tag, e.g. `REL · C2`.

Each card has: kind tag, deal id tag, optional reliability tag, headline, 1–2 line body, source label + freshness (e.g. `+6h`, `+1d`), Δ disagreement number on the right (amber if > 18).

Below the grid: a `RUMOR LEDGER` strip explaining reliability codes A1 (green) through D5 (purple) and noting that acting on D-tier rumor incurs a noise penalty in run summary.

---

## Interactions & Behavior

### Setup
- Click a mode card → set `mode` state, update visual.
- Click a deal-count card → set `count` state.
- `Deploy run` → POST run config to backend, navigate to Run screen with assigned deals.

### Run loop
- Each deal's `ActionControl` requires both a stance (Buy / Hold / Sell) and a confidence (1–5).
- `Lock & Advance ▸` is **disabled** until every active deal has both fields set; tooltip should say "N deals awaiting stance".
- On lock: submit all stances, advance day counter, reroll the Priority Stack, recompute P&L and leader. The Day counter ticks one game-day per submission.
- `Skip Day` advances without submitting (forfeits potential P&L for the skipped day).
- Card click in Priority Stack should pop a side drawer with full card detail + "pin to deal" action (not in mock; recommended).

### Settlement
- When the underlying real-world deal closes (or Day 30 elapses), each deal settles:
  - Outcome = boolean (target met / not met).
  - FNG P&L = scoring function over (FNG implied probability, outcome). The mock uses `pp` (probability points) as the unit. Recommend Brier-score-derived points for real implementation.
  - Final aggregate winner = lowest Brier score.

### Animation / motion
- Day advance: HUD numbers transition with a 200ms ease-out tween. Priority Stack items animate in with a 60ms-staggered translateY(8px) → 0.
- Selection states (mode, count): 120ms ease border-color + box-shadow.
- Probability marker positions: 240ms cubic-bezier(.2,.8,.2,1) when values change.

### Keyboard
- `1`–`5` set confidence on the focused deal.
- `B` / `H` / `S` set stance.
- `Tab` cycles deals.
- `Enter` (when run is fully locked) advances day.

---

## State Management

```ts
type RunMode = "TEAM" | "AGENT_FOCUS" | "SILENT_MARKET";
type Stance  = "buy" | "hold" | "sell";

interface RunConfig {
  mode: RunMode;
  dealCount: 1 | 3 | 5 | 10;
}

interface Deal {
  id: string;            // "D-01"
  accountName: string;
  acv: number;           // dollars
  closeDate: string;     // ISO
  stage: "Early" | "Mid" | "Late";
  target: string;        // human-readable target, e.g. "Closed-Won by Day 30"
  targetProb: number;    // 0..100
  ml: number;            // baseline probability, 0..100
  mkt: number;           // market mid, 0..100
  fng: number;           // FNG implied probability, 0..100
  pnl: number;           // probability points
  stance: Stance | null;
  conf:   1 | 2 | 3 | 4 | 5 | null;
}

interface IntelCard {
  id: string;
  kind: "metric" | "process" | "agent" | "gossip";
  dealId: string;
  title: string;
  body: string;
  disagreement: number;          // |max - min| of (ml, mkt, fng) implied
  source: string;                // e.g. "crm · activity"
  freshness: string;             // "+6h", "+1d"
  rumorReliability?: "A1" | "B2" | "C2" | "D3" | "D5";
}

interface RunState {
  config: RunConfig;
  day: number;            // 1..30
  wallet: number;
  livePnl: number;        // pp
  leader: string;
  deals: Deal[];
  stack: IntelCard[];     // sorted by disagreement desc
  agents: { name: string; pnl: number; impliedProb: number }[];
  closed: boolean;
}
```

### Data wiring (live)
- **Deterministic metric cards:** subscribe to CRM/pipeline events (Salesforce / HubSpot / Gong). Recompute disagreement on each update. Throttle to one card per (deal, signal) per game-day.
- **Process cards:** webhook from procurement / legal / security tooling.
- **Agent cards:** generated by your sales-agent persona service. Each persona must emit a structured event with a `stance` + `confidence` so its position can be priced into the market.
- **Gossip cards:** sourced from less-structured channels (Slack, SDR notes). Run a reliability classifier; surface in the stack with the NATO code.
- **Market mid:** opinion-pool aggregate of all participating agents + FNG, weighted by wallet. Recompute every action.
- **ML baseline:** existing pipeline forecasting model — read-only.

---

## Design Tokens

All in `tokens.css`. Lift verbatim if Boiler Room has no equivalents.

### Colors
| Token | Value | Use |
|---|---|---|
| `--bg` | `#070a11` | Board background |
| `--bg-2` | `#0b0f18` | Slightly raised board |
| `--surface` | `#0f1422` | Cards |
| `--surface-2` | `#161c2c` | Secondary cards / probability strip background |
| `--surface-3` | `#1c2338` | Tertiary surface / tag background |
| `--border` | `#232a3d` | Default card border |
| `--border-2` | `#2e3852` | Stronger border / mid-line |
| `--hairline` | `#1a2034` | Divider rules |
| `--text` | `#e6e8ee` | Primary text |
| `--ink` | `#c4cad9` | Slightly muted primary |
| `--muted` | `#8a93a7` | Secondary text |
| `--dim` | `#5a6378` | Tertiary / micro-labels |
| `--fng` | `#22d3ee` | Player accent (cyan) |
| `--ml` | `#6aa9ff` | ML baseline marker (blue) |
| `--mkt` | `#f4f6fb` | Market mid marker (white) |
| `--buy` | `#34d399` | Buy stance / positive P&L (green) |
| `--sell` | `#f87171` | Sell stance / negative P&L (red) |
| `--hold` | `#b8c0d0` | Hold stance |
| `--amber` | `#fbbf24` | Target line / late stage / caution |
| `--rumor` | `#a78bfa` | Gossip cards (purple) |
| `--signal` | `#f0abfc` | Reserved (signal class) |

### Typography
- Sans: `Geist` weights 400/500/600/700 (fallback: Inter, system-ui).
- Mono: `Geist Mono` weights 400/500/600/700 (fallback: JetBrains Mono, ui-monospace).
- Tabular numerics on every numeric value (`.tab` or `.mono` utility).
- Micro-kickers: 9–11px, `text-transform: uppercase`, `letter-spacing: 0.14–0.24em`, color `--dim` or `--muted`.
- Headline scale: 44 / 30 / 22 / 18 / 15 / 13 / 12 (Geist 500/600 with `letter-spacing: -0.01em` on 22+).

### Radius / shape
- `--rad: 3px` (chips, tags, controls).
- `--rad-2: 6px` (cards).
- No drop shadows on cards. Cyan glow (`.fng-glow`) reserved for active selection and the winner banner.

### Spacing
- 4 / 6 / 8 / 10 / 12 / 14 / 18 / 22 / 28 / 36 px scale (no fixed scale variable; values are inline). Recommend codifying as a 4px base scale.

### Special primitives
- `.board-bg` — radial cyan/purple wash + 40px hairline grid masked to a soft circle. Use as the screen-level background.
- `.rumor-stripes` — 45° purple repeating-linear-gradient overlay, opacity 0.5. Apply absolutely behind gossip-card content.
- `Reticle` — 10px corner-bracket SVG-like primitive built from absolutely-positioned 1px spans. Used in section headings.

---

## Assets
None. There are no raster assets — all visuals are CSS / inline SVG. Fonts are loaded via Google Fonts CSS link. Mode-card diagrams are tiny inline SVGs in `screens.jsx` (`ModeDiagramTeam`, `ModeDiagramAgent`, `ModeDiagramSilent`).

If you have a Boiler Room logotype, replace the `BOILER ROOM · AGENT SIM` mono lockup in headers.

---

## Files

- `Agent Sim Wireframe.html` — entry point. Loads tokens, components, screens, and renders 5 artboards inside the `DesignCanvas` starter component.
- `tokens.css` — design tokens + utility classes.
- `components.jsx` — shared primitives:
  - `Chip`, `Tag`, `Reticle`, `BracketHeading`
  - `ProbStrip`, `MiniProb` — the probability comparison viz
  - `HudCell`, `TopRail` — top run-rail HUD
  - `IntelCard` — used in Priority Stack and library
  - `ActionControl` — Buy/Hold/Sell + 1–5 confidence
  - `DealCard` — supports `density="default" | "dense"`
  - `PriorityStack` — numbered list of IntelCards
- `screens.jsx` — five top-level screens: `ScreenSetup`, `ScreenRun3`, `ScreenRun10`, `ScreenCards`, `ScreenResults` plus mock data arrays (`STACK_ITEMS`, `DEALS_3`, `DEALS_10`).
- `design-canvas.jsx` — pan/zoom canvas shell that hosts the 5 artboards. Not needed in the live product; used only to present the wireframe.

---

## Open questions / call-outs for the implementing dev

1. **Scoring:** decide between raw "probability points" (mock) and Brier-score-derived points (more standard). Brier is shown on the Results leaderboard already.
2. **Priority Stack ordering:** mock sorts by Δ between max and min of (ML, MKT, FNG). Confirm whether the ML↔FNG delta should be weighted higher than ML↔MKT.
3. **Per-deal targets:** mock shows freeform strings ("ACV ≥ $400K & Won"). The system needs a structured target schema (predicate over deal facts) so settlement is deterministic.
4. **Agent personas:** the four roles in Team mode (SE, SDR, Closer, Pricing) are placeholders. Confirm canonical persona list and each persona's wallet allocation.
5. **Rumor reliability:** A1–D5 NATO grading is a design choice. Replace with whatever the existing rumor classifier emits.
6. **Day cadence:** mock uses 30 in-game days. Confirm whether 1 game-day = 1 real-world day, or whether a run is condensed (e.g. 30 days simulated over an hour).
