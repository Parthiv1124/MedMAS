import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DISTRICTS = [
  "Vadodara", "Surat", "Rajkot", "Bharuch", "Ahmedabad", "Mumbai", "Delhi",
];
const RESEND_COOLDOWN = 60;

/* ── helpers ──────────────────────────────────────────────────────────── */
function normalizePhone(raw) { return raw.replace(/^\+91/, "").replace(/^0/, "").replace(/\D/g, ""); }

function passwordStrengthIssues(pwd) {
  const issues = [];
  if (pwd.length < 8)            issues.push("8+ characters");
  if (!/[A-Z]/.test(pwd))        issues.push("uppercase");
  if (!/[a-z]/.test(pwd))        issues.push("lowercase");
  if (!/[0-9]/.test(pwd))        issues.push("number");
  if (!/[^A-Za-z0-9]/.test(pwd)) issues.push("special char");
  return issues;
}

function strengthLevel(pwd) {
  if (!pwd) return 0;
  let s = 0;
  if (pwd.length >= 8)                         s++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd))                       s++;
  if (/[^A-Za-z0-9]/.test(pwd))               s++;
  return s;
}

const STR_LABEL = ["", "Weak", "Fair", "Good", "Strong"];
const STR_COLOR = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400"];
const STR_TEXT  = ["", "text-red-400", "text-orange-400", "text-yellow-400", "text-emerald-400"];

/* ── icons ────────────────────────────────────────────────────────────── */
const IconCheck = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

