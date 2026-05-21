import { useState, useEffect, useCallback } from "react";

// ── Market Data ──────────────────────────────────────────────────
const BASE_DATA = {
  US100: {
    price: 29243.96, change: 1.57,
    rsi: 69.1, stochK: 74.3, adx: 36.2,
    macd: 870.5, macdSignal: 919.2, macdHist: -48.7,
    ema20: 28295, ema50: 26966, sma200: 25196,
    bbUpper: 30134, bbLower: 26502, atr: 447,
    volume: 885900000, avgVol: 1287000000,
    high52w: 29678, low52w: 20778,
    support: 28100, resistance: 29678,
    flag: "🇺🇸", name: "Nasdaq 100",
  },
  OMX30: {
    price: 3096.78, change: 1.27,
    rsi: 55.2, stochK: 39.6, adx: 11.8,
    macd: 1.1, macdSignal: 4.2, macdHist: -3.1,
    ema20: 3072, ema50: 3059, sma200: 2904,
    bbUpper: 3180, bbLower: 2960, atr: 28,
    volume: 79328758, avgVol: 120000000,
    high52w: 3180, low52w: 2620,
    support: 3050, resistance: 3180,
    flag: "🇸🇪", name: "Stockholm 30",
  },
};

// ── Swing Analysis Engine ────────────────────────────────────────
function analyzeSwing(d, horizon) {
  const scores = { buy: 0, sell: 0, total: 0 };

  // RSI
  if (d.rsi < 40) { scores.buy += 2; scores.total += 2; }
  else if (d.rsi > 65 && d.rsi < 75) { scores.buy += 1; scores.total += 2; }
  else if (d.rsi > 75) { scores.sell += 2; scores.total += 2; }
  else scores.total += 2;

  // MACD
  if (d.macdHist > 0) { scores.buy += 2; scores.total += 2; }
  else { scores.sell += 1; scores.total += 2; }

  // Trend (EMA)
  if (d.price > d.ema20 && d.ema20 > d.ema50) { scores.buy += 2; scores.total += 2; }
  else if (d.price < d.ema20 && d.ema20 < d.ema50) { scores.sell += 2; scores.total += 2; }
  else scores.total += 2;

  // ADX (trend strength)
  const trendStrong = d.adx > 25;

  // Stochastic
  if (d.stochK < 25) { scores.buy += 1; scores.total += 1; }
  else if (d.stochK > 75) { scores.sell += 1; scores.total += 1; }
  else scores.total += 1;

  // BB position
  const bbRange = d.bbUpper - d.bbLower;
  const bbPos = (d.price - d.bbLower) / bbRange;
  if (bbPos < 0.25) { scores.buy += 1; scores.total += 1; }
  else if (bbPos > 0.75) { scores.sell += 1; scores.total += 1; }
  else scores.total += 1;

  const bullScore = scores.buy / scores.total;
  const bearScore = scores.sell / scores.total;

  let action, confidence, reason, color;

  if (bullScore > 0.55) {
    action = "KÖP";
    confidence = Math.round(bullScore * 100);
    color = "#00e676";
    reason = buildReason(d, "bull", trendStrong);
  } else if (bearScore > 0.45) {
    action = "SÄLJ / STÄNG";
    confidence = Math.round(bearScore * 100);
    color = "#ff5252";
    reason = buildReason(d, "bear", trendStrong);
  } else {
    action = "VÄNTA";
    confidence = Math.round((1 - Math.abs(bullScore - bearScore)) * 70 + 30);
    color = "#ffab40";
    reason = buildReason(d, "neutral", trendStrong);
  }

  // Entry / Stop / Target based on ATR and horizon
  const atrMult = horizon === "kort" ? 1.5 : horizon === "medel" ? 2.5 : 4;
  const riskMult = horizon === "kort" ? 1.0 : horizon === "medel" ? 1.5 : 2.5;

  let entry, stop, target1, target2, rr;
  if (action === "KÖP") {
    entry = d.price;
    stop = Math.round((d.price - d.atr * riskMult) * 100) / 100;
    target1 = Math.round((d.price + d.atr * atrMult) * 100) / 100;
    target2 = Math.round((d.price + d.atr * atrMult * 1.8) * 100) / 100;
    rr = Math.round((target1 - entry) / (entry - stop) * 10) / 10;
  } else if (action === "SÄLJ / STÄNG") {
    entry = d.price;
    stop = Math.round((d.price + d.atr * riskMult) * 100) / 100;
    target1 = Math.round((d.price - d.atr * atrMult) * 100) / 100;
    target2 = Math.round((d.price - d.atr * atrMult * 1.8) * 100) / 100;
    rr = Math.round((entry - target1) / (stop - entry) * 10) / 10;
  } else {
    entry = null; stop = null; target1 = null; target2 = null; rr = null;
  }

  return { action, confidence, color, reason, entry, stop, target1, target2, rr, trendStrong, bullScore, bearScore };
}

