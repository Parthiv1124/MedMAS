import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATUS_LABELS = {
  requested: "Waiting for doctor",
  assigned: "Doctor assigned",
  accepted: "Doctor accepted",
  in_progress: "Consultation active",
  completed: "Completed",
  closed: "Closed",
};

/**
 * ConsultDoctor — patient-side component for requesting a doctor consultation.
 *
 * Props:
 *  - userId        : current user's ID
 *  - sessionId     : current chat session ID (optional)
 *  - symptomsSummary: AI-generated symptoms summary from chat
 *  - aiSuggestion  : AI suggestion text
 *  - triageLevel   : triage level from chat response
 *  - specialtyNeeded: suggested specialty
 *  - district      : user's district
 */
export default function ConsultDoctor({
  userId,
  sessionId,
  symptomsSummary = "",
  aiSuggestion = "",
  triageLevel = "routine",
  specialtyNeeded = "General",
  district = "",
}) {
  const [step, setStep] = useState("idle");  // idle | consent | created | viewing
  const [consentScope, setConsentScope] = useState(["chat"]);
  const [caseData, setCaseData] = useState(null);
  const [cases, setCases] = useState([]);
  const [messages, setMessages] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const msgEndRef = useRef(null);

  useEffect(() => {
    if (userId) loadMyCases();
  }, [userId]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMyCases() {
    try {
      const res = await fetch(`${API_BASE}/api/cases/user/${userId}`);
      const data = await res.json();
      setCases(data.cases || []);
    } catch { /* ignore */ }
  }

  function toggleScope(s) {
    setConsentScope((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function handleCreateCase() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          session_id: sessionId,
          symptoms_summary: symptomsSummary,
          ai_suggestion: aiSuggestion,
          triage_level: triageLevel,
          specialty_needed: specialtyNeeded,
          district: district,
          consent_scope: consentScope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create case");
      setCaseData(data.case);
      setStep("created");
      loadMyCases();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function openCaseDetail(caseId) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}`);
      const data = await res.json();
      setCaseData(data.case);
      setMessages(data.messages || []);
      setPrescriptions(data.prescriptions || []);
      setStep("viewing");
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!msgText.trim() || !caseData) return;
    try {
      await fetch(`${API_BASE}/api/cases/${caseData.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseData.id,
          sender_id: userId,
          sender_type: "patient",
          message: msgText.trim(),
        }),
      });
      setMsgText("");
      const res = await fetch(`${API_BASE}/api/cases/${caseData.id}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch { /* ignore */ }
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="mt-4">
      {/* Quick access to existing cases */}
      {cases.length > 0 && step === "idle" && (
        <div className="mb-4">
          <p className="text-xs text-zinc-500 mb-2">Your consultations:</p>
          <div className="space-y-2">
            {cases.slice(0, 3).map((c) => (
              <button key={c.id} onClick={() => openCaseDetail(c.id)}
                className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-indigo-400">{STATUS_LABELS[c.status] || c.status}</span>
                  <span className="text-[10px] text-zinc-600">{c.specialty_needed}</span>
                </div>
                <p className="text-sm text-zinc-400 truncate mt-1">{c.symptoms_summary || "Consultation"}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Request button */}
      {step === "idle" && (
        <button onClick={() => setStep("consent")}
          className="w-full py-3 rounded-lg bg-indigo-500/20 text-indigo-400 text-sm font-medium hover:bg-indigo-500/30 border border-indigo-500/20 transition">
          Consult a Doctor
        </button>
      )}

      {/* Consent step */}
      {step === "consent" && (
        <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02] space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-200 mb-1">Consent Required</h3>
            <p className="text-xs text-zinc-500">
              A doctor will review your case. Choose what data to share:
            </p>
          </div>
          <div className="space-y-2">
            {[
              { key: "chat", label: "Chat history & symptoms" },
              { key: "reports", label: "Lab reports & documents" },
              { key: "contact", label: "Contact information" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={consentScope.includes(key)}
                  onChange={() => toggleScope(key)}
                  className="rounded border-zinc-600 bg-transparent" />
                {label}
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreateCase} disabled={loading || consentScope.length === 0}
              className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 disabled:opacity-40 transition">
              {loading ? "Creating..." : "Confirm & Request Doctor"}
            </button>
            <button onClick={() => { setStep("idle"); setError(""); }}
              className="px-4 py-2 rounded-lg text-zinc-500 text-sm hover:text-zinc-300 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Case created */}
      {step === "created" && caseData && (
        <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-2">
          <p className="text-sm text-emerald-400 font-medium">Consultation requested</p>
          <p className="text-xs text-zinc-400">
            Your case has been created. A doctor matching your needs ({specialtyNeeded}, {district}) will be assigned soon.
          </p>
          <button onClick={() => openCaseDetail(caseData.id)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition">
            View case details
          </button>
        </div>
      )}

      {/* Case detail view with messaging */}
      {step === "viewing" && caseData && (
        <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-indigo-400">{STATUS_LABELS[caseData.status]}</span>
              <p className="text-sm text-zinc-300 mt-0.5">{caseData.symptoms_summary || "Consultation"}</p>
            </div>
            <button onClick={() => { setStep("idle"); setCaseData(null); }}
              className="text-xs text-zinc-500 hover:text-zinc-300">Back</button>
          </div>

          {/* Prescriptions */}
          {prescriptions.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Prescriptions:</p>
              {prescriptions.map((rx) => (
                <div key={rx.id} className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 mb-2">
                  <p className="text-sm text-emerald-400 font-medium">{rx.diagnosis || "Prescription"}</p>
                  {rx.medications?.map((m, i) => (
                    <p key={i} className="text-xs text-zinc-400 mt-1">
                      {m.name} {m.dosage && `— ${m.dosage}`} {m.frequency && `— ${m.frequency}`} {m.duration && `(${m.duration})`}
                    </p>
                  ))}
                  {rx.instructions && <p className="text-xs text-zinc-500 mt-2">{rx.instructions}</p>}
                  {rx.follow_up_date && <p className="text-xs text-zinc-600 mt-1">Follow-up: {rx.follow_up_date}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div>
            <p className="text-xs text-zinc-500 mb-2">Messages:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4">No messages yet</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_type === "patient" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    m.sender_type === "patient"
                      ? "bg-indigo-500/20 text-indigo-100"
                      : "bg-white/[0.06] text-zinc-300"
                  }`}>
                    <p className="text-[10px] text-zinc-600 mb-0.5">
                      {m.sender_type === "doctor" ? "Doctor" : "You"}
                    </p>
                    <p>{m.message}</p>
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>
          </div>

          {/* Message input */}
          {["accepted", "in_progress"].includes(caseData.status) && (
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input type="text" value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="Message your doctor..."
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/40" />
              <button type="submit" disabled={!msgText.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm disabled:opacity-30 transition">
                Send
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
