# NexxTrade rebrand + multi-agent selector

Rename displayed brand to **NexxTrade**, adopt the Cladex visual language (dark black, neon lime-green accents, bold display sans-serif, live-trading side widget), add an **AI Agents marketplace** where users pick which strategy trades their Deriv account, and surface **Crypto / Forex as "Coming Soon"** markets. All file paths, table names, worker code, and env vars stay as-is (project remains internally "sparky-trader").

## 1. Brand assets

- Upload `Nexxtrade_Logo.png` as a CDN asset via `lovable-assets` → `src/assets/nexxtrade-logo.png.asset.json`.
- Use it as favicon (root `head().links`, delete `public/favicon.ico`) and in the header/footer of the landing, dashboard, admin, and auth pages.
- Replace every user-visible "Sparky Trader" string with "NexxTrade" (landing, `<title>`, meta, auth page, admin header, dashboard header). Code identifiers, file names, folder names, `package.json` name, published slug — unchanged.

## 2. Visual system (Cladex-inspired)

Update `src/styles.css` tokens only:

- `--background`: near-black `oklch(0.14 0.005 240)` (was blue-tinted dark).
- `--primary` / `--neon` / `--boom`: shift to Cladex lime-green `oklch(0.88 0.22 145)`.
- Remove cyan glow from body background gradient; add subtle vignette + faint grid.
- Fonts: load **Space Grotesk** (display) + **Inter** (body) via `<link>` in `__root.tsx`, expose as `--font-display` and `--font-sans` in `@theme`. Headings use display font at heavy weights (700/800), body uses Inter.
- Update `EngineStatus`, `SymbolGrid`, `PositionsPanel` badge/glow classes to the new green (mechanical class swap, no logic changes).

## 3. Landing page (`src/routes/index.tsx`)

Restructure to match Cladex sections while keeping content honest to NexxTrade:

- **Sticky top nav**: logo + wordmark left; center links (How it works, Agents, Markets, Pricing); right cluster: "Sign in" ghost + neon-green "Launch Free Agent" pill.
- **Hero**: large bold headline "Autonomous AI agents that trade Boom & Crash for you", sub "Deploy AI agents that trade 24/7 on your Deriv account. Non-custodial · Trade-only API.", two CTAs, and a **Live Trading side card** (right of hero on desktop, below on mobile) driven by the existing `live_trade_audit` / `positions` recent rows via a `useSuspenseQuery` — real data when present, seeded demo rows when empty.
- **Ticker strip** under the hero showing the 6 Boom/Crash symbols with live last-tick prices from `symbol_state`.
- **Agents at Work** section: cards for each agent (see §4).
- **Markets** section: three tiles — "Boom & Crash · Live", "Crypto · Coming Soon", "Forex · Coming Soon" (disabled state, muted).
- **How it works** (3 steps), **Safety** section (existing copy, restyled), footer.

