// Master Dashboard status API — pings every tool in the fleet and returns live status
const TOOLS = [
  { id: "agent-dashboard", name: "Agent Dashboard", url: "https://agent-dashboard-six-weld.vercel.app", group: "fleet", desc: "6-agent fleet status w/ 4-tier failover" },
  { id: "skill-landing", name: "Skill Landing Page", url: "https://openclaw-agent-dashboard-failover.vercel.app", group: "fleet", desc: "Agent Dashboard Failover skill funnel" },
  { id: "agent-ctl", name: "Agent Control API", url: "https://agent-dashboard-six-weld.vercel.app/api/status", group: "fleet", desc: "Live fleet status (6 agents, 4-tier failover)" },
  { id: "zarmi", name: "ZarMi Bra Boutique", url: "https://zarmibraboutique.vercel.app", group: "sites", desc: "Client storefront (espresso/mauve/ivory/gold)" },
  { id: "everlasting", name: "Everlasting Memories", url: "https://myeverlastingmemories.com", group: "sites", desc: "Client event business + 35 build tools" },
  { id: "futureready", name: "Future Ready US", url: "https://www.futurereadyus.com", group: "sites", desc: "Client site (IndexNow + GSC fixed)" },
  { id: "sga", name: "SGA Advisers", url: "https://sgadvisers.vercel.app", group: "sites", desc: "Advisory firm site w/ team bios" },
  { id: "pssbl", name: "PSSBL Ventures", url: "https://www.pssblventuresllc.com", group: "sites", desc: "PSSBL Ventures LLC site" },
  { id: "breakout", name: "Breakout AI", url: "https://breakout-ai-one.vercel.app", group: "affiliate", desc: "Affiliate campaign (JVZoo $1,997 FE)" },
  { id: "kdp", name: "KDP Occupied Series", url: "https://kdp-occupied-series.vercel.app", group: "products", desc: "7-book Kindle series dashboard" },
  { id: "audiobooks", name: "Occupied Audiobooks", url: "https://occupied-series-audiobooks.vercel.app", group: "products", desc: "ACX audiobook download page" },
  { id: "finreset", name: "Financial Reset Calculator", url: "https://structuredman-financial-reset.vercel.app", group: "products", desc: "StructuredMan post-divorce money reality check + 90-day plan" },
  { id: "marketing-integration", name: "Marketing Integration LLC", url: "https://marketing-integration-site.vercel.app", group: "sites", desc: "Client site (AEO/SEO/GEO optimized)" },
  { id: "secondbloom", name: "SecondBloom", url: "https://secondbloom-glow.vercel.app", group: "products", desc: "The Second Bloom Method — 8-tool perimenopause ('second puberty') system, 9" },
  { id: "fallform", name: "FallForm", url: "https://fallform.vercel.app", group: "products", desc: "The 14-Day September Reset System — F.A.L.L. Method for home, routines, food, money & Q4" },
  { id: "gutmap", name: "GutMap — FODMAP Freedom Protocol", url: "https://gutmap.vercel.app", group: "products", desc: "FODMAP/IBS gut protocol (9) — landing + order admin + gated downloads" },
  { id: "voiceshield", name: "VoiceShield Protocol", url: "https://voiceshield-protocol.vercel.app", group: "products", desc: "AI voice-clone scam defense ($27) — landing + gated downloads + admin" },
  { id: "dermcode", name: "DermCode — PDRN Glow Protocol", url: "https://dermcode.vercel.app", group: "products", desc: "PDRN skincare ($19) — landing + order admin + gated downloads" },
  { id: "habitbloom", name: "HabitBloom", url: "https://habitbloom.vercel.app", group: "products", desc: "Habit-building system ($27) — landing + payments + thank-you" },
  { id: "dopamine-reset", name: "Dopamine Reset", url: "https://dopamine-reset-theta.vercel.app", group: "products", desc: "Dopamine detox program ($27) — landing + payments + thank-you" },
  { id: "seo-launchpad", name: "SEO Launchpad", url: "https://seo-launchpad-eta.vercel.app", group: "tools", desc: "Audit · Optimize · Deploy console (permanent Vercel URL via tunnel proxy)" },
  { id: "empire-stack", name: "Empire Stack", url: "https://empire-stack.vercel.app", group: "tools", desc: "One URL, every tool — the complete local lead-gen machine hub" },
  { id: "empire-hq", name: "Empire HQ", url: "https://empire-hq-beta.vercel.app", group: "tools", desc: "Morning briefing — run-rate, cash, streak, daily move from LeadFlow + Commission Ledger CSVs" },
  { id: "affiliate-launch-radar", name: "Affiliate Launch Radar", url: "https://affiliate-launch-radar.vercel.app", group: "affiliate", desc: "Next 14 days of affiliate launches (Muncheye) — commission math, Claw-wave & whale alerts" },
];

async function probe(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    return { ok: res.ok || res.status < 500, code: res.status, ms: Date.now() - started };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, code: 0, ms: Date.now() - started, err: e.name === "AbortError" ? "timeout" : "unreachable" };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  try {
    const results = await Promise.all(TOOLS.map(async (t) => {
      const p = await probe(t.url);
      return { id: t.id, name: t.name, url: t.url, group: t.group, desc: t.desc, ...p };
    }));
    const up = results.filter(r => r.ok).length;
    res.status(200).json({ ts: new Date().toISOString(), up, total: results.length, tools: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
