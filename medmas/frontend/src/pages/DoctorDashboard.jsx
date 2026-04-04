import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATUS_LABELS = {
  requested: "Pending",
  assigned: "Assigned",
  accepted: "Accepted",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
};

const STATUS_COLORS = {
  requested: "bg-yellow-500/20 text-yellow-400",
  assigned: "bg-blue-500/20 text-blue-400",
  accepted: "bg-indigo-500/20 text-indigo-400",
  in_progress: "bg-emerald-500/20 text-emerald-400",
  completed: "bg-green-500/20 text-green-400",
  closed: "bg-zinc-500/20 text-zinc-400",
};

const TRIAGE_COLORS = {
  urgent: "text-red-400",
  moderate: "text-yellow-400",
  routine: "text-green-400",
};

/* ── tiny helpers ──────────────────────────────────────────────────────── */
function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function DoctorDashboard() {
  const navigate = useNavigate();
  const doctor = JSON.parse(localStorage.getItem("medmas_doctor") || "null");
  const user = JSON.parse(localStorage.getItem("medmas_user") || "null");

  const [tab, setTab] = useState("queue");        // queue | unassigned | case
  const [cases, setCases] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [messages, setMessages] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [loading, setLoading] = useState(false);

  // Prescription form
  const [rxOpen, setRxOpen] = useState(false);
  const [rxForm, setRxForm] = useState({
    diagnosis: "", instructions: "", follow_up_date: "",
    medications: [{ name: "", dosage: "", frequency: "", duration: "" }],
  });
  const [rxLoading, setRxLoading] = useState(false);
  const msgEndRef = useRef(null);

  useEffect(() => {
    if (!doctor) { navigate("/doctor/login"); return; }
    loadMyCases();
    loadUnassigned();
  }, []);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Data loaders ─────────────────────────────────────────────────── */
  async function loadMyCases() {
    try {
      const res = await fetch(`${API_BASE}/api/cases/doctor/${doctor.id}`);
      const data = await res.json();
      setCases(data.cases || []);
    } catch { /* ignore */ }
  }

  async function loadUnassigned() {
    try {
      const qs = new URLSearchParams();
      if (doctor.specialty) qs.set("specialty", doctor.specialty);
      if (doctor.district) qs.set("district", doctor.district);
      const res = await fetch(`${API_BASE}/api/cases/unassigned?${qs}`);
      const data = await res.json();
      setUnassigned(data.cases || []);
    } catch { /* ignore */ }
  }

  async function openCase(caseId) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}`);
      const data = await res.json();
      setActiveCase(data.case);
      setMessages(data.messages || []);
      setPrescriptions(data.prescriptions || []);
      setTab("case");
    } catch { /* ignore */ }
    setLoading(false);
  }

  /* ── Case actions ─────────────────────────────────────────────────── */
  async function handleAssign(caseId) {
    try {
      await fetch(`${API_BASE}/api/cases/${caseId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, doctor_id: doctor.id }),
      });
      loadMyCases();
      loadUnassigned();
    } catch { /* ignore */ }
  }

  async function handleTransition(action) {
    if (!activeCase) return;
    try {
      await fetch(`${API_BASE}/api/cases/${activeCase.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: activeCase.id }),
      });
      openCase(activeCase.id);
      loadMyCases();
    } catch { /* ignore */ }
  }

  /* ── Messaging ────────────────────────────────────────────────────── */
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!msgText.trim() || !activeCase) return;
    try {
      await fetch(`${API_BASE}/api/cases/${activeCase.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: activeCase.id,
          sender_id: user.id,
          sender_type: "doctor",
          message: msgText.trim(),
        }),
      });
      setMsgText("");
      const res = await fetch(`${API_BASE}/api/cases/${activeCase.id}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch { /* ignore */ }
  }

  /* ── Prescription ─────────────────────────────────────────────────── */
  function addMed() {
    setRxForm((p) => ({
      ...p,
      medications: [...p.medications, { name: "", dosage: "", frequency: "", duration: "" }],
    }));
  }

  function updateMed(idx, field, value) {
    setRxForm((p) => {
      const meds = [...p.medications];
      meds[idx] = { ...meds[idx], [field]: value };
      return { ...p, medications: meds };
    });
  }

  function removeMed(idx) {
    setRxForm((p) => ({
      ...p,
      medications: p.medications.filter((_, i) => i !== idx),
    }));
  }

  async function handlePrescription(e) {
    e.preventDefault();
    if (!activeCase) return;
    setRxLoading(true);
    try {
      await fetch(`${API_BASE}/api/prescriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: activeCase.id,
          doctor_id: doctor.id,
          patient_id: activeCase.user_id,
          diagnosis: rxForm.diagnosis,
          medications: rxForm.medications.filter((m) => m.name.trim()),
          instructions: rxForm.instructions,
          follow_up_date: rxForm.follow_up_date || null,
        }),
      });
      setRxOpen(false);
      setRxForm({
        diagnosis: "", instructions: "", follow_up_date: "",
        medications: [{ name: "", dosage: "", frequency: "", duration: "" }],
      });
      openCase(activeCase.id);
    } catch { /* ignore */ }
    setRxLoading(false);
  }

  /* ── Logout ───────────────────────────────────────────────────────── */
  function handleLogout() {
    localStorage.removeItem("medmas_token");
    localStorage.removeItem("medmas_user");
    localStorage.removeItem("medmas_doctor");
    navigate("/doctor/login");
  }

  /* ── Next valid transition ────────────────────────────────────────── */
  function nextAction(status) {
    const map = {
      assigned: { action: "accept", label: "Accept Case" },
      accepted: { action: "start", label: "Start Consultation" },
      in_progress: { action: "complete", label: "Mark Completed" },
    };
    return map[status] || null;
  }

  /* ═══════════ RENDER ═══════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <path d="M4 16h6l3-8 4 16 3-8h8" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-semibold text-lg">MedMAS</span>
          <span className="text-xs text-zinc-500 ml-1">Doctor Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">Dr. {doctor?.name || "Doctor"}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            doctor?.status === "verified" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
          }`}>
            {doctor?.status || "pending"}
          </span>
          <button onClick={handleLogout}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            Logout
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <aside className="w-72 border-r border-white/10 flex flex-col">
          <div className="p-4 flex gap-2">
            <button onClick={() => { setTab("queue"); loadMyCases(); }}
              className={`flex-1 text-xs py-2 px-3 rounded-lg transition ${
                tab === "queue" ? "bg-indigo-500/20 text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              My Cases ({cases.length})
            </button>
            <button onClick={() => { setTab("unassigned"); loadUnassigned(); }}
              className={`flex-1 text-xs py-2 px-3 rounded-lg transition ${
                tab === "unassigned" ? "bg-indigo-500/20 text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              Open ({unassigned.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
            {(tab === "queue" ? cases : tab === "unassigned" ? unassigned : cases).map((c) => (
              <button key={c.id}
                onClick={() => tab === "unassigned" ? null : openCase(c.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  activeCase?.id === c.id
                    ? "border-indigo-500/40 bg-indigo-500/10"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[c.status]}`}>
                    {STATUS_LABELS[c.status]}
                  </span>
                  <span className={`text-[10px] font-medium ${TRIAGE_COLORS[c.triage_level]}`}>
                    {c.triage_level}
                  </span>
                </div>
                <p className="text-sm text-zinc-300 truncate">{c.symptoms_summary || "No summary"}</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  {c.specialty_needed} &middot; {c.district || "—"} &middot; {timeAgo(c.created_at)}
                </p>
                {tab === "unassigned" && (
                  <button onClick={(e) => { e.stopPropagation(); handleAssign(c.id); }}
                    className="mt-2 w-full text-xs py-1.5 rounded-md bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition">
                    Take Case
                  </button>
                )}
              </button>
            ))}
            {((tab === "queue" && !cases.length) || (tab === "unassigned" && !unassigned.length)) && (
              <p className="text-center text-zinc-600 text-sm mt-8">No cases</p>
            )}
          </div>
        </aside>

        {/* Main panel */}
        <main className="flex-1 flex flex-col">
          {tab === "case" && activeCase ? (
            <>
              {/* Case header */}
              <div className="border-b border-white/10 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[activeCase.status]}`}>
                        {STATUS_LABELS[activeCase.status]}
                      </span>
                      <span className={`text-xs font-medium ${TRIAGE_COLORS[activeCase.triage_level]}`}>
                        Triage: {activeCase.triage_level}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {activeCase.specialty_needed} &middot; {activeCase.district || "—"}
                      </span>
                    </div>
                    <h2 className="text-lg font-medium">Case Summary</h2>
                  </div>
                  <div className="flex gap-2">
                    {nextAction(activeCase.status) && (
                      <button onClick={() => handleTransition(nextAction(activeCase.status).action)}
                        className="text-xs px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition">
                        {nextAction(activeCase.status).label}
                      </button>
                    )}
                    {["assigned", "accepted", "in_progress"].includes(activeCase.status) && (
                      <button onClick={() => setRxOpen(true)}
                        className="text-xs px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition">
                        Write Prescription
                      </button>
                    )}
                    {activeCase.status !== "closed" && (
                      <button onClick={() => handleTransition("close")}
                        className="text-xs px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 transition">
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Case body: summary + AI + chat + prescriptions */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Structured Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                    <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Symptoms</h3>
                    <p className="text-sm text-zinc-300">{activeCase.symptoms_summary || "—"}</p>
                  </div>
                  <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                    <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">AI Suggestion</h3>
                    <p className="text-sm text-zinc-300">{activeCase.ai_suggestion || "—"}</p>
                  </div>
                </div>

                {/* Prescriptions */}
                {prescriptions.length > 0 && (
                  <div>
                    <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Prescriptions</h3>
                    <div className="space-y-3">
                      {prescriptions.map((rx) => (
                        <div key={rx.id} className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                          <div className="flex justify-between mb-2">
                            <span className="text-sm font-medium text-emerald-400">Diagnosis: {rx.diagnosis || "—"}</span>
                            <span className="text-[10px] text-zinc-600">{timeAgo(rx.created_at)}</span>
                          </div>
                          {rx.medications?.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {rx.medications.map((m, i) => (
                                <p key={i} className="text-xs text-zinc-400">
                                  <span className="text-zinc-200">{m.name}</span>
                                  {m.dosage && ` — ${m.dosage}`}
                                  {m.frequency && ` — ${m.frequency}`}
                                  {m.duration && ` — ${m.duration}`}
                                </p>
                              ))}
                            </div>
                          )}
                          {rx.instructions && <p className="text-xs text-zinc-500 mt-2">Note: {rx.instructions}</p>}
                          {rx.follow_up_date && <p className="text-xs text-zinc-500 mt-1">Follow-up: {rx.follow_up_date}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat thread */}
                <div>
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Communication</h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                    {messages.length === 0 && (
                      <p className="text-sm text-zinc-600 text-center py-8">No messages yet. Start the conversation.</p>
                    )}
                    {messages.map((m) => (
                      <div key={m.id}
                        className={`flex ${m.sender_type === "doctor" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] rounded-lg px-4 py-2.5 text-sm ${
                          m.sender_type === "doctor"
                            ? "bg-indigo-500/20 text-indigo-100"
                            : "bg-white/[0.06] text-zinc-300"
                        }`}>
                          <p>{m.message}</p>
                          <p className="text-[10px] text-zinc-600 mt-1">{timeAgo(m.created_at)}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={msgEndRef} />
                  </div>
                </div>
              </div>

              {/* Message input */}
              {["accepted", "in_progress"].includes(activeCase.status) && (
                <form onSubmit={handleSendMessage}
                  className="border-t border-white/10 px-6 py-4 flex gap-3">
                  <input type="text" value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder="Type a message to the patient..."
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/40" />
                  <button type="submit" disabled={!msgText.trim()}
                    className="px-5 py-2.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 disabled:opacity-30 transition">
                    Send
                  </button>
                </form>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className="text-zinc-600">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinecap="round" />
                    <rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" />
                    <path d="M12 11v6M9 14h6" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-zinc-500 text-sm">Select a case to begin</p>
                <p className="text-zinc-700 text-xs mt-1">Or take a case from the Open queue</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Prescription Modal ──────────────────────────────────────── */}
      {rxOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-white/10 rounded-xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-medium">Write Prescription</h3>
              <button onClick={() => setRxOpen(false)} className="text-zinc-500 hover:text-zinc-300 text-lg">&times;</button>
            </div>
            <form onSubmit={handlePrescription} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Diagnosis</label>
                <input type="text" value={rxForm.diagnosis}
                  onChange={(e) => setRxForm((p) => ({ ...p, diagnosis: e.target.value }))}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/40"
                  placeholder="e.g. Viral fever with mild dehydration" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-500">Medications</label>
                  <button type="button" onClick={addMed}
                    className="text-xs text-indigo-400 hover:text-indigo-300">+ Add medication</button>
                </div>
                <div className="space-y-3">
                  {rxForm.medications.map((med, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="Medicine name" value={med.name}
                          onChange={(e) => updateMed(i, "name", e.target.value)}
                          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/40" />
                        <input placeholder="Dosage (e.g. 500mg)" value={med.dosage}
                          onChange={(e) => updateMed(i, "dosage", e.target.value)}
                          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/40" />
                        <input placeholder="Frequency (e.g. twice daily)" value={med.frequency}
                          onChange={(e) => updateMed(i, "frequency", e.target.value)}
                          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/40" />
                        <input placeholder="Duration (e.g. 5 days)" value={med.duration}
                          onChange={(e) => updateMed(i, "duration", e.target.value)}
                          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/40" />
                      </div>
                      {rxForm.medications.length > 1 && (
                        <button type="button" onClick={() => removeMed(i)}
                          className="self-start mt-2 text-zinc-600 hover:text-red-400 text-sm">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Instructions / Notes</label>
                <textarea value={rxForm.instructions}
                  onChange={(e) => setRxForm((p) => ({ ...p, instructions: e.target.value }))}
                  rows={3}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 resize-none focus:outline-none focus:border-indigo-500/40"
                  placeholder="e.g. Take with food, avoid dairy products..." />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Follow-up Date (optional)</label>
                <input type="date" value={rxForm.follow_up_date}
                  onChange={(e) => setRxForm((p) => ({ ...p, follow_up_date: e.target.value }))}
                  className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/40" />
              </div>

              <button type="submit" disabled={rxLoading}
                className="w-full py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition">
                {rxLoading ? "Saving..." : "Save Prescription"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