Motion kept minimal (framer-motion already used elsewhere isn't required — CSS transitions only).

## 4. AI Agents marketplace

### DB (new migration)

- `public.agents` table: `id uuid pk`, `slug text unique`, `name text`, `tagline text`, `description text`, `strategy_key text` (worker-side identifier), `market text` (`boom_crash` | `crypto` | `forex`), `status text` (`live` | `beta` | `coming_soon`), `risk_level text` (`low`|`medium`|`high`), `avg_trades_per_day int`, `sort_order int`, `created_at timestamptz default now()`.
- `public.user_agent_selections` table: `user_id uuid pk` (references `auth.users`), `agent_id uuid references agents`, `updated_at timestamptz`. One agent per user for now.
- GRANTs per house rules: `agents` → `SELECT` to `anon, authenticated`; `user_agent_selections` → full to `authenticated`, `ALL` to `service_role`. RLS: agents public-read; selections user-scoped (`auth.uid() = user_id`).
- Seed rows in the migration:
  1. **Nicco** — Boom/Crash, `status='live'`, `strategy_key='spike_anticipation'` (current worker strategy).
     the current system running plus its strategy should be named Nicco so that we can add more trading agent within the same app, trading different Strategies
      

    Users should be able to choose which agent should trade for them.
      

    The running system should be called Nicco or any other fancy name
      

    Other agents and their strategies are as follows
      
      
    2.   Agent Nexx
    4-Green-Light Compression
    Four independent indicators must all align simultaneously — Compression Ratio, Tick Pressure State, H1 Price Position, and TSSL score. 
    Only enters when the market is statistically compressed and ready to spike.
      
      
    3.  Agent 007
    H4 RSI Divergence Kingpin
    &nbsp;
    Advanced two-lot architecture. H4 RSI divergence near multi-day price extremes triggers dual positions: a fast scalper for the initial move and a kingpin runner with wide trailing stop for continuation. 
     
      

     
      
    4. Sniper  

    M5 Zone Sniper — Exhaustion Entry  

     Monitors H4 RSI context, H1 streak patterns, and M5 RSI exhaustion simultaneously. Fires only when all three timeframes confirm terminal exhaustion.   refine with live data.
     
      

     
      

     
     
      
      

    AI Brain — Data Mining & Continuous Learning
    Real-Time Decision Engine
      

    Three independent AI brain loops run simultaneously 24/7, evaluating different timeframes and strategy logic every 30–60 seconds.
      

    - Agent Nexx brain: 30s cycle · 4 symbols · 4 green lights require
    - Agent 007 brain: H4 boundary detection · RSI divergence scan
    - Sniper brain: 60s cycle · H4 + H1 + M5 alignment check
    s
    Historical Data Foundation
      

    Every parameter should be derived from 5 months or more of real tick data — not assumptions or manual configuration.
      

    22,680 H1 candles mined across 7 symbols
    271,818 M5 candle rows for sniper analysis
    Full tick history: Nov 2025 → present
    Grid search across thousands of parameter combos
    Parameter Discovery Process
      

    No parameter is manually chosen. Each threshold emerges from exhaustive grid search across the full 5-month backtest period.
    H4 RSI zones grid-searched in 5-point increments
    M5 RSI thresholds tested from 20 to 95
    Trail parameters optimised per symbol via tick simulation
    MAE/MFE analysis determines SL and TP levels
    Live Trade Feedback Loop
      

    Every live trade result feeds back into the system. Exit prices, peak prices, durations, and exit reasons are recorded in real time.
    Every trade: entry, exit, peak, duration logged
    Decision audit trail stored for pattern review
    Live WR compared to backtest WR continuously
    Parameter refinements triggered by live divergence
      
      
    Leave the current system and its signal and trading styles unchanged, just differentiate it and call it Nicco or a better fancy name for an agent
      


### Server functions (`src/lib/agents.functions.ts`)

- `listAgents()` — public, returns all agents ordered by `sort_order`.
- `getMyAgent()` — `requireSupabaseAuth`, returns user's current selection (joined with agent row).
- `selectAgent({ agentId })` — `requireSupabaseAuth`, upserts selection; rejects if agent's `status !== 'live'` and `status !== 'beta'`.

### UI

- New route `src/routes/_authenticated/agents.tsx` — grid of agent cards (name, tagline, market chip, risk, live/coming-soon badge, "Select" or disabled "Coming soon" button). Selected agent shows a green check + neon border.
- Dashboard (`_authenticated/dashboard.tsx`): add a "Your Agent" card at top with current selection + link to `/agents`. If none selected, prompt to pick one before connecting Deriv.
- Add `Agents` link to the landing nav and dashboard nav.

### Worker impact

- **None this pass.** Worker keeps running the single `spike_anticipation` strategy. Selection is stored and displayed; when a second live strategy ships later, worker will branch on `agents.strategy_key` per user. Explicitly documented in the agent card copy ("Additional strategies unlock as they graduate from beta").

## 5. Markets: Crypto & Forex as Coming Soon

- Landing "Markets" section (see §3).
- Dashboard: horizontal tabs `Boom & Crash | Crypto (soon) | Forex (soon)`. Only Boom & Crash tab is enabled; others render a locked panel with an email-me-when-ready note (uses existing auth email — no new capture form).
- No schema, no worker changes. Symbol list stays the 6 existing Boom/Crash pairs.

## 6. Files touched

**New**

- `src/assets/nexxtrade-logo.png.asset.json`
- `src/lib/agents.functions.ts`
- `src/routes/_authenticated/agents.tsx`
- `src/components/AgentCard.tsx`
- `src/components/LiveTradingWidget.tsx`
- `src/components/MarketsSection.tsx`
- `supabase/migrations/<ts>_agents.sql`

**Modified**

- `src/routes/__root.tsx` (fonts link, favicon, meta title)
- `src/routes/index.tsx` (full landing rewrite)
- `src/routes/auth.tsx` (logo + name)
- `src/routes/_authenticated/dashboard.tsx` (agent card, markets tabs, brand)
- `src/routes/_authenticated/admin/route.tsx` and `admin/index.tsx` (brand)
- `src/styles.css` (tokens, fonts)
- `src/routeTree.gen.ts` (auto)

**Deleted**

- `public/favicon.ico` (replaced by CDN PNG favicon)

## 7. Out of scope (unchanged)

- No worker code changes on the DigitalOcean droplet — same single strategy.
- No renames of files, tables, functions, secrets, package name, or published slug.
- No new external API keys.
- No changes to the pre-live hardening plan (`.lovable/plan.md`) — that continues in parallel.

## Deployment

No droplet redeploy needed. Standard preview → publish once you approve the look.  
  
Also remove every traces of AI slop website and elements