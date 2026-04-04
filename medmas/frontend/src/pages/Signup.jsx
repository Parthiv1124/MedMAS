import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const DISTRICTS = ["Vadodara", "Surat", "Rajkot", "Bharuch", "Ahmedabad", "Mumbai", "Delhi"];
const RESEND_COOLDOWN = 60;

function normalizePhone(raw) {
  return raw.replace(/^\+91/, "").replace(/^0/, "").replace(/\D/g, "");
}

function passwordStrengthIssues(pwd) {
  const issues = [];
  if (pwd.length < 8) issues.push("8+ characters");
  if (!/[A-Z]/.test(pwd)) issues.push("uppercase");
  if (!/[a-z]/.test(pwd)) issues.push("lowercase");
  if (!/[0-9]/.test(pwd)) issues.push("number");
  if (!/[^A-Za-z0-9]/.test(pwd)) issues.push("special char");
  return issues;
}

function strengthLevel(pwd) {
  if (!pwd) return 0;
  let s = 0;
  if (pwd.length >= 8) s++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return s;
}

const STR_LABEL = ["", "Weak", "Fair", "Good", "Strong"];

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", district: "Vadodara", password: "", confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [otpStep, setOtpStep] = useState("idle");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  function startResendTimer() {
    setResendTimer(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setResendTimer((p) => {
        if (p <= 1) { clearInterval(timerRef.current); return 0; }
        return p - 1;
      });
    }, 1000);
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    if (field === "phone") {
      setOtpStep("idle"); setOtp(""); setOtpError(""); setDevOtp("");
      clearInterval(timerRef.current); setResendTimer(0);
    }
  }

  function validatePhone(raw) {
    const d = normalizePhone(raw);
    if (d.length !== 10) return "Must be 10 digits";
    if (!/^[6-9]/.test(d)) return "Must start with 6-9";
    return "";
  }

  async function handleSendOtp() {
    const err = validatePhone(form.phone);
    if (err) { setFieldErrors((p) => ({ ...p, phone: err })); return; }
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
        body: JSON.stringify({
          name: form.name, email: form.email,
          phone: `+91${normalizePhone(form.phone)}`,
          district: form.district, password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Signup failed");
      localStorage.setItem("medmas_token", data.access_token);
      localStorage.setItem("medmas_user", JSON.stringify(data.user));
      navigate("/chat");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const pwdLevel = strengthLevel(form.password);

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Left - branding */}
        <div className="auth-brand">
          <div className="auth-brand-inner">
            <div className="auth-logo-mark">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M4 16h6l3-8 4 16 3-8h8" stroke="#e4e4e7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="auth-brand-name">MedMAS</h1>
            <p className="auth-brand-tag">Multi-Agent AI Health System</p>

            <div className="auth-brand-features">
              <div className="auth-feature">
                <span className="auth-feature-dot" />
                <span>6 specialist AI agents</span>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-dot" />
                <span>22+ Indian languages</span>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-dot" />
                <span>Built for rural India</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right - form */}
        <div className="auth-form-side">
          <div className="auth-form-wrap">
            <div className="auth-form-header">
              <h2>Create your account</h2>
              <p>Join MedMAS — AI-powered health for rural India</p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {error && <div className="auth-error">{error}</div>}

              {/* Name */}
              <div className="auth-field">
                <label>Full Name</label>
                <input
                  type="text" required value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Your full name"
                />
              </div>

              {/* Email */}
              <div className="auth-field">
                <label>Email</label>
                <input
                  type="email" required value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              {/* Phone + OTP */}
              <div className="auth-field">
                <label>Phone Number</label>
                <div className="auth-phone-row">
                  <div className="auth-phone-input">
                    <span className="auth-phone-prefix">+91</span>
                    <input
                      type="tel" required value={form.phone}
                      onChange={(e) => update("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                      onBlur={() => setFieldErrors((p) => ({ ...p, phone: validatePhone(form.phone) }))}
                      placeholder="9876543210" maxLength={10}
                      disabled={otpStep === "verified"}
                      className={otpStep === "verified" ? "verified" : ""}
                    />
                  </div>
                  {otpStep !== "verified" ? (
                    <button
                      type="button" onClick={handleSendOtp}
                      disabled={otpStep === "sending" || resendTimer > 0 || form.phone.length !== 10}
                      className="auth-otp-btn"
                    >
                      {otpStep === "sending" ? "..." : resendTimer > 0 ? `${resendTimer}s` : otpStep === "sent" ? "Resend" : "Send OTP"}
                    </button>
                  ) : (
                    <span className="auth-verified-badge">Verified</span>
                  )}
                </div>

                {devOtp && <p className="auth-hint warn">Dev OTP: {devOtp}</p>}
                {fieldErrors.phone && <p className="auth-hint error">{fieldErrors.phone}</p>}
                {otpStep === "sent" && !fieldErrors.phone && <p className="auth-hint">OTP sent to +91 {form.phone}</p>}

                {(otpStep === "sent" || otpStep === "verifying") && (
                  <div className="auth-otp-row">
                    <input
                      type="text" inputMode="numeric" maxLength={6} value={otp}
                      onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(""); }}
                      placeholder="6-digit OTP"
                      className="auth-otp-input"
                    />
                    <button
                      type="button" onClick={handleVerifyOtp}
                      disabled={otp.length !== 6 || otpStep === "verifying"}
                      className="auth-submit small"
                    >
                      {otpStep === "verifying" ? "..." : "Verify"}
                    </button>
                  </div>
                )}
                {otpError && <p className="auth-hint error">{otpError}</p>}
              </div>

              {/* District */}
              <div className="auth-field">
                <label>District</label>
                <select value={form.district} onChange={(e) => update("district", e.target.value)}>
                  {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Password */}
              <div className="auth-field">
                <label>Password</label>
                <input
                  type="password" required value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                />
                {form.password && (
                  <div className="auth-strength">
                    <div className="auth-strength-bar">
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className={`auth-strength-seg ${n <= pwdLevel ? `level-${pwdLevel}` : ""}`} />
                      ))}
                    </div>
                    <span className={`auth-strength-label level-${pwdLevel}`}>{STR_LABEL[pwdLevel]}</span>
                  </div>
                )}
                {fieldErrors.password && <p className="auth-hint error">{fieldErrors.password}</p>}
              </div>

              {/* Confirm */}
              <div className="auth-field">
                <label>Confirm Password</label>
                <input
                  type="password" required value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
                {fieldErrors.confirmPassword && <p className="auth-hint error">{fieldErrors.confirmPassword}</p>}
              </div>

              <button type="submit" disabled={loading || otpStep !== "verified"} className="auth-submit">
                {loading ? <span className="auth-spinner" /> : "Create account"}
              </button>

              {otpStep !== "verified" && (
                <p className="auth-hint" style={{ textAlign: "center" }}>Verify your phone to enable sign up</p>
              )}
            </form>

            <p className="auth-switch">
              Already have an account?{" "}
              <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