function buildReason(d, dir, trendStrong) {
  if (dir === "bull") {
    const parts = [];
    if (d.rsi < 50) parts.push("RSI i köpzon");
    if (d.macdHist > 0) parts.push("MACD positivt");
    if (d.price > d.ema20) parts.push("pris över EMA20");
    if (trendStrong) parts.push("stark trend (ADX " + Math.round(d.adx) + ")");
    if (d.stochK < 40) parts.push("Stochastic bottnar");
    return parts.length > 0 ? parts.join(" · ") : "Flertalet indikatorer pekar uppåt";
  } else if (dir === "bear") {
    const parts = [];
    if (d.rsi > 65) parts.push("RSI överköpt (" + Math.round(d.rsi) + ")");
    if (d.macdHist < 0) parts.push("MACD negativt");
    if (d.price < d.ema20) parts.push("pris under EMA20");
    if (d.stochK > 70) parts.push("Stochastic toppar ur");
    return parts.length > 0 ? parts.join(" · ") : "Flertalet indikatorer pekar nedåt";
  } else {
    return "Motstridiga signaler — invänta bekräftelse innan entry";
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function fmt(n, d = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtVol(v) {
  if (!v) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + "M";
  return v.toLocaleString();
}

async function callClaude(messages, systemPrompt) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });
    const data = await res.json();
    return data.content?.find((b) => b.type === "text")?.text || "";
  } catch {
    return "Kunde inte nå AI-tjänsten. Kontrollera att API-nyckeln är konfigurerad i Vercel.";
  }
}

// ── Confidence Arc ───────────────────────────────────────────────
function ConfidenceArc({ value, color, label }) {
  const pct = Math.min(Math.max(value / 100, 0), 1);
  const r = 52, cx = 64, cy = 64;
  const startAngle = -200, sweep = 220;
  const toRad = (a) => (a * Math.PI) / 180;
  const arcPath = (pct) => {
    const end = startAngle + sweep * pct;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(end));
    const y2 = cy + r * Math.sin(toRad(end));
    const large = sweep * pct > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="128" height="90" viewBox="0 0 128 90">
        <path d={arcPath(1)} fill="none" stroke="#1a1a1a" strokeWidth="10" strokeLinecap="round" />
        <path d={arcPath(pct)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
          fontSize="22" fontFamily="'Space Mono', monospace" fontWeight="700">{value}%</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#555"
          fontSize="9" fontFamily="monospace" letterSpacing="2">{label}</text>
      </svg>
    </div>
  );
}

// ── Horizon Tab ──────────────────────────────────────────────────
function HorizonTab({ active, label, sub, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "10px 6px", border: "none", cursor: "pointer",
      background: active ? "#1a1a1a" : "transparent",
      borderBottom: active ? "2px solid #ffab40" : "2px solid transparent",
      color: active ? "#ffab40" : "#555", fontSize: 11,
      fontFamily: "'Space Mono', monospace", fontWeight: active ? 700 : 400,
      letterSpacing: 1, textTransform: "uppercase", transition: "all 0.2s",
    }}>
      <div>{label}</div>
      <div style={{ fontSize: 9, color: active ? "#888" : "#444", marginTop: 2 }}>{sub}</div>
    </button>
  );
}

