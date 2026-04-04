import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");
      localStorage.setItem("medmas_token", data.access_token);
      localStorage.setItem("medmas_user", JSON.stringify(data.user));
      navigate("/chat");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
              <h2>Welcome back</h2>
              <p>Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {error && <div className="auth-error">{error}</div>}

              <div className="auth-field">
                <label>Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="auth-field">
                <label>Password</label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" disabled={loading} className="auth-submit">
                {loading ? (
                  <span className="auth-spinner" />
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p className="auth-switch">
              Don't have an account?{" "}
              <Link to="/signup">Create one</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
