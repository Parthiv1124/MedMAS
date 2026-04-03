import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChatInput } from "@/components/ui/ai-input-001";
import { Sparkles, Cpu, Zap } from "lucide-react";
import { LuBrain } from "react-icons/lu";
import { PiLightbulbFilament } from "react-icons/pi";
import logo from "../assets/logo.png";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const AGENT_INFO = {
  symptom:   { label: "Symptom Checker",  icon: "S1", color: "from-blue-500 to-cyan-400" },
  lab:       { label: "Disease Predictor", icon: "D2", color: "from-purple-500 to-pink-400" },
  mental:    { label: "Empathy Chatbot",   icon: "E3", color: "from-rose-500 to-orange-400" },
  lifestyle: { label: "Health Scorer",     icon: "H4", color: "from-emerald-500 to-teal-400" },
  asha:      { label: "ASHA Copilot",      icon: "A6", color: "from-amber-500 to-yellow-400" },
  doctor:    { label: "Doctor Finder",     icon: "F1", color: "from-indigo-500 to-blue-400" },
  offtopic:  { label: "MedMAS Assistant",  icon: "M+", color: "from-slate-500 to-gray-400" },
};

const TRIAGE = {
  urgent:   { bg: "bg-red-500/10",    text: "text-red-400",     border: "border-red-500/20",    dot: "bg-red-500" },
  moderate: { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/20",  dot: "bg-amber-500" },
  routine:  { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-500" },
};

const MODELS = [
  { id: "gpt-4o",     name: "GPT-4o",           icon: <PiLightbulbFilament className="h-4 w-4" /> },
  { id: "claude-3-5", name: "Claude 3.5 Sonnet", icon: <Sparkles className="h-4 w-4" /> },
  { id: "gemini-pro", name: "Gemini Pro",        icon: <Cpu className="h-4 w-4" /> },
  { id: "llama-3-1",  name: "Llama 3.1",         icon: <Zap className="h-4 w-4" /> },
];

const QUICK_PROMPTS = {
  chat: [
    "I have a headache and fever since 2 days",
    "मुझे सीने में दर्द हो रहा है",
    "I feel very stressed and can't sleep",
    "My blood sugar report shows HbA1c 7.2",
  ],
  asha: [
    "Pregnant woman, 8 months, high BP, swelling in feet",
    "Child 2 years, diarrhea 3 days, not eating",
    "Old man, cough for 2 weeks, blood in sputum",
  ],
};

/* ── Inline Icons ──────────────────────────────────────────── */
const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
);
const LocationIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>
);
const PhoneIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
);
const ArrowUpRightIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M10 7h7v7" />
  </svg>
);

const GENERIC_FACILITY_NAMES = new Set([
  "primary health centre",
  "primary health center",
  "community health centre",
  "community health center",
  "health centre",
  "health center",
  "subcentre",
  "sub center",
  "sub centre",
  "subcenter",
  "hospital",
  "clinic",
]);