// ── Signal Card (main decision panel) ───────────────────────────
function SignalCard({ sym, data, horizon }) {
  const analysis = analyzeSwing(data, horizon);
  const isBuy = analysis.action === "KÖP";
  const isSell = analysis.action === "SÄLJ / STÄNG";
  const isWait = analysis.action === "VÄNTA";

  return (
    <div style={{
      background: "#0d0d0d", border: `1px solid ${analysis.color}25`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 30px ${analysis.color}10`,
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px 12px",
        borderBottom: "1px solid #161616",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{data.flag}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "'Space Mono', monospace" }}>
              {sym}
            </span>
            <span style={{ fontSize: 10, color: "#444", letterSpacing: 1 }}>{data.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: "#fff", fontFamily: "'Space Mono', monospace", letterSpacing: -1 }}>
              {fmt(data.price)}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 600, fontFamily: "monospace",
              color: data.change >= 0 ? "#00e676" : "#ff5252",
              background: data.change >= 0 ? "#00e67615" : "#ff525215",
              padding: "2px 8px", borderRadius: 4,
            }}>
              {data.change >= 0 ? "+" : ""}{fmt(data.change)}%
            </span>
          </div>
        </div>

        {/* Big action badge */}
        <div style={{
          padding: "12px 20px", borderRadius: 10,
          background: `${analysis.color}18`,
          border: `2px solid ${analysis.color}40`,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
            Åtgärd
          </div>
          <div style={{
            fontSize: 16, fontWeight: 900, color: analysis.color,
            fontFamily: "'Space Mono', monospace", letterSpacing: 1,
            textShadow: `0 0 12px ${analysis.color}60`,
          }}>
            {analysis.action}
          </div>
        </div>
      </div>

      {/* Confidence + Reason */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #141414" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ConfidenceArc value={analysis.confidence} color={analysis.color} label="STYRKA" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
              Varför
            </div>
            <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6 }}>
              {analysis.reason}
            </div>
            {analysis.trendStrong && (
              <div style={{
                marginTop: 8, display: "inline-block",
                fontSize: 9, color: "#ffab40", letterSpacing: 1.5,
                background: "#ffab4015", padding: "3px 8px", borderRadius: 4,
                border: "1px solid #ffab4030",
              }}>
                ⚡ STARK TREND AKTIV
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Entry / Stop / Target */}
      {!isWait && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #141414" }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            Nivåer
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "ENTRY", val: analysis.entry, color: "#fff" },
              { label: "STOP LOSS", val: analysis.stop, color: "#ff5252" },
              { label: "MÅL 1", val: analysis.target1, color: "#00e676" },
              { label: "MÅL 2", val: analysis.target2, color: "#69f0ae" },
            ].map((item) => (
              <div key={item.label} style={{
                padding: "8px 10px", background: "#111",
                borderRadius: 6, border: `1px solid ${item.color}20`,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 8, color: "#555", letterSpacing: 1, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: item.color, fontFamily: "monospace", fontWeight: 700 }}>
                  {fmt(item.val, 0)}
                </div>
              </div>
            ))}
          </div>

          {/* Risk/Reward */}
          <div style={{
            marginTop: 10, padding: "8px 12px",
            background: analysis.rr >= 2 ? "#00e67610" : "#ffab4010",
            border: `1px solid ${analysis.rr >= 2 ? "#00e67630" : "#ffab4030"}`,
            borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 11, color: "#888" }}>Risk/Reward</span>
            <span style={{
              fontSize: 14, fontWeight: 800, fontFamily: "monospace",
              color: analysis.rr >= 2 ? "#00e676" : "#ffab40",
            }}>
              1 : {analysis.rr}
            </span>
            <span style={{ fontSize: 10, color: "#555" }}>
              {analysis.rr >= 2 ? "✓ Bra setup" : "Marginellt"}
            </span>
          </div>
        </div>
      )}

      {isWait && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #141414" }}>
          <div style={{
            padding: "14px 16px", background: "#ffab4010",
            border: "1px solid #ffab4025", borderRadius: 8,
          }}>
            <div style={{ fontSize: 12, color: "#ffab40", fontWeight: 700, marginBottom: 6 }}>
              ⏳ Invänta bekräftelse
            </div>
            <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6 }}>
              Signalerna är motstridiga. En erfaren swingtrader sitter på händerna tills marknaden ger ett tydligare läge.
              Håll koll på nästa stängningskurs.
            </div>
          </div>
        </div>
      )}

      {/* Indicators strip */}
      <div style={{ padding: "12px 20px" }}>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
          Indikatorer
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {[
            {
              label: "RSI", val: fmt(data.rsi, 1),
              status: data.rsi > 70 ? "Överköpt" : data.rsi < 30 ? "Översålt" : "Neutral",
              color: data.rsi > 70 ? "#ff5252" : data.rsi < 30 ? "#00e676" : "#888",
            },
            {
              label: "Stoch", val: fmt(data.stochK, 1),
              status: data.stochK > 80 ? "Topp" : data.stochK < 20 ? "Botten" : "Neutral",
              color: data.stochK > 80 ? "#ff5252" : data.stochK < 20 ? "#00e676" : "#888",
            },
            {
              label: "ADX", val: fmt(data.adx, 1),
              status: data.adx > 30 ? "Stark trend" : data.adx > 20 ? "Trend" : "Sidledes",
              color: data.adx > 30 ? "#ffab40" : data.adx > 20 ? "#888" : "#555",
            },
            {
              label: "MACD", val: fmt(data.macdHist, 1),
              status: data.macdHist > 0 ? "Positivt" : "Negativt",
              color: data.macdHist > 0 ? "#00e676" : "#ff5252",
            },
            {
              label: "EMA20", val: fmt(data.ema20, 0),
              status: data.price > data.ema20 ? "Ovanför" : "Nedanför",
              color: data.price > data.ema20 ? "#00e676" : "#ff5252",
            },
            {
              label: "Volym", val: fmtVol(data.volume),
              status: data.volume > data.avgVol ? "Hög" : "Låg",
              color: data.volume > data.avgVol ? "#ffab40" : "#555",
            },
          ].map((ind) => (
            <div key={ind.label} style={{
              padding: "6px 8px", background: "#111",
              borderRadius: 5, border: `1px solid ${ind.color}20`,
            }}>
              <div style={{ fontSize: 8, color: "#555", letterSpacing: 1 }}>{ind.label}</div>
              <div style={{ fontSize: 12, color: ind.color, fontFamily: "monospace", fontWeight: 700 }}>{ind.val}</div>
              <div style={{ fontSize: 9, color: "#555" }}>{ind.status}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Chat Panel ───────────────────────────────────────────────────
function ChatPanel({ us100, omx30 }) {
  const [msgs, setMsgs] = useState([{
    role: "assistant",
    content: "Hej! Jag är din swingtrading-coach. Fråga mig om US100 eller OMX30 — entry, stop loss, riskhantering, eller vad en signal betyder.",
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const SYSTEM = `Du är en erfaren swingtrader och coach som undervisar nybörjare.
Du förklarar alltid PÅ SVENSKA i enkelt språk — inga onödiga facktermer utan förklaring.
Du ger alltid konkreta, handlingsbara råd: vad ska man göra, när, och varför.
Du refererar alltid till aktuell marknadsdata nedan.
Svara kortfattat, max 4 meningar. Var direkt och tydlig.
Du ger ALDRIG garantier. Du ger teknisk analys och pedagogiska förklaringar.

Aktuell data:
US100: Pris ${fmt(us100?.price)} | RSI ${fmt(us100?.rsi,1)} | MACD hist ${fmt(us100?.macdHist,1)} | ADX ${fmt(us100?.adx,1)} | Stoch ${fmt(us100?.stochK,1)} | EMA20 ${fmt(us100?.ema20,0)} | ATR ${fmt(us100?.atr,0)}
OMX30: Pris ${fmt(omx30?.price)} | RSI ${fmt(omx30?.rsi,1)} | MACD hist ${fmt(omx30?.macdHist,1)} | ADX ${fmt(omx30?.adx,1)} | Stoch ${fmt(omx30?.stochK,1)} | EMA20 ${fmt(omx30?.ema20,0)} | ATR ${fmt(omx30?.atr,0)}`;

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs);
    setInput("");
    setLoading(true);
    const reply = await callClaude(newMsgs.map(m => ({ role: m.role, content: m.content })), SYSTEM);
    setMsgs(prev => [...prev, { role: "assistant", content: reply }]);
    setLoading(false);
  }, [input, msgs, loading, SYSTEM]);

  const suggestions = [
    "Ska jag köpa US100 nu?",
    "Vad är stop loss?",
    "Hur stor position ska jag ta?",
    "Är det rätt läge för OMX30?",
  ];

  return (
    <div style={{
      background: "#0d0d0d", border: "1px solid #1e1e1e",
      borderRadius: 12, overflow: "hidden", display: "flex",
      flexDirection: "column", height: 480,
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid #161616",
        display: "flex", alignItems: "center", gap: 8,
        background: "#0a0a0a",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e676", boxShadow: "0 0 6px #00e676" }} />
        <span style={{ fontSize: 11, color: "#888", letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}>
          Swingtrading Coach — AI
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "88%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              background: m.role === "user" ? "#1a1a1a" : "#111",
              border: m.role === "user" ? "1px solid #2a2a2a" : "1px solid #ffab4020",
              color: "#ccc", fontSize: 13, lineHeight: 1.6,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 4, padding: "8px 14px" }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%", background: "#ffab40",
                animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      {msgs.length < 3 && (
        <div style={{ padding: "0 14px 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggestions.map((s) => (
            <button key={s} onClick={() => setInput(s)} style={{
              fontSize: 11, color: "#888", background: "#111",
              border: "1px solid #2a2a2a", borderRadius: 20,
              padding: "5px 12px", cursor: "pointer", fontFamily: "inherit",
            }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: 12, borderTop: "1px solid #161616", display: "flex", gap: 8 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Fråga din swingtrading-coach..."
          style={{
            flex: 1, background: "#141414", border: "1px solid #2a2a2a",
            borderRadius: 8, padding: "10px 14px", color: "#ddd",
            fontSize: 13, outline: "none", fontFamily: "inherit",
          }}
        />
        <button onClick={send} disabled={loading} style={{
          background: loading ? "#1a1a1a" : "#ffab40",
          color: loading ? "#555" : "#000",
          border: "none", borderRadius: 8, padding: "10px 18px",
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: 16, fontWeight: 700, transition: "all 0.2s",
        }}>↑</button>
      </div>
    </div>
  );
}

// ── Learn Panel ──────────────────────────────────────────────────
function LearnPanel() {
  const tips = [
    { icon: "📍", title: "Entry — Gå in rätt", text: "Köp när priset studsar från stöd + RSI under 50 + MACD vänder upp. Vänta på bekräftelse — skynda aldrig." },
    { icon: "🛡️", title: "Stop Loss — Skydda kapitalet", text: "Sätt alltid stop loss INNAN du går in. En bra regel: max 1-2% av ditt kapital per trade." },
    { icon: "🎯", title: "Take Profit — Ta hem vinsten", text: "Sätt mål 1 vid nästa motståndsnivå. Ta hem 50% där, låt resten löpa mot mål 2." },
    { icon: "⚖️", title: "Risk/Reward — Matematiken", text: "Trade aldrig med R/R under 1:2. Det betyder: riskera 100kr, sikta på 200kr. Då kan du ha rätt 40% av gångerna och ändå tjäna." },
    { icon: "⏰", title: "Timing — Tålamod lönar sig", text: "Swingtraders väntar på rätt läge. Det är bättre att missa en trade än att gå in för tidigt." },
    { icon: "📊", title: "Trend — Handla med marknaden", text: "Pris över EMA20 = trend upp = leta KÖP. Pris under EMA20 = trend ned = leta SÄLJ eller vänta." },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
        Swingtrading — Grunderna
      </div>
      {tips.map((t) => (
        <div key={t.title} style={{
          padding: "12px 14px", background: "#0d0d0d",
          border: "1px solid #1a1a1a", borderRadius: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{t.title}</span>
          </div>
          <p style={{ fontSize: 12, color: "#888", lineHeight: 1.6, margin: 0 }}>{t.text}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [horizon, setHorizon] = useState("medel");
  const [tab, setTab] = useState("signal");
  const [data, setData] = useState({ US100: BASE_DATA.US100, OMX30: BASE_DATA.OMX30 });
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setData({
        US100: { ...BASE_DATA.US100, price: BASE_DATA.US100.price * (1 + (Math.random() - 0.5) * 0.001) },
        OMX30: { ...BASE_DATA.OMX30, price: BASE_DATA.OMX30.price * (1 + (Math.random() - 0.5) * 0.001) },
      });
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const horizons = [
    { key: "kort", label: "Kort", sub: "1–3 dagar" },
    { key: "medel", label: "Medel", sub: "3–7 dagar" },
    { key: "lang", label: "Lång", sub: "1–4 veckor" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#ccc", fontFamily: "'Space Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        input::placeholder { color: #444; }
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .fade { animation: fadeUp 0.4s ease forwards; }
      `}</style>

      {/* Top bar */}
      <div style={{
        borderBottom: "1px solid #161616", padding: "12px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#0a0a0a", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: "#ffab40", borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#000" }}>S</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>SwingSignal</div>
            <div style={{ fontSize: 8, color: "#555", letterSpacing: 2, textTransform: "uppercase" }}>
              AI Swingtrading Coach
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e676", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 9, color: "#444", fontFamily: "monospace" }}>
            {lastUpdate.toLocaleTimeString("sv-SE")}
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ background: "#0f0a00", borderBottom: "1px solid #2a1a00", padding: "6px 16px", textAlign: "center" }}>
        <span style={{ fontSize: 9, color: "#664400", letterSpacing: 0.5 }}>
          ⚠️ Utbildningssyfte endast. Inget finansiellt råd. Handla på eget ansvar.
        </span>
      </div>

      {/* Horizon selector */}
      <div style={{ display: "flex", borderBottom: "1px solid #161616", background: "#0a0a0a" }}>
        {horizons.map(h => (
          <HorizonTab key={h.key} active={horizon === h.key} label={h.label} sub={h.sub} onClick={() => setHorizon(h.key)} />
        ))}
      </div>

      {/* Nav tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #161616", background: "#0a0a0a" }}>
        {[
          { key: "signal", label: "📊 Signaler" },
          { key: "chat", label: "💬 Coach" },
          { key: "learn", label: "📚 Lär dig" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "12px 8px", border: "none", cursor: "pointer",
            background: tab === t.key ? "#111" : "transparent",
            borderBottom: tab === t.key ? "2px solid #ffab40" : "2px solid transparent",
            color: tab === t.key ? "#fff" : "#555",
            fontSize: 11, fontFamily: "'Space Mono', monospace",
            letterSpacing: 0.5, transition: "all 0.2s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 14, maxWidth: 900, margin: "0 auto" }}>
        {tab === "signal" && (
          <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <SignalCard sym="US100" data={data.US100} horizon={horizon} />
            <SignalCard sym="OMX30" data={data.OMX30} horizon={horizon} />
          </div>
        )}
        {tab === "chat" && (
          <div className="fade">
            <ChatPanel us100={data.US100} omx30={data.OMX30} />
          </div>
        )}
        {tab === "learn" && (
          <div className="fade">
            <LearnPanel />
          </div>
        )}
      </div>
    </div>
  );
}
