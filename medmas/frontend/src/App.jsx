import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const AGENT_INFO = {
  symptom: { label: "Symptom Checker", icon: "S1", color: "from-blue-500 to-cyan-400" },
  lab: { label: "Disease Predictor", icon: "D2", color: "from-purple-500 to-pink-400" },
  mental: { label: "Empathy Chatbot", icon: "E3", color: "from-rose-500 to-orange-400" },
  lifestyle: { label: "Health Scorer", icon: "H4", color: "from-emerald-500 to-teal-400" },
  asha: { label: "ASHA Copilot", icon: "A6", color: "from-amber-500 to-yellow-400" },
  doctor: { label: "Doctor Finder", icon: "F1", color: "from-indigo-500 to-blue-400" },
  offtopic: { label: "MedMAS Assistant", icon: "M+", color: "from-slate-500 to-gray-400" },
};

const TRIAGE = {
  urgent: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-500" },
  moderate: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", dot: "bg-amber-500" },
  routine: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-500" },
};

/* ── Inline icons ─────────────────────────────────────────────────────── */
const SendIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);
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
const BotIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
  </svg>
);

export default function App() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState(null);
  const [district, setDistrict] = useState("Vadodara");
  const [tab, setTab] = useState("chat");
  const bottomRef = useRef(null);

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

  async function sendMessage() {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: "user", text: input }]);
    setInput("");
    setLoading(true);
    setActiveAgent("Crisis Guard scanning...");

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, user_district: district }),
      });
      const data = await res.json();
      if (data.detail) throw new Error(data.detail);

      setActiveAgent(AGENT_INFO[data.intent]?.label || "Processing...");
      setTimeout(() => setActiveAgent(null), 3000);

      setMessages(prev => [...prev, {
        role: "assistant", text: data.response, triage: data.triage_level,
        intent: data.intent, crisis: data.crisis_detected,
        doctors: data.doctor_list, lang: data.original_language,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", text: "Error: " + err.message }]);
      setActiveAgent(null);
    } finally { setLoading(false); }
  }

  async function sendASHA() {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: "user", text: `[ASHA] ${input}` }]);
    setInput("");
    setLoading(true);
    setActiveAgent("ASHA Copilot");

    try {
      const res = await fetch(`${API_BASE}/api/asha/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asha_worker_id: "demo-worker", patient_id: "demo-patient",
          observations: input, user_district: district,
        }),
      });
      const data = await res.json();
      if (data.detail) throw new Error(data.detail);

      setTimeout(() => setActiveAgent(null), 3000);
      setMessages(prev => [...prev, {
        role: "assistant", text: data.final_response, triage: data.triage_level,
        intent: "asha", crisis: data.crisis_detected,
        doctors: data.doctor_list, asha: data.asha_result,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", text: "Error: " + err.message }]);
      setActiveAgent(null);
    } finally { setLoading(false); }
  }

  function handleSend() { tab === "asha" ? sendASHA() : sendMessage(); }

  const agentInfo = activeAgent && Object.values(AGENT_INFO).find(a => activeAgent.includes(a.label));

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass border-b border-white/30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-teal-500 flex items-center justify-center text-white text-sm font-bold shadow-md shadow-brand-500/20">
              M+
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-gray-900 leading-tight">MedMAS</h1>
              <p className="text-[10px] text-gray-500 leading-tight">Multi-Agent AI Health System</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-0.5 ml-2">
            {[
              { id: "chat", label: "Patient", emoji: "🩺" },
              { id: "asha", label: "ASHA", emoji: "👩‍⚕️" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition-all ${tab === t.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                <span className="mr-1">{t.emoji}</span>{t.label}
              </button>
            ))}
          </div>

          {/* District */}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-lg px-2.5 py-1.5">
              <LocationIcon />
              <select
                value={district}
                onChange={e => setDistrict(e.target.value)}
                className="bg-transparent text-xs text-gray-700 font-medium focus:outline-none cursor-pointer"
              >
                {["Vadodara", "Surat", "Rajkot", "Bharuch", "Ahmedabad", "Mumbai", "Delhi"].map(d =>
                  <option key={d}>{d}</option>
                )}
              </select>
            </div>

            {/* User */}
            <div className="flex items-center gap-2">
              {user && (
                <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-lg px-2.5 py-1.5">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-500 to-teal-500 flex items-center justify-center text-[9px] text-white font-bold">
                    {(user.name || user.email || "U")[0].toUpperCase()}
                  </div>
                  <span className="text-xs text-gray-700 font-medium max-w-[100px] truncate">{user.name || user.email}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Logout"
              >
                <LogoutIcon />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Agent Status Bar ────────────────────────────────────────── */}
      {(loading || activeAgent) && (
        <div className="max-w-4xl mx-auto w-full px-4 pt-3 animate-slide-up">
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${agentInfo
            ? "bg-brand-50/80 border-brand-200/50"
            : "bg-gray-50 border-gray-200/50"
            }`}>
            {agentInfo ? (
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${agentInfo.color} flex items-center justify-center text-[9px] text-white font-bold shadow-sm`}>
                {agentInfo.icon}
              </div>
            ) : (
              <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-brand-500 animate-pulse" />
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-800">
                {activeAgent || "Processing..."}
              </p>
              <p className="text-[10px] text-gray-500">Agent pipeline active</p>
            </div>
            <div className="ml-auto flex gap-1">
              <div className="agent-dot bg-brand-400" style={{ animationDelay: "0ms" }} />
              <div className="agent-dot bg-brand-400" style={{ animationDelay: "200ms" }} />
              <div className="agent-dot bg-brand-400" style={{ animationDelay: "400ms" }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500/10 to-teal-500/10 flex items-center justify-center mb-6">
                <BotIcon />
                <span className="text-3xl ml-1">🩺</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                {tab === "asha" ? "ASHA Worker Console" : "How can I help you today?"}
              </h2>
              <p className="text-sm text-gray-500 text-center max-w-sm mb-8">
                {tab === "asha"
                  ? "Enter patient field observations in any Indian language for AI-assisted triage"
                  : "Describe your symptoms in any language — Hindi, Tamil, Gujarati, English, and 18+ more"}
              </p>
              {/* Quick prompts */}
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {(tab === "asha"
                  ? [
                    "Pregnant woman, 8 months, high BP, swelling in feet",
                    "Child 2 years, diarrhea 3 days, not eating",
                    "Old man, cough for 2 weeks, blood in sputum",
                  ]
                  : [
                    "I have a headache and fever since 2 days",
                    "मुझे सीने में दर्द हो रहा है",
                    "I feel very stressed and can't sleep",
                    "My blood sugar report shows HbA1c 7.2",
                  ]
                ).map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(prompt); }}
                    className="text-xs px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700 transition-all shadow-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            const agent = msg.intent && AGENT_INFO[msg.intent];
            const triage = msg.triage && TRIAGE[msg.triage];

            return (
              <div
                key={i}
                className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} ${isUser ? "animate-slide-in-r" : "animate-slide-in-l"
                  }`}
              >
                {/* Bot avatar */}
                {!isUser && (
                  <div className={`shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br ${agent?.color || "from-brand-500 to-teal-500"
                    } flex items-center justify-center text-[9px] text-white font-bold shadow-sm mt-1`}>
                    {agent?.icon || "M+"}
                  </div>
                )}

                <div className={`max-w-[80%] ${isUser ? "order-first" : ""}`}>
                  {/* Crisis banner */}
                  {msg.crisis && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-2 flex items-center gap-2 pulse-danger">
                      <span className="text-red-500 text-sm">🚨</span>
                      <span className="text-xs font-semibold text-red-400">CRISIS DETECTED — emergency resources included below</span>
                    </div>
                  )}

                  {/* Triage + Agent badge */}
                  {triage && !isUser && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border ${triage.bg} ${triage.text} ${triage.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${triage.dot}`} />
                        {msg.triage?.toUpperCase()}
                      </span>
                      {agent && (
                        <span className="text-[10px] text-gray-400 font-medium">
                          via {agent.label}
                        </span>
                      )}
                      {msg.lang && msg.lang !== "en" && (
                        <span className="text-[10px] text-brand-500 font-mono bg-brand-50 px-1.5 py-0.5 rounded">
                          {msg.lang.toUpperCase()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser
                    ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-md shadow-brand-500/15"
                    : "glass border border-gray-200/60 text-gray-800"
                    }`}>
                    <p className="whitespace-pre-wrap">{msg.text}</p>

                    {/* Doctor cards */}
                    {msg.doctors?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200/40 space-y-2">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Nearby Doctors</p>
                        {msg.doctors.slice(0, 3).map((d, j) => (
                          <div key={j} className="flex items-center gap-2.5 bg-white/60 rounded-lg px-3 py-2 border border-gray-100">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center text-[9px] text-white font-bold shrink-0">
                              {(d.name || "D")[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-800 truncate">{d.name}</p>
                              <p className="text-[10px] text-gray-500">{d.specialty}</p>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-brand-600 font-mono shrink-0">
                              <PhoneIcon />
                              {d.phone}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* User avatar */}
                {isUser && (
                  <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-[10px] text-white font-bold shadow-sm mt-1">
                    {(user?.name || user?.email || "U")[0].toUpperCase()}
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3 animate-slide-in-l">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 flex items-center justify-center shadow-sm">
                <div className="flex gap-0.5">
                  <div className="agent-dot bg-white/80" style={{ animationDelay: "0ms" }} />
                  <div className="agent-dot bg-white/80" style={{ animationDelay: "200ms" }} />
                  <div className="agent-dot bg-white/80" style={{ animationDelay: "400ms" }} />
                </div>
              </div>
              <div className="glass border border-gray-200/60 rounded-2xl px-5 py-3.5">
                <div className="flex gap-1.5 items-center">
                  <div className="agent-dot bg-gray-400" style={{ animationDelay: "0ms" }} />
                  <div className="agent-dot bg-gray-400" style={{ animationDelay: "200ms" }} />
                  <div className="agent-dot bg-gray-400" style={{ animationDelay: "400ms" }} />
                  <span className="text-xs text-gray-400 ml-2">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Input Bar ───────────────────────────────────────────────── */}
      <footer className="sticky bottom-0 z-20 glass border-t border-white/30">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && handleSend()}
                placeholder={tab === "asha" ? "Patient observations... (any language)" : "Describe symptoms in any language..."}
                disabled={loading}
                className="w-full bg-white border border-gray-200 rounded-2xl pl-4 pr-4 py-3.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 disabled:opacity-50 shadow-sm transition-all"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-teal-500 text-white flex items-center justify-center hover:shadow-lg hover:shadow-brand-500/25 disabled:opacity-40 transition-all active:scale-95 shrink-0"
            >
              <SendIcon />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-gray-400">6 agents online</span>
            </div>
            <p className="text-[10px] text-gray-400">
              Always consult a doctor before acting on this information · Emergency: 112
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