function getVisibleMessageText(text, doctors) {
  if (!text) return "";
  if (!doctors?.length) return text;

  return text
    .replace(/\n?NEARBY DOCTORS[\s\S]*?(?=\n---\n|$)/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isGenericFacilityName(name) {
  return GENERIC_FACILITY_NAMES.has(
    (name || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function getDoctorMapsUrl(doctor, district) {
  const name = doctor?.name?.trim();
  const address = doctor?.address?.trim();
  const lat = Number(doctor?.lat);
  const lng = Number(doctor?.lng ?? doctor?.lon);

  if (!name) return null;

  if (isGenericFacilityName(name)) {
    const contextualQuery = [name, address, district].filter(Boolean).join(", ");

    if (contextualQuery && contextualQuery !== name) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contextualQuery)}`;
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
    }
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [activeAgent, setActiveAgent] = useState(null);
  const [district, setDistrict]           = useState("");
  const [districts, setDistricts]         = useState(["Vadodara","Surat","Rajkot","Bharuch","Ahmedabad","Mumbai","Delhi"]);
  const [locationStatus, setLocationStatus] = useState("detecting");
  const [userCoords, setUserCoords]       = useState(null); // {lat, lng}
  const [tab, setTab]                     = useState("chat");
  const bottomRef                         = useRef(null);

  const storedUser = localStorage.getItem("medmas_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  function handleLogout() {
    localStorage.removeItem("medmas_token");
    localStorage.removeItem("medmas_user");
    navigate("/login");
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch available districts from backend
  useEffect(() => {
    fetch(`${API_BASE}/api/districts`)
      .then(r => r.json())
      .then(data => { if (data.districts?.length) setDistricts(data.districts); })
      .catch(() => {});
  }, []);

  // Auto-detect location on mount
  useEffect(() => {
    const fallback = user?.district || "Vadodara";
    if (!navigator.geolocation) {
      setDistrict(fallback);
      setLocationStatus("done");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        try {
          const res = await fetch(`${API_BASE}/api/geocode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(coords),
          });
          const data = await res.json();
          setDistrict(res.ok && data.district ? data.district : fallback);
        } catch {
          setDistrict(fallback);
        }
        setLocationStatus("done");
      },
      () => { setDistrict(fallback); setLocationStatus("denied"); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMessage(text) {
    setMessages(prev => [...prev, { id: Date.now(), role: "user", text }]);
    setLoading(true);
    setActiveAgent("Crisis Guard scanning...");

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, user_district: district, user_lat: userCoords?.lat, user_lng: userCoords?.lng }),
      });
      const data = await res.json();
      if (data.detail) throw new Error(data.detail);

      setActiveAgent(AGENT_INFO[data.intent]?.label || "Processing...");
      setTimeout(() => setActiveAgent(null), 3000);

      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: "assistant", text: data.response,
        triage: data.triage_level, intent: data.intent,
        crisis: data.crisis_detected, doctors: data.doctor_list,
        lang: data.original_language,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", text: "Error: " + err.message }]);
      setActiveAgent(null);
    } finally { setLoading(false); }
  }

  async function sendASHA(text) {
    setMessages(prev => [...prev, { id: Date.now(), role: "user", text: `[ASHA] ${text}` }]);
    setLoading(true);
    setActiveAgent("ASHA Copilot");

    try {
      const res = await fetch(`${API_BASE}/api/asha/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asha_worker_id: "demo-worker", patient_id: "demo-patient",
          observations: text, user_district: district, user_lat: userCoords?.lat, user_lng: userCoords?.lng,
        }),
      });
      const data = await res.json();
      if (data.detail) throw new Error(data.detail);

      setTimeout(() => setActiveAgent(null), 3000);
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: "assistant", text: data.final_response,
        triage: data.triage_level, intent: "asha",
        crisis: data.crisis_detected, doctors: data.doctor_list,
        asha: data.asha_result,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", text: "Error: " + err.message }]);
      setActiveAgent(null);
    } finally { setLoading(false); }
  }

  function handleSend(text) {
    if (!text.trim()) return;
    tab === "asha" ? sendASHA(text) : sendMessage(text);
  }

  const agentInfo = activeAgent && Object.values(AGENT_INFO).find(a => activeAgent.includes(a.label));
  const hasMessages = messages.length > 0;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-chat-grid">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="glass-liquid sticky top-0 z-30 border-b border-white/35">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src={logo} alt="MedMAS" className="h-9 w-9 rounded-xl shadow-md" />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold leading-tight text-neutral-900">MedMAS</h1>
              <p className="text-[10px] leading-tight text-neutral-500">Multi-Agent AI Health System</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="glass-liquid ml-2 flex rounded-xl p-0.5">
            {[
              { id: "chat", label: "Patient", emoji: "\uD83E\uDE7A" },
              { id: "asha", label: "ASHA",    emoji: "\uD83D\uDC69\u200D\u2695\uFE0F" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                  tab === t.id
                    ? "glass-liquid-strong text-neutral-900 shadow-sm"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}>
                <span className="mr-1">{t.emoji}</span>{t.label}
              </button>
            ))}
          </div>

          {/* District + User */}
          <div className="ml-auto flex items-center gap-2">
            <div className="glass-liquid hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-500 sm:flex">
              <LocationIcon />
              {locationStatus === "detecting" ? (
                <span className="animate-pulse text-xs font-medium text-neutral-400">Detecting...</span>
              ) : (
                <select
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  className="cursor-pointer bg-transparent text-xs font-medium text-neutral-900 focus:outline-none">
                  {districts.map(d => <option key={d}>{d}</option>)}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              {user && (
                <div className="glass-liquid hidden items-center gap-2 rounded-lg px-2.5 py-1.5 md:flex">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-teal-500 text-[9px] font-bold text-white">
                    {(user.name || user.email || "U")[0].toUpperCase()}
                  </div>
                  <span className="max-w-[100px] truncate text-xs font-medium text-neutral-900">{user.name || user.email}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                title="Logout">
                <LogoutIcon />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Agent Status Bar ────────────────────────────────── */}
      <AnimatePresence>
        {(loading || activeAgent) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-auto w-full max-w-4xl px-4 pt-3">
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
              agentInfo
                ? "glass-liquid-accent border-sky-100/60"
                : "glass-liquid border-white/40"
            }`}>
              {agentInfo ? (
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${agentInfo.color} text-[9px] font-bold text-white shadow-sm`}>
                  {agentInfo.icon}
                </div>
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-brand-500" />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-neutral-900">{activeAgent || "Processing..."}</p>
                <p className="text-[10px] text-neutral-500">Agent pipeline active</p>
              </div>
              <div className="ml-auto flex gap-1">
                {[0, 200, 400].map(d => (
                  <div key={d} className="h-2 w-2 rounded-full bg-brand-400" style={{ animation: "typing 1.4s infinite", animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages ────────────────────────────────────────── */}
      <div className="z-10 flex w-full flex-1 flex-col items-center overflow-y-auto pt-4">
        <div className="flex w-full max-w-4xl flex-col gap-4 px-4 pb-4">

          {/* Empty state */}
          <AnimatePresence>
            {!hasMessages && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="flex flex-col items-center justify-center py-16">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500/10 to-teal-500/10">
                  <span className="text-3xl">{tab === "asha" ? "\uD83D\uDC69\u200D\u2695\uFE0F" : "\uD83E\uDE7A"}</span>
                </div>
                <h2 className="mb-2 text-lg font-semibold text-neutral-900">
                  {tab === "asha" ? "ASHA Worker Console" : "How can I help you today?"}
                </h2>
                <p className="mb-8 max-w-sm text-center text-sm text-neutral-500">
                  {tab === "asha"
                    ? "Enter patient field observations in any Indian language for AI-assisted triage"
                    : "Describe your symptoms in any language — Hindi, Tamil, Gujarati, English, and 18+ more"}
                </p>
                <div className="flex max-w-lg flex-wrap justify-center gap-2">
                  {QUICK_PROMPTS[tab].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(prompt)}
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-brand-600 dark:hover:text-brand-400">
                      {prompt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Message bubbles */}
          <AnimatePresence initial={false}>
            {messages.map(msg => {
              const isUser = msg.role === "user";
              const agent = msg.intent && AGENT_INFO[msg.intent];
              const triage = msg.triage && TRIAGE[msg.triage];
              const visibleText = getVisibleMessageText(msg.text, msg.doctors);

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>

                  {/* Bot avatar */}
                  {!isUser && (
                    <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${
                      agent?.color || "from-brand-500 to-teal-500"
                    } text-[9px] font-bold text-white shadow-sm`}>
                      {agent?.icon || "M+"}
                    </div>
                  )}

                  <div className="max-w-[80%]">
                    {/* Crisis banner */}
                    {msg.crisis && (
                      <div className="mb-2 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 pulse-danger">
                        <span className="text-sm text-red-500">🚨</span>
                        <span className="text-xs font-semibold text-red-400">CRISIS DETECTED — emergency resources included below</span>
                      </div>
                    )}

                    {/* Triage + Agent badge */}
                    {triage && !isUser && (
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold ${triage.bg} ${triage.text} ${triage.border}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${triage.dot}`} />
                          {msg.triage?.toUpperCase()}
                        </span>
                        {agent && (
                          <span className="text-[10px] font-medium text-neutral-400">via {agent.label}</span>
                        )}
                        {msg.lang && msg.lang !== "en" && (
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] text-brand-500 dark:bg-brand-950 dark:text-brand-400">
                            {msg.lang.toUpperCase()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bubble */}
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? "glass-liquid-accent rounded-tr-none border border-white/60 text-neutral-950"
                        : "glass-liquid rounded-tl-none border border-white/50 text-neutral-950"
                    }`}>
                      {visibleText && (
                        <p className="whitespace-pre-wrap">{visibleText}</p>
                      )}

                      {/* Doctor cards */}
                      {msg.doctors?.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-neutral-200/40 pt-3 dark:border-neutral-700/40">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Nearby Doctors</p>
                          {msg.doctors.slice(0, 3).map((d, j) => {
                            const mapsUrl = getDoctorMapsUrl(d, district);

                            return (
                            <a
                              key={j}
                              href={mapsUrl || "#"}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${d.name || "doctor location"} in Google Maps`}
                              onClick={event => {
                                if (!mapsUrl) event.preventDefault();
                              }}
                              className="glass-liquid flex items-center gap-2.5 rounded-lg border border-white/45 px-3 py-2 transition hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                            >
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 text-[9px] font-bold text-white">
                                {(d.name || "D")[0]}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-neutral-900">{d.name}</p>
                                <p className="text-[10px] text-neutral-500">
                                  {d.specialty}{d.distance_km != null ? ` · ${d.distance_km} km away` : ""}
                                </p>
                                {d.address && <p className="truncate text-[10px] text-neutral-400">{d.address}</p>}
                              </div>
                              <div className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-brand-600 dark:text-brand-400">
                                {d.phone && <><PhoneIcon />{d.phone}</>}
                              </div>
                              <div className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-brand-600 dark:text-brand-400">
                                <span>Map</span>
                                <ArrowUpRightIcon />
                              </div>
                            </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* User avatar */}
                  {isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-[10px] font-bold text-white shadow-sm">
                      {(user?.name || user?.email || "U")[0].toUpperCase()}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 shadow-sm">
                  <div className="flex gap-0.5">
                    {[0, 200, 400].map(d => (
                      <div key={d} className="h-2 w-2 rounded-full bg-white/80" style={{ animation: "typing 1.4s infinite", animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
                <div className="glass-liquid rounded-2xl rounded-tl-none border border-white/45 px-5 py-3.5">
                  <div className="flex items-center gap-1.5">
                    {[0, 200, 400].map(d => (
                      <div key={d} className="h-2 w-2 rounded-full bg-neutral-400" style={{ animation: "typing 1.4s infinite", animationDelay: `${d}ms` }} />
                    ))}
                    <span className="ml-2 text-xs text-neutral-400">Thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input Bar ───────────────────────────────────────── */}
      <ChatInput
        models={MODELS}
        hasMessages={hasMessages}
        placeholder={tab === "asha" ? "Patient observations... (any language)" : "Describe symptoms in any language..."}
        onSend={handleSend}
      />

      {/* ── Footer info ─────────────────────────────────────── */}
      <div className="glass-liquid flex items-center justify-between border-t border-white/35 px-4 py-1.5">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-neutral-400">6 agents online</span>
          </div>
          <p className="text-[10px] text-neutral-400">
            Always consult a doctor before acting on this information · Emergency: 112
          </p>
        </div>
      </div>
    </div>
  );
}
