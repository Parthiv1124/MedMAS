import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChatInput } from "@/components/ui/ai-input-001";
import ChatSidebar from "@/components/ui/ChatSidebar";
import { Sparkles, Cpu, Zap, PanelLeft } from "lucide-react";
import { LuBrain } from "react-icons/lu";
import { PiLightbulbFilament } from "react-icons/pi";
import logo from "../assets/logo.png";

// Session localStorage helpers
const SESSIONS_KEY = "medmas_sessions";
const msgKey = (id) => `medmas_session_${id}`;
function readSessions() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
    // Always return sorted most-recent-first
    return raw.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch { return []; }
}
function writeSessions(arr) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(arr));
}
function readMessages(sessionId) {
  try { return JSON.parse(localStorage.getItem(msgKey(sessionId)) || "[]"); }
  catch { return []; }
}
function appendMessages(sessionId, newMsgs) {
  // Blob URLs expire; strip before persisting
  const safe = newMsgs.map((m) => ({
    ...m,
    files: m.files?.map((f) => ({ ...f, url: null })) ?? undefined,
  }));
  const existing = readMessages(sessionId);
  localStorage.setItem(msgKey(sessionId), JSON.stringify([...existing, ...safe]));
}
function makeSessionId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function makeTitle(text) {
  return (text || "New Chat").trim().slice(0, 52) || "New Chat";
}

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

const TAB_STYLES = {
  chat: {
    active: "border-sky-300/80 bg-gradient-to-r from-sky-500 to-cyan-400 text-white shadow-[0_10px_30px_rgba(14,165,233,0.28)]",
    dot: "bg-sky-100",
  },
  asha: {
    active: "border-amber-300/80 bg-gradient-to-r from-amber-500 to-yellow-400 text-white shadow-[0_10px_30px_rgba(245,158,11,0.28)]",
    dot: "bg-amber-100",
  },
};

const TRIAGE = {
  urgent: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-500" },
  moderate: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", dot: "bg-amber-500" },
  routine: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-500" },
};

