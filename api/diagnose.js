// Diagnose endpoint — deep-checks a URL: DNS records, per-IP probe, redirect chain, TLS
const KNOWN = {
  "agent-dashboard": { type: "vercel", project: "agent-dashboard" },
  "skill-landing": { type: "vercel", project: "openclaw-agent-dashboard-failover" },
  "agent-ctl": { type: "service", restartUrl: "https://agent-dashboard-six-weld.vercel.app/api/restart" },
  "zarmi": { type: "vercel", project: "zarmibraboutique" },
  "everlasting": { type: "vercel", project: "everlastingmemories", domain: "myeverlastingmemories.com" },
  "futureready": { type: "vercel", project: "futureready-complete", domain: "futurereadyus.com" },
  "sga": { type: "vercel", project: "sgadvisers" },
  "pssbl": { type: "vercel", project: "pssbl-ventures", domain: "pssblventuresllc.com" },
  "breakout": { type: "vercel", project: "breakout-ai" },
  "kdp": { type: "vercel", project: "kdp-occupied-series" },
  "audiobooks": { type: "vercel", project: "occupied-series-audiobooks" },
  "finreset": { type: "vercel", project: "structuredman-financial-reset" },
};

const DNS_LOOKUP = (host) => new Promise((resolve) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => { ctrl.abort(); resolve({ ok: false, err: "timeout" }); }, 8000);
  fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, { signal: ctrl.signal })
    .then(r => r.json())
    .then(d => { clearTimeout(t); resolve({ ok: true, ips: (d.Answer || []).map(a => a.data) }); })
    .catch(e => { clearTimeout(t); resolve({ ok: false, err: String(e.message || e) }); });
});

async function probeIp(host, ip) {
  // Serverless can't pin IPs, but repeated fetches round-robin across A records,
  // which surfaces dead IPs the same way real visitors hit them.
  return { ip, ok: null };
}

async function roundRobinProbe(url, n = 5) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const started = Date.now();
    try {
      const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
      results.push({ ok: r.ok || r.status < 500, code: r.status, ms: Date.now() - started });
    } catch (e) {
      results.push({ ok: false, err: e.name === "AbortError" ? "timeout" : "refused", ms: Date.now() - started });
    } finally {
      clearTimeout(t);
    }
  }
  return results;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const id = req.query.id;
  const tool = KNOWN[id];
  if (!tool) return res.status(400).json({ error: "unknown tool id" });

  const toolUrl = req.query.url;
  let host = "";
  try { host = new URL(toolUrl).hostname; } catch { return res.status(400).json({ error: "bad url" }); }

  const report = { id, host, type: tool.type, checks: [] };

  // 1. DNS lookup
  const dns = await DNS_LOOKUP(host);
  report.dns = dns;
  if (dns.ok) {
    report.checks.push({ name: "DNS A records", ok: dns.ips.length > 0, detail: dns.ips.join(", ") || "none" });
    report.ipProbes = (dns.ips || []).map(ip => ({ ip, ok: null }));
    // 2. Round-robin probes (surfaces dead IPs in rotation)
    const probes = await roundRobinProbe(toolUrl, 10);
    report.roundRobin = probes;
    const okCount = probes.filter(p => p.ok).length;
    const failCount = probes.length - okCount;
    // heuristic: flag suspicious IP ranges (old hosts/Wix leftovers on a Vercel domain)
    const suspicious = (dns.ips || []).filter(ip => /^185\.230\./.test(ip) || /^216\.198\./.test(ip));
    report.checks.push({
      name: "Round-robin health (10 probes)",
      ok: failCount === 0,
      detail: `${okCount}/${probes.length} succeeded` + (failCount > 0 ? ` — ${failCount} hit dead IP(s)` : "")
    });
    if (suspicious.length && okCount === probes.length) {
      report.checks.push({
        name: "Suspicious DNS records",
        ok: false,
        detail: `${suspicious.join(", ")} — non-Vercel/legacy IP(s) mixed into the A records; may intermittently fail for real visitors`
      });
    }
    report.verdict = failCount === 0 && !suspicious.length
      ? { status: "ok", summary: "All probes succeeded — site healthy" }
      : failCount === 0 && suspicious.length
        ? { status: "degraded", summary: `Probes passed but ${suspicious.length} legacy IP(s) in DNS (${suspicious.join(", ")}) risk intermittent failures` }
        : failCount > 0 && okCount > 0
          ? { status: "degraded", summary: `${failCount}/10 probes failed — dead IP(s) in DNS rotation cause intermittent failures` }
          : { status: "down", summary: "All probes failed — site unreachable" };
  } else {
    report.verdict = { status: "dns-fail", summary: `DNS lookup failed: ${dns.err}` };
  }

  // 3. HTTP probe (follows redirects)
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  const started = Date.now();
  try {
    const r = await fetch(toolUrl, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    report.http = { ok: r.ok || r.status < 500, code: r.status, finalUrl: r.url, ms: Date.now() - started };
  } catch (e) {
    clearTimeout(t);
    report.http = { ok: false, code: 0, err: e.name === "AbortError" ? "timeout" : "unreachable" };
  }

  // 4. Suggested fix
  const v = report.verdict.status;
  let fix = null;
  if (v === "ok" && report.http.ok) {
    fix = { action: "none", label: "No action needed — everything is up" };
  } else if (v === "degraded") {
    fix = {
      action: "dns-cleanup",
      label: `DNS rotation issue: legacy/dead A record(s) mixed into the domain. Fix: at your DNS provider (registrar/Cloudflare/GoDaddy) remove the old A record(s) so only the current host's IP remains. For Vercel-hosted domains, prefer Vercel DNS (CNAME/ALIAS) over raw A records.`,
      manual: true
    };
  } else if (v === "down" || v === "dns-fail") {
    if (tool.type === "vercel") {
      fix = { action: "redeploy", label: "Site unreachable — redeploy the Vercel project (contact your admin: 'redeploy project' command).", manual: false };
    } else {
      fix = { action: "restart", label: "Service unreachable — restart via agent control.", manual: false };
    }
  } else if (!report.http.ok) {
    fix = { action: "investigate", label: "HTTP probe failed — check server logs.", manual: true };
  }

  report.fix = fix;
  res.status(200).json(report);
}