/* ── component ────────────────────────────────────────────────────────── */
export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", district: "Vadodara", password: "", confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  /* OTP */
  const [otpStep, setOtpStep]         = useState("idle");
  const [otp, setOtp]                 = useState("");
  const [otpError, setOtpError]       = useState("");
  const [devOtp, setDevOtp]           = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  function startResendTimer() {
    setResendTimer(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setResendTimer(p => { if (p <= 1) { clearInterval(timerRef.current); return 0; } return p - 1; });
    }, 1000);
  }

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors(prev => ({ ...prev, [field]: "" }));
    if (field === "phone") { setOtpStep("idle"); setOtp(""); setOtpError(""); setDevOtp(""); clearInterval(timerRef.current); setResendTimer(0); }
  }

  function validatePhone(raw) {
    const d = normalizePhone(raw);
    if (d.length !== 10) return "Must be 10 digits";
    if (!/^[6-9]/.test(d)) return "Must start with 6-9";
    return "";
  }

  async function handleSendOtp() {
    const err = validatePhone(form.phone);
    if (err) { setFieldErrors(p => ({ ...p, phone: err })); return; }
    setOtpStep("sending"); setOtpError(""); setDevOtp("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+91${normalizePhone(form.phone)}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to send OTP");
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setOtpStep("sent"); startResendTimer();
    } catch (e) { setOtpError(e.message); setOtpStep("idle"); }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) { setOtpError("Enter 6-digit code"); return; }
    setOtpStep("verifying"); setOtpError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+91${normalizePhone(form.phone)}`, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Verification failed");
      setOtpStep("verified");
    } catch (e) { setOtpError(e.message); setOtpStep("sent"); }
  }

  function validate() {
    const errs = {};
    if (otpStep !== "verified") errs.phone = "Verify your phone";
    const pwdIssues = passwordStrengthIssues(form.password);
    if (pwdIssues.length) errs.password = `Needs: ${pwdIssues.join(", ")}`;
    if (form.password !== form.confirmPassword) errs.confirmPassword = "Passwords don't match";
    setFieldErrors(errs);
    return !Object.keys(errs).length;
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError("");
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, phone: `+91${normalizePhone(form.phone)}`, district: form.district, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Signup failed");
      localStorage.setItem("medmas_token", data.access_token);
      localStorage.setItem("medmas_user", JSON.stringify(data.user));
      navigate("/");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const pwdLevel = strengthLevel(form.password);
  const inputCls = (field) =>
    `w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:bg-white/10 input-glow transition-all ${
      fieldErrors[field] ? "border-red-500/50 focus:border-red-400" : "border-white/10 focus:border-brand-500/50"
    }`;

  return (
    <div className="min-h-screen bg-auth flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute top-10 right-10 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl animate-float-delay" />

      <div className="w-full max-w-md relative z-10 animate-scale-in">
        {/* Logo */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-teal-500 text-white text-2xl font-bold shadow-lg shadow-brand-500/25 mb-5">
            M+
          </div>
          <h1 className="text-3xl font-bold text-white">Create your account</h1>
          <p className="text-sm text-slate-400 mt-2">Join MedMAS — AI-powered health for rural India</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-dark rounded-2xl p-7 space-y-4 animate-slide-up">
          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm rounded-xl px-4 py-3 border border-red-500/20 animate-slide-up">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">Full Name</label>
            <input type="text" required value={form.name} onChange={e => update("name", e.target.value)} placeholder="Your full name" className={inputCls("name")} />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">Email</label>
            <input type="email" required value={form.email} onChange={e => update("email", e.target.value)} placeholder="you@example.com" className={inputCls("email")} />
          </div>

          {/* Phone + OTP */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">Phone Number</label>
            <div className="flex gap-2">
              <div className="flex flex-1">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-white/10 bg-white/5 text-sm text-slate-400 select-none font-mono">+91</span>
                <input
                  type="tel" required value={form.phone}
                  onChange={e => { update("phone", e.target.value.replace(/\D/g, "").slice(0, 10)); }}
                  onBlur={() => setFieldErrors(p => ({ ...p, phone: validatePhone(form.phone) }))}
                  placeholder="9876543210" maxLength={10}
                  disabled={otpStep === "verified"}
                  className={`flex-1 bg-white/5 border border-white/10 rounded-r-xl px-4 py-3 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:bg-white/10 input-glow transition-all ${
                    otpStep === "verified" ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-300" :
                    fieldErrors.phone ? "border-red-500/50" : "focus:border-brand-500/50"
                  }`}
                />
              </div>

              {otpStep !== "verified" ? (
                <button type="button" onClick={handleSendOtp}
                  disabled={otpStep === "sending" || resendTimer > 0 || form.phone.length !== 10}
                  className="shrink-0 text-xs px-3.5 py-2 rounded-xl border border-brand-500/30 text-brand-400 font-semibold hover:bg-brand-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {otpStep === "sending" ? "Sending..." : resendTimer > 0 ? `${resendTimer}s` : otpStep === "sent" ? "Resend" : "Send OTP"}
                </button>
              ) : (
                <span className="shrink-0 flex items-center gap-1.5 text-sm text-emerald-400 font-semibold px-2">
                  <IconCheck /> Verified
                </span>
              )}
            </div>

            {devOtp && <p className="text-orange-400/80 text-xs mt-1.5 font-mono">[Dev] OTP: {devOtp}</p>}
            {fieldErrors.phone && <p className="text-red-400 text-xs mt-1">{fieldErrors.phone}</p>}
            {otpStep === "sent" && !fieldErrors.phone && <p className="text-brand-400 text-xs mt-1">OTP sent to +91 {form.phone}</p>}

            {/* OTP input */}
            {(otpStep === "sent" || otpStep === "verifying") && (
              <div className="mt-3 flex gap-2 animate-slide-up">
                <input type="text" inputMode="numeric" maxLength={6} value={otp}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(""); }}
                  placeholder="6-digit OTP"
                  className={`flex-1 bg-white/5 border rounded-xl px-4 py-3 text-sm font-mono tracking-[0.3em] text-center text-white placeholder-slate-500 focus:outline-none focus:bg-white/10 input-glow transition-all ${
                    otpError ? "border-red-500/50" : "border-white/10 focus:border-brand-500/50"
                  }`}
                />
                <button type="button" onClick={handleVerifyOtp} disabled={otp.length !== 6 || otpStep === "verifying"}
                  className="shrink-0 text-xs px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-teal-500 text-white font-semibold disabled:opacity-30 transition-all"
                >
                  {otpStep === "verifying" ? "..." : "Verify"}
                </button>
              </div>
            )}
            {otpError && <p className="text-red-400 text-xs mt-1">{otpError}</p>}
          </div>

          {/* District */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">District</label>
            <select value={form.district} onChange={e => update("district", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500/50 focus:bg-white/10 input-glow transition-all appearance-none">
              {DISTRICTS.map(d => <option key={d} value={d} className="bg-slate-800">{d}</option>)}
            </select>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">Password</label>
            <input type="password" required value={form.password} onChange={e => update("password", e.target.value)} placeholder="Create a strong password" className={inputCls("password")} />
            {form.password && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-1">
                  {[1,2,3,4].map(n => (
                    <div key={n} className={`h-1 flex-1 rounded-full transition-all duration-300 ${n <= pwdLevel ? STR_COLOR[pwdLevel] : "bg-white/10"}`} />
                  ))}
                </div>
                <p className={`text-xs font-medium ${STR_TEXT[pwdLevel]}`}>{STR_LABEL[pwdLevel]}</p>
              </div>
            )}
            {fieldErrors.password && <p className="text-red-400 text-xs mt-1">{fieldErrors.password}</p>}
            {!fieldErrors.password && !form.password && <p className="text-slate-500 text-xs mt-1">8+ chars, upper, lower, number, special</p>}
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">Confirm Password</label>
            <input type="password" required value={form.confirmPassword} onChange={e => update("confirmPassword", e.target.value)} placeholder="Re-enter password" className={inputCls("confirmPassword")} />
            {fieldErrors.confirmPassword && <p className="text-red-400 text-xs mt-1">{fieldErrors.confirmPassword}</p>}
          </div>

          <button type="submit" disabled={loading || otpStep !== "verified"}
            className="w-full bg-gradient-to-r from-brand-600 to-teal-500 text-white py-3 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-brand-500/25 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="flex gap-1">
                <div className="agent-dot bg-white" style={{ animationDelay: "0ms" }} />
                <div className="agent-dot bg-white" style={{ animationDelay: "200ms" }} />
                <div className="agent-dot bg-white" style={{ animationDelay: "400ms" }} />
              </div>
            ) : "Create account"}
          </button>

          {otpStep !== "verified" && (
            <p className="text-center text-xs text-slate-500">Verify your phone to enable sign up</p>
          )}
        </form>

        <p className="text-center text-sm text-slate-500 mt-7">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-400 font-semibold hover:text-brand-300 transition-colors">Sign in</Link>
        </p>

        <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
          {["6 AI Agents", "22+ Languages", "OTP Verified"].map(tag => (
            <span key={tag} className="text-[10px] text-slate-500 border border-slate-700 rounded-full px-2.5 py-0.5">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
