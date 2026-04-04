import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const DISTRICTS = ["Vadodara", "Surat", "Rajkot", "Bharuch", "Ahmedabad", "Mumbai", "Delhi"];
const SPECIALTIES = [
  "General", "Cardiology", "Dermatology", "ENT", "Gastroenterology",
  "Gynecology", "Neurology", "Ophthalmology", "Orthopedics",
  "Pediatrics", "Psychiatry", "Pulmonology", "Urology",
];

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

export default function DoctorSignup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", district: "Vadodara",
    specialty: "General", license_number: "", bio: "",
    password: "", confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    if (!form.phone.trim() || form.phone.length !== 10) errs.phone = "10-digit phone required";
    const pwdIssues = passwordStrengthIssues(form.password);
    if (pwdIssues.length) errs.password = `Needs: ${pwdIssues.join(", ")}`;
    if (form.password !== form.confirmPassword) errs.confirmPassword = "Passwords don't match";
    setFieldErrors(errs);
    return !Object.keys(errs).length;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/doctor/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: `+91${form.phone.replace(/\D/g, "")}`,
          password: form.password,
          specialty: form.specialty,
          license_number: form.license_number,
          district: form.district,
          bio: form.bio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Signup failed");
      localStorage.setItem("medmas_token", data.access_token);
      localStorage.setItem("medmas_user", JSON.stringify({ ...data.user, role: "doctor" }));
      localStorage.setItem("medmas_doctor", JSON.stringify(data.doctor));
      navigate("/doctor/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
            <p className="auth-brand-tag">Doctor Portal</p>
            <div className="auth-brand-features">
              <div className="auth-feature">
                <span className="auth-feature-dot" />
                <span>AI-assisted case summaries</span>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-dot" />
                <span>Structured prescriptions</span>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-dot" />
                <span>Patient consent management</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right - form */}
        <div className="auth-form-side">
          <div className="auth-form-wrap">
            <div className="auth-form-header">
              <h2>Doctor Registration</h2>
              <p>Join MedMAS as a healthcare provider</p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {error && <div className="auth-error">{error}</div>}

              <div className="auth-field">
                <label>Full Name</label>
                <input type="text" required value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Dr. Full Name" />
                {fieldErrors.name && <p className="auth-hint error">{fieldErrors.name}</p>}
              </div>

              <div className="auth-field">
                <label>Email</label>
                <input type="email" required value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="doctor@example.com" autoComplete="email" />
                {fieldErrors.email && <p className="auth-hint error">{fieldErrors.email}</p>}
              </div>

              <div className="auth-field">
                <label>Phone Number</label>
                <div className="auth-phone-row">
                  <div className="auth-phone-input">
                    <span className="auth-phone-prefix">+91</span>
                    <input type="tel" required value={form.phone}
                      onChange={(e) => update("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="9876543210" maxLength={10} />
                  </div>
                </div>
                {fieldErrors.phone && <p className="auth-hint error">{fieldErrors.phone}</p>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="auth-field">
                  <label>Specialty</label>
                  <select value={form.specialty} onChange={(e) => update("specialty", e.target.value)}>
                    {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="auth-field">
                  <label>District</label>
                  <select value={form.district} onChange={(e) => update("district", e.target.value)}>
                    {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="auth-field">
                <label>License / Registration Number <span style={{ opacity: 0.5 }}>(optional)</span></label>
                <input type="text" value={form.license_number}
                  onChange={(e) => update("license_number", e.target.value)}
                  placeholder="e.g. MCI-12345" />
              </div>

              <div className="auth-field">
                <label>Short Bio <span style={{ opacity: 0.5 }}>(optional)</span></label>
                <input type="text" value={form.bio}
                  onChange={(e) => update("bio", e.target.value)}
                  placeholder="Years of experience, hospital, etc." />
              </div>

              <div className="auth-field">
                <label>Password</label>
                <input type="password" required value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Create a strong password" autoComplete="new-password" />
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

              <div className="auth-field">
                <label>Confirm Password</label>
                <input type="password" required value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Re-enter password" autoComplete="new-password" />
                {fieldErrors.confirmPassword && <p className="auth-hint error">{fieldErrors.confirmPassword}</p>}
              </div>

              <button type="submit" disabled={loading} className="auth-submit">
                {loading ? <span className="auth-spinner" /> : "Register as Doctor"}
              </button>
            </form>

            <p className="auth-switch">
              Already registered? <Link to="/doctor/login">Sign in</Link>
            </p>
            <p className="auth-switch" style={{ marginTop: "4px" }}>
              Are you a patient? <Link to="/signup">Patient signup</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
