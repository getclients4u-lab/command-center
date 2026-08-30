// Fix endpoint — executes the auto-fixable action for a tool
const FIXES = {
  // agent-ctl restart via agent dashboard's own restart API
  "agent-ctl": {
    type: "restart",
    run: async () => {
      // Restart the fleet control service via the agent dashboard's own restart API
      const r = await fetch("https://agent-dashboard-six-weld.vercel.app/api/restart", {
        method: "POST",
        body: JSON.stringify({ agent: "jonas" }),
        headers: { "Content-Type": "application/json" }
      });
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok, detail: d };
    }
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const id = req.query.id;
  const action = req.query.action;
  if (!id || !action) return res.status(400).json({ error: "id and action required" });

  if (action === "dns-cleanup") {
    // Manual action — we give precise instructions, cannot change DNS via API
    return res.status(200).json({
      ok: false, manual: true,
      message: "DNS cleanup can't be automated from here. Go to your DNS provider (registrar/Cloudflare/GoDaddy), delete the dead A record(s) listed in Diagnose, and keep only the live ones. Takes 2 minutes."
    });
  }

  const fx = FIXES[id];
  if (!fx || fx.type !== action) {
    return res.status(200).json({ ok: false, manual: true, message: `No automated fix for '${action}' on '${id}'. Manual intervention required.` });
  }

  try {
    const result = await fx.run();
    res.status(200).json({ ok: result.ok, detail: result.detail });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
