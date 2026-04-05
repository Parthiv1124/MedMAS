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
  requested: "bg-yellow-100 text-yellow-700 border-yellow-200",
  assigned: "bg-blue-100 text-blue-700 border-blue-200",
  accepted: "bg-indigo-100 text-indigo-700 border-indigo-200",
  in_progress: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  closed: "bg-gray-100 text-gray-700 border-gray-200",
};

const TRIAGE_COLORS = {
  urgent: "text-red-600 bg-red-50",
  moderate: "text-amber-600 bg-amber-50",
  routine: "text-green-600 bg-green-50",
};

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

export default function DoctorDashboard() {
  const navigate = useNavigate();
  const doctor = JSON.parse(localStorage.getItem("medmas_doctor") || "null");
  const user = JSON.parse(localStorage.getItem("medmas_user") || "null");

  const [tab, setTab] = useState("queue");
  const [cases, setCases] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [closedCases, setClosedCases] = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [patientInfo, setPatientInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [loading, setLoading] = useState(false);

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
    loadClosedCases();
  }, []);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  async function loadClosedCases() {
    try {
      const res = await fetch(`${API_BASE}/api/cases/doctor/${doctor.id}/closed`);
      const data = await res.json();
      setClosedCases(data.cases || []);
    } catch { /* ignore */ }
  }

  async function openCase(caseId) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cases/${caseId}`);
      const data = await res.json();
      setActiveCase(data.case);
      setPatientInfo(data.patient_info || null);
      setMessages(data.messages || []);
      setPrescriptions(data.prescriptions || []);
      setTab("case");
    } catch { /* ignore */ }
    setLoading(false);
  }

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
      if (action === "close") loadClosedCases();
    } catch { /* ignore */ }
  }

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

  function handleLogout() {
    localStorage.removeItem("medmas_token");
    localStorage.removeItem("medmas_user");
    localStorage.removeItem("medmas_doctor");
    navigate("/doctor/login");
  }

  function nextAction(status) {
    const map = {
      assigned: { action: "accept", label: "Accept Case" },
      accepted: { action: "start", label: "Start Consultation" },
      in_progress: { action: "complete", label: "Mark Completed" },
    };
    return map[status] || null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-teal-500 flex items-center justify-center shadow-md shadow-brand-500/20">
            <span className="text-white font-bold text-sm">M+</span>
          </div>
          <div>
            <span className="font-semibold text-lg text-slate-900">MedMAS</span>
            <span className="text-xs text-slate-500 ml-2 block sm:inline">Doctor Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-700">Dr. {doctor?.name || "Doctor"}</span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            doctor?.status === "verified" 
              ? "bg-green-100 text-green-700 border border-green-200" 
              : "bg-amber-100 text-amber-700 border border-amber-200"
          }`}>
            {doctor?.status === "verified" ? "Verified" : "Pending"}
          </span>
          <button onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-red-600 transition flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <aside className="w-80 bg-white/60 backdrop-blur-sm border-r border-slate-200/60 flex flex-col">
          <div className="p-4 flex gap-2">
            <button onClick={() => { setTab("queue"); loadMyCases(); }}
              className={`flex-1 text-sm font-medium py-2.5 px-3 rounded-xl transition-all ${
                tab === "queue" 
                  ? "bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-md shadow-brand-500/20" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}>
              Active ({cases.length})
            </button>
            <button onClick={() => { setTab("unassigned"); loadUnassigned(); }}
              className={`flex-1 text-sm font-medium py-2.5 px-3 rounded-xl transition-all ${
                tab === "unassigned" 
                  ? "bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-md shadow-brand-500/20" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}>
              Open ({unassigned.length})
            </button>
            <button onClick={() => { setTab("closed"); loadClosedCases(); }}
              className={`flex-1 text-xs py-2 px-3 rounded-lg transition ${
                tab === "closed" ? "bg-zinc-500/20 text-zinc-400" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              Closed ({closedCases.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
            {(tab === "queue" ? cases : tab === "unassigned" ? unassigned : tab === "closed" ? closedCases : cases).map((c) => (
              <button key={c.id}
                onClick={() => tab === "unassigned" ? null : openCase(c.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md ${
                  activeCase?.id === c.id
                    ? "border-brand-300 bg-brand-50/50 shadow-md"
                    : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-semibold border ${STATUS_COLORS[c.status]}`}>
                    {STATUS_LABELS[c.status]}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${TRIAGE_COLORS[c.triage_level]}`}>
                    {c.triage_level}
                  </span>
                </div>
                <p className="text-sm text-slate-800 font-medium truncate">{c.symptoms_summary || "No summary"}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                  <span className="font-medium text-brand-600">{c.specialty_needed}</span>
                  <span>·</span>
                  <span>{c.district || "—"}</span>
                  <span>·</span>
                  <span>{timeAgo(c.created_at)}</span>
                </div>
                {tab === "unassigned" && (
                  <button onClick={(e) => { e.stopPropagation(); handleAssign(c.id); }}
                    className="mt-3 w-full text-sm font-medium py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-teal-500 text-white hover:shadow-md hover:shadow-brand-500/20 transition-all">
                    Take Case
                  </button>
                )}
              </button>
            ))}
            {((tab === "queue" && !cases.length) || (tab === "unassigned" && !unassigned.length)) && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className="text-slate-400">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinecap="round" />
                    <rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" />
                    <path d="M12 11v6M9 14h6" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-slate-500 text-sm">No cases</p>
              </div>
            )}
          </div>
        </aside>

        {/* Main panel */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {tab === "case" && activeCase ? (
            <>
              {/* Case header */}
              <div className="bg-white/60 backdrop-blur-sm border-b border-slate-200/60 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${STATUS_COLORS[activeCase.status]}`}>
                        {STATUS_LABELS[activeCase.status]}
                      </span>
                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${TRIAGE_COLORS[activeCase.triage_level]}`}>
                        Triage: {activeCase.triage_level}
                      </span>
                      <span className="text-xs text-slate-500">
                        {activeCase.specialty_needed} · {activeCase.district || "—"}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900">Case Summary</h2>
                  </div>
                  <div className="flex gap-2">
                    {nextAction(activeCase.status) && (
                      <button onClick={() => handleTransition(nextAction(activeCase.status).action)}
                        className="text-sm px-5 py-2.5 rounded-xl font-medium bg-gradient-to-r from-brand-600 to-teal-500 text-white hover:shadow-lg hover:shadow-brand-500/20 transition-all">
                        {nextAction(activeCase.status).label}
                      </button>
                    )}
                    {["assigned", "accepted", "in_progress"].includes(activeCase.status) && (
                      <button onClick={() => setRxOpen(true)}
                        className="text-sm px-5 py-2.5 rounded-xl font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 transition-all">
                        Write Prescription
                      </button>
                    )}
                    {activeCase.status !== "closed" && (
                      <button onClick={() => handleTransition("close")}
                        className="text-sm px-4 py-2.5 rounded-xl font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all">
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Case body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Structured Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl border-2 border-slate-100 bg-white shadow-sm">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Symptoms</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{activeCase.symptoms_summary || "—"}</p>
                  </div>
                  <div className="p-5 rounded-2xl border-2 border-slate-100 bg-white shadow-sm">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">AI Suggestion</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{activeCase.ai_suggestion || "—"}</p>
                  </div>
                </div>

                {/* Prescriptions */}
                {prescriptions.length > 0 && (
                  <div className="bg-white rounded-2xl border-2 border-slate-100 p-5 shadow-sm">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Prescriptions</h3>
                    <div className="space-y-4">
                      {prescriptions.map((rx) => (
                        <div key={rx.id} className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-sm font-semibold text-emerald-700">Diagnosis: </span>
                              <span className="text-sm text-slate-700">{rx.diagnosis || "—"}</span>
                            </div>
                            <span className="text-xs text-slate-500">{timeAgo(rx.created_at)}</span>
                          </div>
                          {rx.medications?.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold text-slate-500 uppercase">Medications:</p>
                              {rx.medications.map((m, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  <span className="font-medium">{m.name}</span>
                                  {m.dosage && <span className="text-slate-500">— {m.dosage}</span>}
                                  {m.frequency && <span className="text-slate-500">— {m.frequency}</span>}
                                  {m.duration && <span className="text-slate-500">— {m.duration}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          {rx.instructions && (
                            <div className="mt-3 pt-3 border-t border-emerald-200">
                              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Instructions:</p>
                              <p className="text-sm text-slate-600">{rx.instructions}</p>
                            </div>
                          )}
                          {rx.follow_up_date && (
                            <p className="text-xs text-slate-500 mt-2">Follow-up: {rx.follow_up_date}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat thread */}
                <div className="bg-white rounded-2xl border-2 border-slate-100 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Communication</h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                    {messages.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-8">No messages yet. Start the conversation.</p>
                    )}
                    {messages.map((m) => (
                      <div key={m.id}
                        className={`flex ${m.sender_type === "doctor" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                          m.sender_type === "doctor"
                            ? "bg-gradient-to-r from-brand-600 to-teal-500 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          <p>{m.message}</p>
                          <p className={`text-[10px] mt-1 ${m.sender_type === "doctor" ? "text-white/70" : "text-slate-400"}`}>
                            {timeAgo(m.created_at)}
                          </p>
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
                  className="bg-white/80 backdrop-blur-sm border-t border-slate-200/60 px-6 py-4 flex gap-3">
                  <input type="text" value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder="Type a message to the patient..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                  <button type="submit" disabled={!msgText.trim()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-teal-500 text-white text-sm font-medium hover:shadow-lg hover:shadow-brand-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    Send
                  </button>
                </form>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-100 to-teal-100 flex items-center justify-center mx-auto mb-5">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className="text-brand-500">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinecap="round" />
                    <rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" />
                    <path d="M12 11v6M9 14h6" strokeLinecap="round" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Select a case to begin</h3>
                <p className="text-sm text-slate-500">Or take a case from the Open queue</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Prescription Modal */}
      {rxOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Write Prescription</h3>
                <p className="text-xs text-slate-500 mt-0.5">Case #{activeCase?.id?.slice(0, 8)}</p>
              </div>
              <button onClick={() => setRxOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handlePrescription} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Diagnosis</label>
                <input type="text" value={rxForm.diagnosis}
                  onChange={(e) => setRxForm((p) => ({ ...p, diagnosis: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  placeholder="e.g. Viral fever with mild dehydration" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Medications</label>
                  <button type="button" onClick={addMed}
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium">+ Add medication</button>
                </div>
                <div className="space-y-3">
                  {rxForm.medications.map((med, i) => (
                    <div key={i} className="grid gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="Medicine name" value={med.name}
                          onChange={(e) => updateMed(i, "name", e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                        <input placeholder="Dosage (e.g. 500mg)" value={med.dosage}
                          onChange={(e) => updateMed(i, "dosage", e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                        <input placeholder="Frequency (e.g. twice daily)" value={med.frequency}
                          onChange={(e) => updateMed(i, "frequency", e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                        <input placeholder="Duration (e.g. 5 days)" value={med.duration}
                          onChange={(e) => updateMed(i, "duration", e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                      </div>
                      {rxForm.medications.length > 1 && (
                        <button type="button" onClick={() => removeMed(i)}
                          className="self-start text-xs text-red-500 hover:text-red-600 font-medium">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Instructions / Notes</label>
                <textarea value={rxForm.instructions}
                  onChange={(e) => setRxForm((p) => ({ ...p, instructions: e.target.value }))}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                  placeholder="e.g. Take with food, avoid dairy products..." />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Follow-up Date (optional)</label>
                <input type="date" value={rxForm.follow_up_date}
                  onChange={(e) => setRxForm((p) => ({ ...p, follow_up_date: e.target.value }))}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
              </div>

              <button type="submit" disabled={rxLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                {rxLoading ? "Saving..." : "Save Prescription"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
