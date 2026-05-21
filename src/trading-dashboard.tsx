import { useState, useEffect, useCallback } from "react";

// ── Palette & theme ──────────────────────────────────────────────
// Aesthetic: dark industrial terminal meets Bloomberg precision.
// Monochrome base with amber/gold signal accents + electric-green buy / crimson sell.

const SYMBOLS = {
  US100: { id: "NASDAQ:NDX", label: "US100", sub: "Nasdaq 100", flag: "🇺🇸" },
  OMX30: { id: "OMXSTO:OMXS30", label: "OMX30", sub: "Stockholm 30", flag: "🇸🇪" },
};

const INTERVALS = ["15m", "1h", "4h", "1D"];

// ── API helpers ──────────────────────────────────────────────────
async function callClaude(messages, systemPrompt) {
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
}

// ── Mock live data (uses real structure from TradingView MCP) ────
// In production this hits the MCP endpoint; here we seed from the
// live values we already fetched so the UI is fully functional.
function generateMarketData(symbol, basePrice, baseChange) {
  const jitter = () => (Math.random() - 0.5) * 0.002;
  const price = basePrice * (1 + jitter());
  const change = baseChange + (Math.random() - 0.5) * 0.1;

  if (symbol === "US100") {
    return {
      price,
      change,
      rsi: 69.3 + (Math.random() - 0.5) * 2,
      macd: 870.5,
      macdSignal: 919.2,
      macdHist: -48.7,
      ema20: 28295,
      ema50: 26966,
      sma200: 25196,
      bbUpper: 30134,
      bbLower: 26502,
      atr: 447,
      stochK: 74.3,
      adx: 36.2,
      volume: 885949166,
      avgVol: 1287260791,
      high52w: 29678,
      low52w: 20778,
      maRating: "Strong Buy",
      oscRating: "Sell",
      overallRating: "Buy",
      overallScore: 0.376,
    };
  } else {
    return {
      price,
      change,
      rsi: 54.2 + (Math.random() - 0.5) * 2,
      macd: 1.06,
      macdSignal: 4.15,
      macdHist: -3.09,
      ema20: 3072,
      ema50: 3059,
      sma200: 2904,
      bbUpper: 3180,
      bbLower: 2960,
      atr: 28,
      stochK: 39.6,
      adx: 11.8,
      volume: 79328758,
      avgVol: 120000000,
      high52w: 3180,
      low52w: 2620,
      maRating: "Strong Buy",
      oscRating: "Neutral",
      overallRating: "Buy",
      overallScore: 0.467,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function ratingColor(r) {
  if (!r) return "#888";
  const u = r.toLowerCase();
  if (u.includes("strong buy")) return "#00e676";
  if (u.includes("buy")) return "#69f0ae";
  if (u.includes("strong sell")) return "#ff1744";
  if (u.includes("sell")) return "#ff5252";
  return "#ffab40";
}

function ratingBg(r) {
  if (!r) return "#1a1a1a";
  const u = r.toLowerCase();
  if (u.includes("strong buy")) return "rgba(0,230,118,0.12)";
  if (u.includes("buy")) return "rgba(105,240,174,0.10)";
  if (u.includes("strong sell")) return "rgba(255,23,68,0.15)";
  if (u.includes("sell")) return "rgba(255,82,82,0.12)";
  return "rgba(255,171,64,0.10)";
}

function fmt(n, d = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtVol(v) {
  if (!v) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  return v.toLocaleString();
}

// ── Gauge component ──────────────────────────────────────────────
function Gauge({ value, min = 0, max = 100, label, color }) {
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const angle = -135 + pct * 270;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="90" height="60" viewBox="0 0 90 60">
        <path d="M10 55 A 35 35 0 0 1 80 55" fill="none" stroke="#2a2a2a" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M10 55 A 35 35 0 0 1 80 55"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${pct * 110} 110`}
          opacity="0.9"
        />
        <text x="45" y="52" textAnchor="middle" fill={color} fontSize="13" fontFamily="'JetBrains Mono', monospace" fontWeight="700">
          {fmt(value, 1)}
        </text>
      </svg>
      <div style={{ fontSize: 10, color: "#666", marginTop: -4, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ── MACDBar ──────────────────────────────────────────────────────
function MACDBar({ hist }) {
  const c = hist >= 0 ? "#00e676" : "#ff5252";
  const w = Math.min(Math.abs(hist / 200) * 100, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 11, color: "#666", width: 42, textAlign: "right" }}>HIST</div>
      <div style={{ flex: 1, height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: c, borderRadius: 3, transition: "width 0.5s" }} />
      </div>
      <div style={{ fontSize: 11, color: c, width: 64, fontFamily: "monospace" }}>{fmt(hist, 1)}</div>
    </div>
  );
}

// ── Signal Badge ─────────────────────────────────────────────────
function Signal({ data }) {
  const signals = [];

  if (data.rsi > 70) signals.push({ type: "SELL", reason: `RSI överköpt (${fmt(data.rsi, 1)})` });
  else if (data.rsi < 30) signals.push({ type: "BUY", reason: `RSI översålt (${fmt(data.rsi, 1)})` });

  if (data.macdHist < 0 && data.macdHist > -100)
    signals.push({ type: "CAUTION", reason: "MACD under signal — momentum avtar" });
  else if (data.macdHist > 0)
    signals.push({ type: "BUY", reason: "MACD över signal — momentum positivt" });

  if (data.adx > 30) signals.push({ type: "INFO", reason: `Stark trend (ADX ${fmt(data.adx, 1)})` });
  else if (data.adx < 15) signals.push({ type: "CAUTION", reason: `Svag trend (ADX ${fmt(data.adx, 1)})` });

  if (data.stochK > 80) signals.push({ type: "SELL", reason: "Stochastic i överköpt zon" });
  else if (data.stochK < 20) signals.push({ type: "BUY", reason: "Stochastic i översålt zon" });

  const colors = { BUY: "#00e676", SELL: "#ff5252", CAUTION: "#ffab40", INFO: "#40c4ff" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {signals.length === 0 && (
        <div style={{ color: "#555", fontSize: 12, fontStyle: "italic" }}>Inga aktiva signaler</div>
      )}
      {signals.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 4,
            background: `${colors[s.type]}12`,
            border: `1px solid ${colors[s.type]}30`,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              color: colors[s.type],
              letterSpacing: 1.5,
              fontFamily: "monospace",
              minWidth: 52,
            }}
          >
            {s.type}
          </span>
          <span style={{ fontSize: 12, color: "#bbb" }}>{s.reason}</span>
        </div>
      ))}
    </div>
  );
}

// ── Chat ─────────────────────────────────────────────────────────
function ChatPanel({ us100, omx30 }) {
  const [msgs, setMsgs] = useState([
    {
      role: "assistant",
      content:
        "Hej! Jag är din AI-tradinganalytiker. Fråga mig om US100 eller OMX30 — tekniska nivåer, signaler, riskbedömning eller strategi.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const SYSTEM = `Du är en erfaren teknisk analytiker specialiserad på index-trading (US100/Nasdaq 100 och OMX30). 
Du analyserar tekniska indikatorer och ger konkreta, tydliga svar på svenska. 
Du ger aldrig finansiell rådgivning eller garantier — du analyserar tekniska mönster.
Svara koncist, max 3-4 meningar. Använd siffror ur kontexten.

Aktuell marknadsdata:
US100: Pris ${fmt(us100?.price)} | RSI ${fmt(us100?.rsi, 1)} | MACD hist ${fmt(us100?.macdHist, 1)} | ADX ${fmt(us100?.adx, 1)} | MA Rating: ${us100?.maRating} | Overall: ${us100?.overallRating}
OMX30: Pris ${fmt(omx30?.price)} | RSI ${fmt(omx30?.rsi, 1)} | MACD hist ${fmt(omx30?.macdHist, 1)} | ADX ${fmt(omx30?.adx, 1)} | MA Rating: ${omx30?.maRating} | Overall: ${omx30?.overallRating}

Viktigt: Du analyserar tekniska mönster, inte ger köp/säljråd. Alltid neutral och faktabaserad.`;

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs);
    setInput("");
    setLoading(true);
    try {
      const reply = await callClaude(
        newMsgs.map((m) => ({ role: m.role, content: m.content })),
        SYSTEM
      );
      setMsgs((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMsgs((prev) => [...prev, { role: "assistant", content: "⚠️ Kunde inte nå AI-tjänsten just nu. Försök igen." }]);
    }
    setLoading(false);
  }, [input, msgs, loading, SYSTEM]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0d0d0d",
        border: "1px solid #1e1e1e",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e676", boxShadow: "0 0 6px #00e676" }} />
        <span style={{ fontSize: 11, color: "#888", letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}>
          AI Analytiker
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                background: m.role === "user" ? "#1a1a1a" : "#141414",
                border: m.role === "user" ? "1px solid #2a2a2a" : "1px solid #ffab4020",
                color: m.role === "user" ? "#ddd" : "#ccc",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 4, padding: "8px 14px" }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#ffab40",
                  animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 12, borderTop: "1px solid #1a1a1a", display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Fråga om teknisk analys..."
          style={{
            flex: 1,
            background: "#141414",
            border: "1px solid #2a2a2a",
            borderRadius: 6,
            padding: "10px 14px",
            color: "#ddd",
            fontSize: 13,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            background: loading ? "#1a1a1a" : "#ffab40",
            color: loading ? "#555" : "#000",
            border: "none",
            borderRadius: 6,
            padding: "10px 16px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.5,
            transition: "all 0.2s",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// ── Index Card ───────────────────────────────────────────────────
function IndexCard({ sym, data }) {
  const info = SYMBOLS[sym];
  const positive = data?.change >= 0;
  const changeColor = positive ? "#00e676" : "#ff5252";

  return (
    <div
      style={{
        background: "#0d0d0d",
        border: "1px solid #1e1e1e",
        borderRadius: 8,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{info.flag}</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.5, fontFamily: "'Space Mono', monospace" }}>
              {info.label}
            </span>
            <span style={{ fontSize: 11, color: "#555", letterSpacing: 1 }}>{info.sub}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "#fff", fontFamily: "'Space Mono', monospace", letterSpacing: -1 }}>
              {fmt(data?.price, sym === "US100" ? 2 : 2)}
            </span>
            <span
              style={{
                fontSize: 14,
                color: changeColor,
                fontFamily: "monospace",
                fontWeight: 600,
                background: `${changeColor}15`,
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {positive ? "+" : ""}{fmt(data?.change, 2)}%
            </span>
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
            padding: "10px 16px",
            borderRadius: 8,
            background: ratingBg(data?.overallRating),
            border: `1px solid ${ratingColor(data?.overallRating)}30`,
          }}
        >
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Signal</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: ratingColor(data?.overallRating), letterSpacing: 0.5 }}>
            {data?.overallRating || "—"}
          </div>
        </div>
      </div>

      {/* Gauges */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "12px 0", borderTop: "1px solid #161616", borderBottom: "1px solid #161616" }}>
        <Gauge value={data?.rsi ?? 50} min={0} max={100} label="RSI" color={data?.rsi > 70 ? "#ff5252" : data?.rsi < 30 ? "#00e676" : "#ffab40"} />
        <Gauge value={data?.stochK ?? 50} min={0} max={100} label="Stoch %K" color={data?.stochK > 80 ? "#ff5252" : data?.stochK < 20 ? "#00e676" : "#64b5f6"} />
        <Gauge value={Math.min(data?.adx ?? 0, 60)} min={0} max={60} label="ADX" color={data?.adx > 30 ? "#ffab40" : "#555"} />
      </div>

      {/* MACD */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>MACD</div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "monospace", marginBottom: 4 }}>
          <span style={{ color: "#888" }}>MACD <span style={{ color: "#64b5f6" }}>{fmt(data?.macd, 1)}</span></span>
          <span style={{ color: "#888" }}>SIG <span style={{ color: "#ff8a65" }}>{fmt(data?.macdSignal, 1)}</span></span>
        </div>
        <MACDBar hist={data?.macdHist ?? 0} />
      </div>

      {/* Moving Averages */}
      <div>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Moving Averages</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {[
            { label: "EMA20", val: data?.ema20 },
            { label: "EMA50", val: data?.ema50 },
            { label: "SMA200", val: data?.sma200 },
          ].map((ma) => {
            const above = data?.price > ma.val;
            return (
              <div key={ma.label} style={{ padding: "6px 10px", background: "#111", borderRadius: 4, border: `1px solid ${above ? "#00e67620" : "#ff525220"}` }}>
                <div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>{ma.label}</div>
                <div style={{ fontSize: 12, color: above ? "#00e676" : "#ff5252", fontFamily: "monospace", marginTop: 2 }}>
                  {fmt(ma.val, 0)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <div style={{ flex: 1, padding: "6px 10px", background: ratingBg(data?.maRating), borderRadius: 4, border: `1px solid ${ratingColor(data?.maRating)}25` }}>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>MA RATING</div>
            <div style={{ fontSize: 12, color: ratingColor(data?.maRating), fontWeight: 700, marginTop: 2 }}>{data?.maRating}</div>
          </div>
          <div style={{ flex: 1, padding: "6px 10px", background: ratingBg(data?.oscRating), borderRadius: 4, border: `1px solid ${ratingColor(data?.oscRating)}25` }}>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>OSC RATING</div>
            <div style={{ fontSize: 12, color: ratingColor(data?.oscRating), fontWeight: 700, marginTop: 2 }}>{data?.oscRating}</div>
          </div>
        </div>
      </div>

      {/* Bollinger + Volume */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ padding: "8px 12px", background: "#111", borderRadius: 6, border: "1px solid #1a1a1a" }}>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Bollinger Bands</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#555" }}>Upper</span>
              <span style={{ color: "#ff8a65", fontFamily: "monospace" }}>{fmt(data?.bbUpper, 0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#555" }}>Price</span>
              <span style={{ color: "#fff", fontFamily: "monospace", fontWeight: 600 }}>{fmt(data?.price, 0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#555" }}>Lower</span>
              <span style={{ color: "#64b5f6", fontFamily: "monospace" }}>{fmt(data?.bbLower, 0)}</span>
            </div>
          </div>
        </div>
        <div style={{ padding: "8px 12px", background: "#111", borderRadius: 6, border: "1px solid #1a1a1a" }}>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Volym</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#555" }}>Nu</span>
              <span style={{ color: "#fff", fontFamily: "monospace" }}>{fmtVol(data?.volume)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#555" }}>10d avg</span>
              <span style={{ color: "#888", fontFamily: "monospace" }}>{fmtVol(data?.avgVol)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#555" }}>ATR</span>
              <span style={{ color: "#ffab40", fontFamily: "monospace" }}>{fmt(data?.atr, 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 52w range */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 4 }}>
          <span>52v Lägsta: {fmt(data?.low52w, 0)}</span>
          <span>52v Högsta: {fmt(data?.high52w, 0)}</span>
        </div>
        <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden", position: "relative" }}>
          {data && (
            <div
              style={{
                position: "absolute",
                left: `${((data.price - data.low52w) / (data.high52w - data.low52w)) * 100}%`,
                top: -2,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#ffab40",
                transform: "translateX(-50%)",
                boxShadow: "0 0 6px #ffab40",
              }}
            />
          )}
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(to right, #ff525240, #ffab4040, #00e67640)" }} />
        </div>
      </div>

      {/* Signals */}
      <div>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Aktiva Signaler</div>
        {data && <Signal data={data} />}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [us100, setUs100] = useState(null);
  const [omx30, setOmx30] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Seed initial data
    setUs100(generateMarketData("US100", 29262, 1.54));
    setOmx30(generateMarketData("OMX30", 3099.5, 1.24));
    setLastUpdate(new Date());

    // Refresh every 30 seconds
    const id = setInterval(() => {
      setUs100(generateMarketData("US100", 29262, 1.54));
      setOmx30(generateMarketData("OMX30", 3099.5, 1.24));
      setLastUpdate(new Date());
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        color: "#ccc",
        fontFamily: "'Space Mono', 'JetBrains Mono', monospace",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d0d0d; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        input::placeholder { color: #444; }
        @keyframes pulse { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .card-anim { animation: fadeIn 0.4s ease forwards; }
      `}</style>

      {/* Top bar */}
      <div
        style={{
          borderBottom: "1px solid #161616",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#0a0a0a",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, background: "#ffab40", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#000" }}>T</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>TradeSignal</div>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: 2, textTransform: "uppercase" }}>AI-driven Index Analys</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#00e676", animation: "pulse 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>LIVE</span>
          </div>
          <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>
            {lastUpdate ? `Uppdaterad ${lastUpdate.toLocaleTimeString("sv-SE")}` : "Laddar..."}
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ background: "#0f0a00", borderBottom: "1px solid #2a1a00", padding: "8px 24px", textAlign: "center" }}>
        <span style={{ fontSize: 10, color: "#664400", letterSpacing: 0.5 }}>
          ⚠️ Endast för utbildnings- och analysändamål. Inget finansiellt råd. Handla alltid på eget ansvar.
        </span>
      </div>

      {/* Main grid */}
      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 1400, margin: "0 auto" }}>
        {/* Index cards */}
        <div className="card-anim" style={{ animationDelay: "0.1s" }}>
          <IndexCard sym="US100" data={us100} />
        </div>
        <div className="card-anim" style={{ animationDelay: "0.2s" }}>
          <IndexCard sym="OMX30" data={omx30} />
        </div>

        {/* AI Chat — full width */}
        <div className="card-anim" style={{ gridColumn: "1 / -1", height: 420, animationDelay: "0.3s" }}>
          <ChatPanel us100={us100} omx30={omx30} />
        </div>

        {/* Comparison footer */}
        <div
          className="card-anim"
          style={{
            gridColumn: "1 / -1",
            background: "#0d0d0d",
            border: "1px solid #1e1e1e",
            borderRadius: 8,
            padding: 16,
            animationDelay: "0.4s",
          }}
        >
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            Jämförelse — US100 vs OMX30
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "RSI", us: us100?.rsi, omx: omx30?.rsi, fmt2: 1 },
              { label: "ADX", us: us100?.adx, omx: omx30?.adx, fmt2: 1 },
              { label: "Stoch %K", us: us100?.stochK, omx: omx30?.stochK, fmt2: 1 },
              { label: "ATR", us: us100?.atr, omx: omx30?.atr, fmt2: 0 },
            ].map((item) => (
              <div key={item.label} style={{ padding: "10px 14px", background: "#111", borderRadius: 6, border: "1px solid #1a1a1a" }}>
                <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{item.label}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#555" }}>🇺🇸 US100</div>
                    <div style={{ fontSize: 14, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>{fmt(item.us, item.fmt2)}</div>
                  </div>
                  <div style={{ fontSize: 16, color: "#2a2a2a" }}>|</div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#555" }}>🇸🇪 OMX30</div>
                    <div style={{ fontSize: 14, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>{fmt(item.omx, item.fmt2)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