const MODELS = [
  { id: "gpt-4o", name: "GPT-4o", icon: <PiLightbulbFilament className="h-4 w-4" /> },
  { id: "claude-3-5", name: "Claude 3.5 Sonnet", icon: <Sparkles className="h-4 w-4" /> },
  { id: "gemini-pro", name: "Gemini Pro", icon: <Cpu className="h-4 w-4" /> },
  { id: "llama-3-1", name: "Llama 3.1", icon: <Zap className="h-4 w-4" /> },
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

/* Inline Icons */
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

function formatLabel(text) {
  return String(text || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getLocationBadgeClasses(status) {
  if (status === "live") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "detecting") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function normalizePatientId(value) {
  return value == null ? "" : String(value);
}

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState(null);
  const [district, setDistrict] = useState("");
  const [districts, setDistricts] = useState(["Vadodara", "Surat", "Rajkot", "Bharuch", "Ahmedabad", "Mumbai", "Delhi"]);
  const [locationStatus, setLocationStatus] = useState("detecting");
  const [locationHint, setLocationHint]   = useState("");
  const [userCoords, setUserCoords]       = useState(null); // {lat, lng}
  const [tab, setTab]                     = useState("chat");
  const [ashaPatients, setAshaPatients]   = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [assessmentHistory, setAssessmentHistory] = useState([]);
  const [assessmentHistoryLoading, setAssessmentHistoryLoading] = useState(false);
  const [assessmentHistoryError, setAssessmentHistoryError] = useState("");
  const [ashaQueueLoading, setAshaQueueLoading] = useState(false);
  const [ashaQueueError, setAshaQueueError] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [patientForm, setPatientForm] = useState({
    name: "",
    age: "",
    gender: "female",
    village: "",
    district: "",
    priority: "1",
    notes: "",
  });
  const bottomRef                         = useRef(null);
  const messagesRef = useRef([]);
  const requestInFlightRef = useRef(false);
  const selectedPatientSyncReadyRef = useRef(false);

  // Sidebar / session state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState(() => readSessions());
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const currentSessionRef = useRef(null); // mirror for async closures

  // Session helpers
  const persistExchange = useCallback((sessionId, userMsg, assistantMsg) => {
    // Append only the new pair; avoids re-reading stale data or double-writing
    appendMessages(sessionId, [userMsg, assistantMsg]);
    setSessions((prev) => {
      const now = new Date().toISOString();
      const updated = prev
        .map((s) => (s.id === sessionId ? { ...s, updatedAt: now } : s))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); // keep most-recent first
      writeSessions(updated);
      return updated;
    });
  }, []);

  function newChat() {
    currentSessionRef.current = null;
    setCurrentSessionId(null);
    setMessages([]);
  }

  function selectSession(id) {
    if (id === currentSessionRef.current) return;
    currentSessionRef.current = id;
    setCurrentSessionId(id);
    setMessages(readMessages(id));
  }

  function deleteSession(id) {
    localStorage.removeItem(msgKey(id));
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      writeSessions(updated);
      return updated;
    });
    if (currentSessionRef.current === id) {
      currentSessionRef.current = null;
      setCurrentSessionId(null);
      setMessages([]);
    }
  }

  const storedUser = localStorage.getItem("medmas_user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const ashaWorkerId = user?.id || "";

  function handleLogout() {
    localStorage.removeItem("medmas_token");
    localStorage.removeItem("medmas_user");
    navigate("/login");
  }

  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setPatientForm(prev => ({ ...prev, district: district || user?.district || "Vadodara" }));
  }, [district, user?.district]);

  // Fetch available districts from backend
  useEffect(() => {
    fetch(`${API_BASE}/api/districts`)
      .then(r => r.json())
      .then(data => { if (data.districts?.length) setDistricts(data.districts); })
      .catch(() => { });
  }, []);

  // Auto-detect location on mount
  useEffect(() => {
    const fallback = user?.district || "Vadodara";
    const needsSecureContext =
      !window.isSecureContext &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1";

    if (needsSecureContext) {
      setDistrict(fallback);
      setLocationStatus("manual");
      setLocationHint("Live location needs HTTPS. For local testing, set VITE_DEV_HTTPS=true.");
      return;
    }

    if (!navigator.geolocation) {
      setDistrict(fallback);
      setLocationStatus("manual");
      setLocationHint("This browser does not support geolocation.");
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
          if (res.ok && data.district) {
            setDistrict(data.district);
            setLocationStatus("live");
            setLocationHint("");
          } else {
            setDistrict(fallback);
            setLocationStatus("manual");
            setLocationHint("Could not match your live location. Using manual district selection.");
          }
        } catch {
          setDistrict(fallback);
          setLocationStatus("manual");
          setLocationHint("Could not resolve your live location. Using manual district selection.");
        }
      },
      () => {
        setDistrict(fallback);
        setLocationStatus("manual");
        setLocationHint("Location permission denied. Using manual district selection.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== "asha" || !ashaWorkerId) return;
    loadAshaQueue();
  }, [tab, ashaWorkerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ashaWorkerId || !selectedPatientId) {
      setAssessmentHistory([]);
      setAssessmentHistoryError("");
      return;
    }

    void loadAssessmentHistory(selectedPatientId);
  }, [ashaWorkerId, selectedPatientId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ashaWorkerId || !selectedPatientSyncReadyRef.current) return;
    void persistSelectedPatient(selectedPatientId || null).catch(err => {
      setAshaQueueError(err.message || "Unable to save selected patient.");
    });
  }, [ashaWorkerId, selectedPatientId]);

  function queueAssistantError(message) {
    setMessages(prev => [...prev, {
      id: Date.now() + 1,
      role: "assistant",
      text: `Error: ${message}`,
      intent: "asha",
    }]);
  }

  function handlePatientFormChange(field, value) {
    setPatientForm(prev => ({ ...prev, [field]: value }));
  }

  async function loadAshaQueue() {
    if (!ashaWorkerId) {
      setAshaQueueError("Sign in as an ASHA worker to access the patient queue.");
      return;
    }

    setAshaQueueLoading(true);
    setAshaQueueError("");

    try {
      const persistedSelection = await loadSelectedPatientFromServer();
      const res = await fetch(`${API_BASE}/api/asha/queue/${encodeURIComponent(ashaWorkerId)}`);
      const data = await res.json();
      if (!res.ok || data.detail) {
        throw new Error(data.detail || "Unable to load ASHA queue.");
      }

      const patients = data.patients || [];
      setAshaPatients(patients);

      const activeSelection = normalizePatientId(persistedSelection || selectedPatientId);
      const currentSelectionExists = patients.some(
        patient => normalizePatientId(patient.id) === activeSelection
      );

      if (patients.length === 0) {
        setSelectedPatientId("");
      } else if (currentSelectionExists && activeSelection) {
        setSelectedPatientId(activeSelection);
      } else {
        setSelectedPatientId(normalizePatientId(patients[0].id));
      }
      selectedPatientSyncReadyRef.current = true;
    } catch (err) {
      setAshaQueueError(err.message || "Unable to load ASHA queue.");
    } finally {
      setAshaQueueLoading(false);
    }
  }

  async function loadSelectedPatientFromServer() {
    if (!ashaWorkerId) return "";

    const res = await fetch(`${API_BASE}/api/asha/selected-patient/${encodeURIComponent(ashaWorkerId)}`);
    const data = await res.json();
    if (!res.ok || data.detail) {
      throw new Error(data.detail || "Unable to load selected patient.");
    }
    return normalizePatientId(data.patient_id || "");
  }

  async function persistSelectedPatient(patientId) {
    if (!ashaWorkerId) return;

    const res = await fetch(`${API_BASE}/api/asha/selected-patient`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asha_worker_id: ashaWorkerId,
        patient_id: patientId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.detail) {
      throw new Error(data.detail || "Unable to save selected patient.");
    }
  }

  async function createPatient() {
    if (!ashaWorkerId) {
      setAshaQueueError("Sign in as an ASHA worker to create a patient.");
      return;
    }

    const name = patientForm.name.trim();
    const village = patientForm.village.trim();
    const notes = patientForm.notes.trim();
    const age = Number(patientForm.age);
    const priority = Number(patientForm.priority);
    const patientDistrict = (patientForm.district || district || user?.district || "").trim();

    if (!name || !village || !patientDistrict || !Number.isFinite(age) || age <= 0) {
      setAshaQueueError("Enter patient name, age, village, and district before creating the record.");
      return;
    }

    setCreatingPatient(true);
    setAshaQueueError("");

    try {
      const res = await fetch(`${API_BASE}/api/asha/patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asha_worker_id: ashaWorkerId,
          asha_worker_phone: user?.phone || "",
          asha_worker_district: user?.district || district || "",
          name,
          age,
          gender: patientForm.gender,
          village,
          district: patientDistrict,
          priority: Number.isFinite(priority) && priority > 0 ? priority : 1,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.detail) {
        throw new Error(data.detail || "Unable to create patient.");
      }

      const patient = data.patient;
      if (patient) {
        setAshaPatients(prev => [patient, ...prev]);
        setSelectedPatientId(normalizePatientId(patient.id));
      }
      setPatientForm({
        name: "",
        age: "",
        gender: "female",
        village: "",
        district: patientDistrict,
        priority: "1",
        notes: "",
      });
      setShowPatientForm(false);
    } catch (err) {
      setAshaQueueError(err.message || "Unable to create patient.");
    } finally {
      setCreatingPatient(false);
    }
  }

  function buildChatHistory(currentMessages, limit = 20) {
    // Send the last `limit` messages as context; backend agents further slice internally
    return currentMessages
      .filter(m => m.text?.trim())
      .slice(-limit)
      .map(m => ({ role: m.role, content: m.text }));
  }

  async function sendMessage(text, files = []) {
    if (requestInFlightRef.current) return;

    const filePreviews = files.map((f) => ({
      name: f.name,
      type: f.type.startsWith("image/") ? "image" : "document",
      url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
    }));

    const userMsgId = Date.now();
    const userMsg = { id: userMsgId, role: "user", text, files: filePreviews };
    const history = buildChatHistory(messagesRef.current);

    setMessages(prev => [...prev, userMsg]);
    void _doSendMessage(userMsg, files, filePreviews, history);
  }

  async function _doSendMessage(userMsg, files, filePreviews, chatHistory) {
    requestInFlightRef.current = true;
    const { text } = userMsg;
    // Ensure we have a session before hitting the API
    let sessionId = currentSessionRef.current;
    if (!sessionId) {
      sessionId = makeSessionId();
      const newSession = {
        id: sessionId,
        title: makeTitle(text),
        tab,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      currentSessionRef.current = sessionId;
      setCurrentSessionId(sessionId);
      setSessions((prev) => {
        // New session is most recent; put it first, already sorted
        const updated = [newSession, ...prev];
        writeSessions(updated);
        return updated;
      });
    }

    setLoading(true);
    setActiveAgent("Crisis Guard scanning...");

    try {
      let res;
      if (files.length > 0) {
        const formData = new FormData();
        formData.append("message", text || "");
        if (district) formData.append("user_district", district);
        if (userCoords?.lat) formData.append("user_lat", String(userCoords.lat));
        if (userCoords?.lng) formData.append("user_lng", String(userCoords.lng));
        files.forEach((f) => formData.append("files", f));
        res = await fetch(`${API_BASE}/api/chat/upload`, { method: "POST", body: formData });
      } else {
        res = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            user_district: district,
            user_lat: userCoords?.lat,
            user_lng: userCoords?.lng,
            chat_history: chatHistory,
          }),
        });
      }
      const data = await res.json();
      if (data.detail) throw new Error(data.detail);

      setActiveAgent(AGENT_INFO[data.intent]?.label || "Processing...");
      setTimeout(() => setActiveAgent(null), 3000);

      const assistantMsg = {
        id: Date.now() + 1, role: "assistant", text: data.response,
        triage: data.triage_level, intent: data.intent,
        crisis: data.crisis_detected, doctors: data.doctor_list,
        lang: data.original_language,
        symptomResult: data.symptom_result || null,
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Persist exchange using the same userMsg object shown in the UI
      persistExchange(sessionId, userMsg, assistantMsg);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", text: "Error: " + err.message }]);
      setActiveAgent(null);
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function loadAssessmentHistory(patientId) {
    if (!patientId) return;

    setAssessmentHistoryLoading(true);
    setAssessmentHistoryError("");

    try {
      const res = await fetch(`${API_BASE}/api/asha/history/${encodeURIComponent(patientId)}`);
      const data = await res.json();
      if (!res.ok || data.detail) {
        throw new Error(data.detail || "Unable to load assessment history.");
      }
      setAssessmentHistory(data.assessments || []);
    } catch (err) {
      setAssessmentHistory([]);
      setAssessmentHistoryError(err.message || "Unable to load assessment history.");
    } finally {
      setAssessmentHistoryLoading(false);
    }
  }

  async function sendASHA(text) {
    if (requestInFlightRef.current) return;

    if (!ashaWorkerId) {
      queueAssistantError("Sign in as an ASHA worker before using ASHA Copilot.");
      return;
    }

    if (!selectedPatientId) {
      queueAssistantError("Select or create a patient before sending an ASHA assessment.");
      return;
    }

    const userMsg = { id: Date.now(), role: "user", text: `[ASHA] ${text}` };
    const history = buildChatHistory(messagesRef.current);

    // Ensure session exists
    let sessionId = currentSessionRef.current;
    if (!sessionId) {
      sessionId = makeSessionId();
      const newSession = {
        id: sessionId,
        title: makeTitle(text),
        tab: "asha",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      currentSessionRef.current = sessionId;
      setCurrentSessionId(sessionId);
      setSessions((prev) => {
        const updated = [newSession, ...prev];
        writeSessions(updated);
        return updated;
      });
    }

    setMessages(prev => [...prev, userMsg]);
    void _sendASHARequest(text, userMsg, sessionId, history);
  }

  async function _sendASHARequest(text, userMsg, sessionId, chatHistory) {
    requestInFlightRef.current = true;
    setLoading(true);
    setActiveAgent("ASHA Copilot");

    try {
      const res = await fetch(`${API_BASE}/api/asha/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asha_worker_id: ashaWorkerId,
          patient_id: selectedPatientId,
          observations: text, user_district: district, user_lat: userCoords?.lat, user_lng: userCoords?.lng,
          chat_history: chatHistory,
        }),
      });
      const data = await res.json();
      if (data.detail) throw new Error(data.detail);

      setTimeout(() => setActiveAgent(null), 3000);
      const assistantMsg = {
        id: Date.now() + 1, role: "assistant", text: data.final_response,
        triage: data.triage_level, intent: "asha",
        crisis: data.crisis_detected, doctors: data.doctor_list,
        asha: data.asha_result,
      };
      setMessages(prev => [...prev, assistantMsg]);
      persistExchange(sessionId, userMsg, assistantMsg);
      await loadAshaQueue();
      await loadAssessmentHistory(selectedPatientId);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", text: "Error: " + err.message }]);
      setActiveAgent(null);
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function transcribeAudio(blob) {
    const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("mpeg") ? "mp3" : blob.type.includes("wav") ? "wav" : "webm";
    const formData = new FormData();
    formData.append("file", blob, `voice-message.${extension}`);

    const res = await fetch(`${API_BASE}/api/transcribe`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || data.detail) {
      throw new Error(data.detail || "Speech transcription failed.");
    }
    return data.text || "";
  }

  function handleSend(text, files = []) {
    if (loading || requestInFlightRef.current) return;
    if (!text.trim() && files.length === 0) return;
    tab === "asha" ? sendASHA(text) : sendMessage(text, files);
  }

  const agentInfo = activeAgent && Object.values(AGENT_INFO).find(a => activeAgent.includes(a.label));
  const hasMessages = messages.length > 0;
  const agentCount = Object.keys(AGENT_INFO).length;
  const selectedPatient = ashaPatients.find(
    patient => normalizePatientId(patient.id) === normalizePatientId(selectedPatientId)
  );
  const ashaInputDisabled = tab === "asha" && (!ashaWorkerId || !selectedPatientId);
  const ashaPlaceholder = !ashaWorkerId
    ? "Sign in to use ASHA Copilot..."
    : !selectedPatientId
      ? "Select or create a patient before sending observations..."
      : "Patient observations... (any language)";

  return (
    <div className="flex h-screen overflow-hidden">

      {/* Sidebar */}
      <ChatSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={selectSession}
        onNewChat={newChat}
        onDeleteSession={deleteSession}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      {/* Main area */}
      <div className="relative flex flex-1 flex-col overflow-hidden bg-chat-grid">

        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-white/35 bg-white/38 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="glass-liquid rounded-xl p-2 text-neutral-500 transition-colors hover:text-neutral-900"
                    title="Open history"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </button>
                )}
                <img src={logo} alt="MedMAS" className="h-10 w-10 rounded-2xl shadow-[0_12px_30px_rgba(37,99,235,0.18)]" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-neutral-500">MedMAS</p>
                  <h1 className="truncate text-sm font-semibold text-neutral-900 sm:text-base">Multi-Agent Health Console</h1>
                </div>
              </div>

              <div className="order-3 w-full sm:order-2 sm:w-auto">
                <div className="glass-liquid inline-flex w-full rounded-2xl p-1 sm:w-auto">
                  {[
                    { id: "chat", label: "Patient", emoji: "\uD83E\uDE7A" },
                    { id: "asha", label: "ASHA", emoji: "\uD83D\uDC69\u200D\u2695\uFE0F" },
                  ].map(t => (
                    (() => {
                      const isActive = tab === t.id;
                      const styles = TAB_STYLES[t.id];
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTab(t.id)}
                          aria-pressed={isActive}
                          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-200 sm:min-w-[104px] sm:flex-none ${isActive
                              ? `${styles.active} -translate-y-0.5`
                              : "border-transparent text-neutral-600 hover:border-white/50 hover:bg-white/50 hover:text-neutral-900"
                            }`}>
                          <span className="text-sm">{t.emoji}</span>
                          <span>{t.label}</span>
                          <span
                            className={`absolute -bottom-1.5 h-1.5 w-8 rounded-full transition-all ${isActive ? styles.dot : "bg-transparent"}`}
                          />
                        </button>
                      );
                    })()
                  ))}
                </div>
              </div>

              <div className="order-2 ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 sm:order-3">
                <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${getLocationBadgeClasses(locationStatus)}`}>
                  <LocationIcon />
                  <span>{locationStatus === "live" ? "Live" : locationStatus === "detecting" ? "Detecting" : "Manual"}</span>
                </div>
                <div className="glass-liquid flex min-w-[132px] max-w-full items-center gap-2 rounded-full px-3 py-1.5">
                  <LocationIcon />
                  <select
                    value={district}
                    onChange={e => setDistrict(e.target.value)}
                    className="min-w-0 flex-1 cursor-pointer bg-transparent text-xs font-medium text-neutral-900 focus:outline-none"
                  >
                    {districts.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                {user && (
                  <div className="glass-liquid hidden items-center gap-2 rounded-full px-2.5 py-1.5 lg:flex">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-teal-500 text-[10px] font-bold text-white">
                      {(user.name || user.email || "U")[0].toUpperCase()}
                    </div>
                    <span className="max-w-[130px] truncate text-xs font-medium text-neutral-900">{user.name || user.email}</span>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="glass-liquid rounded-xl p-2 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="Logout">
                  <LogoutIcon />
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* Agent Status Bar */}
        <AnimatePresence>
          {(loading || activeAgent) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-auto w-full max-w-5xl px-3 pt-3 sm:px-4">
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${agentInfo
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

      {/* Messages */}
      <div className="z-10 flex w-full flex-1 flex-col items-center overflow-y-auto pt-4 sm:pt-5">
        <div className="flex w-full max-w-5xl flex-col gap-4 px-3 pb-24 sm:px-4 sm:pb-28">

          {tab === "asha" && (
            <div className="glass-liquid space-y-5 rounded-[32px] border border-white/50 p-4 shadow-[0_24px_70px_rgba(245,158,11,0.14)] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-600">
                    ASHA Workspace
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-neutral-900">
                    Patient Queue and Field Assessment
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">
                    Link each ASHA assessment to a real patient record before sending observations to the orchestrator.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700">
                    Worker: {user?.name || user?.email || "Not signed in"}
                  </span>
                  <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-medium text-neutral-700">
                    {selectedPatient ? `Patient: ${selectedPatient.name}` : "No patient selected"}
                  </span>
                  <button
                    type="button"
                    onClick={loadAshaQueue}
                    disabled={ashaQueueLoading || !ashaWorkerId}
                    className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ashaQueueLoading ? "Refreshing..." : "Refresh Queue"}
                  </button>
                </div>
              </div>

              {!ashaWorkerId && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Sign in with a real worker account to use ASHA Copilot.
                </div>
              )}

              {ashaQueueError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {ashaQueueError}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">Queue</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">{ashaPatients.length} active patients</p>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">Selected</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">
                    {selectedPatient ? selectedPatient.name : "Waiting for selection"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">History</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">{assessmentHistory.length} saved records</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="rounded-[28px] border border-white/55 bg-white/60 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-neutral-900">Patient Queue</p>
                      <p className="text-[11px] text-neutral-500">Active records from Supabase</p>
                    </div>
                    <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold text-white">
                      {ashaPatients.length}
                    </span>
                  </div>

                  {ashaQueueLoading ? (
                    <div className="mt-3 rounded-2xl border border-dashed border-neutral-200 px-4 py-5 text-sm text-neutral-500">
                      Loading patient queue...
                    </div>
                  ) : ashaPatients.length === 0 ? (
                    <div className="mt-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 px-4 py-5 text-sm text-amber-700">
                      No active patients in this queue yet. Add the first patient below.
                    </div>
                  ) : (
                    <div className="mt-3 max-h-[540px] space-y-2 overflow-y-auto pr-1">
                      {ashaPatients.map(patient => {
                        const patientId = normalizePatientId(patient.id);
                        const isSelected = patientId === normalizePatientId(selectedPatientId);
                        return (
                          <button
                            key={patientId}
                            type="button"
                            onClick={() => setSelectedPatientId(patientId)}
                            className={`flex w-full items-start justify-between rounded-2xl border px-3 py-3 text-left transition ${
                              isSelected
                                ? "border-amber-300 bg-gradient-to-r from-amber-500/12 to-yellow-400/12 shadow-[0_10px_30px_rgba(245,158,11,0.12)]"
                                : "border-white/50 bg-white/70 hover:border-amber-200 hover:bg-amber-50/60"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-neutral-900">{patient.name}</p>
                              <p className="mt-1 text-[11px] text-neutral-500">
                                {patient.age} yrs · {patient.gender} · {patient.village || patient.district}
                              </p>
                              {patient.notes && (
                                <p className="mt-1 line-clamp-2 text-[11px] text-neutral-500">{patient.notes}</p>
                              )}
                            </div>
                            <div className="ml-3 shrink-0 text-right">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                Priority
                              </p>
                              <p className="text-sm font-bold text-amber-700">{patient.priority || 1}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[28px] border border-white/55 bg-white/60 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-neutral-900">Selected Patient</p>
                      <p className="text-[11px] text-neutral-500">Use this record for the next field assessment</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPatientForm(prev => !prev)}
                      className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100"
                    >
                      {showPatientForm ? "Close Form" : "Add Patient"}
                    </button>
                  </div>

                  {selectedPatient ? (
                    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-neutral-900">{selectedPatient.name}</p>
                          <p className="mt-1 text-sm text-neutral-600">
                            {selectedPatient.age} years · {selectedPatient.gender}
                          </p>
                          <p className="mt-2 text-[11px] text-neutral-500">
                            {selectedPatient.village}, {selectedPatient.district}
                          </p>
                        </div>
                        <span className="rounded-full border border-amber-200 bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                          #{normalizePatientId(selectedPatient.id)}
                        </span>
                      </div>
                      {selectedPatient.notes && (
                        <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[11px] text-neutral-600">
                          {selectedPatient.notes}
                        </p>
                      )}
                      <div className="mt-3 rounded-2xl border border-white/60 bg-white/70 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                              Assessment History
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              Previous database records for this patient
                            </p>
                          </div>
                          <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold text-white">
                            {assessmentHistory.length}
                          </span>
                        </div>
                        {assessmentHistoryLoading ? (
                          <div className="mt-3 rounded-xl border border-dashed border-neutral-200 px-3 py-3 text-[11px] text-neutral-500">
                            Loading assessment history...
                          </div>
                        ) : assessmentHistoryError ? (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[11px] text-red-700">
                            {assessmentHistoryError}
                          </div>
                        ) : assessmentHistory.length === 0 ? (
                          <div className="mt-3 rounded-xl border border-dashed border-neutral-200 px-3 py-3 text-[11px] text-neutral-500">
                            No previous assessments found for this patient.
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {assessmentHistory.slice(0, 4).map(item => (
                              <div
                                key={item.id || `${item.created_at}-${item.triage_decision || "entry"}`}
                                className="rounded-xl border border-white/60 bg-white/80 px-3 py-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-700">
                                    {formatLabel(item.triage_decision || "recorded")}
                                  </span>
                                  <span className="text-[10px] text-neutral-500">
                                    {item.created_at ? new Date(item.created_at).toLocaleString() : "Saved in database"}
                                  </span>
                                </div>
                                {item.refer_to && (
                                  <p className="mt-2 text-[11px] text-neutral-600">
                                    Refer to: {item.refer_to}
                                  </p>
                                )}
                                {item.documentation?.chief_complaint && (
                                  <p className="mt-1 text-[11px] text-neutral-600">
                                    Complaint: {item.documentation.chief_complaint}
                                  </p>
                                )}
                                {item.danger_signs?.length > 0 && (
                                  <p className="mt-1 text-[11px] text-red-700">
                                    Danger signs: {item.danger_signs.slice(0, 2).join(", ")}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-5 text-sm text-neutral-500">
                      Select a patient from the queue or add a new patient to start an ASHA assessment.
                    </div>
                  )}
                  </div>

                  {showPatientForm && (
                    <div className="rounded-[28px] border border-white/55 bg-white/70 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-neutral-900">Add Patient</p>
                          <p className="text-[11px] text-neutral-500">Create a new record in the ASHA queue</p>
                        </div>
                      </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={patientForm.name}
                        onChange={e => handlePatientFormChange("name", e.target.value)}
                        placeholder="Patient name"
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-amber-300"
                      />
                      <input
                        value={patientForm.age}
                        onChange={e => handlePatientFormChange("age", e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                        placeholder="Age"
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-amber-300"
                      />
                      <select
                        value={patientForm.gender}
                        onChange={e => handlePatientFormChange("gender", e.target.value)}
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-amber-300"
                      >
                        {[
                          { value: "female", label: "Female" },
                          { value: "male", label: "Male" },
                          { value: "other", label: "Other" },
                        ].map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={patientForm.village}
                        onChange={e => handlePatientFormChange("village", e.target.value)}
                        placeholder="Village"
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-amber-300"
                      />
                      <select
                        value={patientForm.district}
                        onChange={e => handlePatientFormChange("district", e.target.value)}
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-amber-300"
                      >
                        {districts.map(option => <option key={option}>{option}</option>)}
                      </select>
                      <select
                        value={patientForm.priority}
                        onChange={e => handlePatientFormChange("priority", e.target.value)}
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-amber-300"
                      >
                        {[1, 2, 3].map(option => <option key={option} value={option}>Priority {option}</option>)}
                      </select>
                      <textarea
                        value={patientForm.notes}
                        onChange={e => handlePatientFormChange("notes", e.target.value)}
                        placeholder="Notes for the queue"
                        rows={3}
                        className="sm:col-span-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-amber-300"
                      />
                      <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPatientForm(false)}
                          className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={createPatient}
                          disabled={creatingPatient}
                          className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {creatingPatient ? "Creating..." : "Create Patient"}
                        </button>
                      </div>
                    </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
            {/* Empty state */}
            <AnimatePresence>
              {!hasMessages && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                className="glass-liquid mx-auto flex w-full max-w-3xl flex-col items-center justify-center rounded-[32px] border border-white/60 px-6 py-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:px-10 sm:py-14">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500/10 to-teal-500/10 shadow-inner">
                    <span className="text-3xl">{tab === "asha" ? "\uD83D\uDC69\u200D\u2695\uFE0F" : "\uD83E\uDE7A"}</span>
                  </div>
                  <h2 className="mb-2 text-lg font-semibold text-neutral-900">
                    {tab === "asha" ? "ASHA Worker Console" : "How can I help you today?"}
                  </h2>
                  <p className="mb-8 max-w-xl text-sm leading-6 text-neutral-500">
                    {tab === "asha"
                      ? "Enter patient field observations in any Indian language for AI-assisted triage"
                      : "Describe your symptoms in any language - Hindi, Tamil, Gujarati, English, and 18+ more"}
                  </p>
                  <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                    {QUICK_PROMPTS[tab].map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(prompt)}
                        className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/70 hover:text-brand-700">
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
                const symptom = msg.symptomResult;
                const structuredSymptoms = symptom?.structured_symptoms;
                const asha = msg.asha;
                const documentation = asha?.documentation;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex gap-2 sm:gap-3 ${isUser ? "justify-end" : "justify-start"}`}>

                    {/* Bot avatar */}
                    {!isUser && (
                      <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${agent?.color || "from-brand-500 to-teal-500"
                        } text-[9px] font-bold text-white shadow-sm`}>
                        {agent?.icon || "M+"}
                      </div>
                    )}

                    <div className="max-w-[90%] sm:max-w-[82%] lg:max-w-[76%]">
                      {/* Crisis banner */}
                      {msg.crisis && (
                        <div className="mb-2 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 pulse-danger">
                          <span className="text-sm text-red-500">🚨</span>
                          <span className="text-xs font-semibold text-red-400">CRISIS DETECTED - emergency resources included below</span>
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
                      <div className={`rounded-2xl px-3 py-3 text-sm leading-relaxed sm:px-4 ${isUser
                          ? "glass-liquid-accent rounded-tr-none border border-white/60 text-neutral-950"
                          : "glass-liquid rounded-tl-none border border-white/50 text-neutral-950"
                        }`}>
                        {/* Attached file previews */}
                        {msg.files?.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {msg.files.map((f, i) =>
                              f.type === "image" && f.url ? (
                                <img key={i} src={f.url} alt={f.name} className="max-h-40 rounded-lg border border-white/30 object-cover" />
                              ) : (
                                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-neutral-200/50 bg-white/30 px-2.5 py-1.5 text-xs font-medium text-neutral-700">
                                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                  </svg>
                                  {f.name}
                                </div>
                              )
                            )}
                          </div>
                        )}
                        {visibleText && (
                          <p className="whitespace-pre-wrap">{visibleText}</p>
                        )}

                        {symptom && (
                          <div className="mt-3 space-y-2 border-t border-neutral-200/40 pt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                              Symptom Insights
                            </p>

                            {structuredSymptoms?.primary_symptoms?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {structuredSymptoms.primary_symptoms.map(item => (
                                  <span key={item} className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="grid gap-2 sm:grid-cols-2">
                              {structuredSymptoms?.duration && structuredSymptoms.duration !== "unknown" && (
                                <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                  <span className="font-semibold text-neutral-700">Duration:</span>{" "}
                                  <span className="text-neutral-600">{structuredSymptoms.duration}</span>
                                </div>
                              )}
                              {structuredSymptoms?.severity && structuredSymptoms.severity !== "unknown" && (
                                <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                  <span className="font-semibold text-neutral-700">Severity:</span>{" "}
                                  <span className="text-neutral-600">{formatLabel(structuredSymptoms.severity)}</span>
                                </div>
                              )}
                              {symptom?.confidence_summary && (
                                <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                  <span className="font-semibold text-neutral-700">Confidence:</span>{" "}
                                  <span className="text-neutral-600">{formatLabel(symptom.confidence_summary)}</span>
                                </div>
                              )}
                              {symptom?.recommended_specialty && (
                                <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                  <span className="font-semibold text-neutral-700">Suggested Specialty:</span>{" "}
                                  <span className="text-neutral-600">{symptom.recommended_specialty}</span>
                                </div>
                              )}
                            </div>

                      {asha && (
                        <div className="mt-3 space-y-2 border-t border-neutral-200/40 pt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                            ASHA Guidance
                          </p>

                          <div className="grid gap-2 sm:grid-cols-2">
                            {asha?.triage_decision && (
                              <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                <span className="font-semibold text-neutral-700">Decision:</span>{" "}
                                <span className="text-neutral-600">{formatLabel(asha.triage_decision)}</span>
                              </div>
                            )}
                            {asha?.refer_to && (
                              <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                <span className="font-semibold text-neutral-700">Refer To:</span>{" "}
                                <span className="text-neutral-600">{asha.refer_to}</span>
                              </div>
                            )}
                            {asha?.refer_specialty && (
                              <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                <span className="font-semibold text-neutral-700">Specialty:</span>{" "}
                                <span className="text-neutral-600">{asha.refer_specialty}</span>
                              </div>
                            )}
                            {asha?.urgency_hours && (
                              <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                <span className="font-semibold text-neutral-700">Urgency:</span>{" "}
                                <span className="text-neutral-600">Within {asha.urgency_hours} hours</span>
                              </div>
                            )}
                          </div>

                          {asha?.danger_signs?.length > 0 && (
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                Danger Signs
                              </p>
                              <div className="space-y-1">
                                {asha.danger_signs.slice(0, 4).map(sign => (
                                  <div key={sign} className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
                                    {sign}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {asha?.home_care_steps?.length > 0 && (
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                Home Care Steps
                              </p>
                              <div className="space-y-1">
                                {asha.home_care_steps.slice(0, 3).map(step => (
                                  <div key={step} className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                                    {step}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {documentation && (
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                Documentation
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {documentation?.chief_complaint && (
                                  <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                    <span className="font-semibold text-neutral-700">Complaint:</span>{" "}
                                    <span className="text-neutral-600">{documentation.chief_complaint}</span>
                                  </div>
                                )}
                                {documentation?.duration && (
                                  <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                    <span className="font-semibold text-neutral-700">Duration:</span>{" "}
                                    <span className="text-neutral-600">{documentation.duration}</span>
                                  </div>
                                )}
                                {documentation?.key_vitals_noted && (
                                  <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                    <span className="font-semibold text-neutral-700">Vitals:</span>{" "}
                                    <span className="text-neutral-600">{documentation.key_vitals_noted}</span>
                                  </div>
                                )}
                                {documentation?.action_taken && (
                                  <div className="rounded-lg bg-white/50 px-3 py-2 text-[11px]">
                                    <span className="font-semibold text-neutral-700">Action:</span>{" "}
                                    <span className="text-neutral-600">{documentation.action_taken}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {asha?.asha_script && (
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                Suggested Script
                              </p>
                              <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                                {asha.asha_script}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {structuredSymptoms?.risk_factors?.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-neutral-200/40 pt-3 dark:border-neutral-700/40">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                            Risk Factors
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {structuredSymptoms.risk_factors.map(item => (
                              <span key={item} className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {symptom?.follow_up_questions?.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-neutral-200/40 pt-3 dark:border-neutral-700/40">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                            Follow-up Questions
                          </p>
                          <div className="space-y-1">
                            {symptom.follow_up_questions.slice(0, 3).map(question => (
                              <div key={question} className="rounded-lg bg-white/50 px-3 py-2 text-[11px] text-neutral-700">
                                {question}
                              </div>
                            ))}
                          </div>
                        </div>
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
                                href={mapsUrl || '#'}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open ${d.name || 'doctor location'} in Google Maps`}
                                onClick={event => {
                                  if (!mapsUrl) event.preventDefault();
                                }}
                                className="glass-liquid flex flex-col gap-2 rounded-lg border border-white/45 px-3 py-2 transition hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-400/40 sm:flex-row sm:items-center sm:gap-2.5"
                              >
                                <div className="flex w-full items-start gap-2.5 sm:w-auto sm:items-center">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 text-[9px] font-bold text-white">
                                    {(d.name || 'D')[0]}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold text-neutral-900">{d.name}</p>
                                    <p className="text-[10px] text-neutral-500">
                                      {d.specialty}{d.distance_km != null ? ` · ${d.distance_km} km away` : ''}
                                    </p>
                                    {d.address && <p className="truncate text-[10px] text-neutral-400">{d.address}</p>}
                                  </div>
                                </div>
                                <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
                                  <div className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-brand-600 dark:text-brand-400">
                                    {d.phone && <><PhoneIcon />{d.phone}</>}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-brand-600 dark:text-brand-400">
                                    <span>Map</span>
                                    <ArrowUpRightIcon />
                                  </div>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      )}
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

      <div className="border-t border-white/35 bg-white/30 backdrop-blur-xl">
        {/* Input Bar */}
        <ChatInput
          models={MODELS}
          hasMessages={hasMessages}
          placeholder={tab === "asha" ? ashaPlaceholder : "Describe symptoms in any language..."}
          onSend={handleSend}
          onTranscribe={transcribeAudio}
          disabled={loading || ashaInputDisabled}
        />

        {/* Footer info */}
        <div className="px-3 py-2 sm:px-4 sm:py-2">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 border-t border-white/45 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-neutral-500">{agentCount} agents online</span>
            </div>
            <p className="text-[10px] text-neutral-500 sm:text-right">
              Always consult a doctor before acting on this information - Emergency: 112
            </p>
          </div>
        </div>
        {locationHint && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <div className="mx-auto max-w-5xl">
              {locationHint}
            </div>
          </div>
        )}
    </div>
    </div>
    </div>
  );
}

