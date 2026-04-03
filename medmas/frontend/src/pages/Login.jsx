import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ── tiny SVG icons ──────────────────────────────────────────────────── */
const IconMail = () => (
  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);
const IconLock = () => (
  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);
const IconArrow = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ email: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
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
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-auth flex items-center justify-center px-4 relative overflow-hidden">
      {/* Floating orbs */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-float-delay" />

      <div className="w-full max-w-md relative z-10 animate-scale-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-teal-500 text-white text-2xl font-bold shadow-lg shadow-brand-500/25 mb-5">
            M+
          </div>
          <h1 className="text-3xl font-bold text-white">Welcome back</h1>
          <p className="text-sm text-slate-400 mt-2">
            Sign in to your MedMAS health dashboard
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="glass-dark rounded-2xl p-7 space-y-5 animate-slide-up"
        >
          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm rounded-xl px-4 py-3 border border-red-500/20 flex items-center gap-2 animate-slide-up">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">
              Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <IconMail />
              </div>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => update("email", e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/50 focus:bg-white/10 input-glow transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <IconLock />
              </div>
              <input
                type="password"
                required
                value={form.password}
                onChange={e => update("password", e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/50 focus:bg-white/10 input-glow transition-all"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-brand-600 to-teal-500 text-white py-3 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-brand-500/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <div className="flex gap-1">
                <div className="agent-dot bg-white" style={{ animationDelay: "0ms" }} />
                <div className="agent-dot bg-white" style={{ animationDelay: "200ms" }} />
                <div className="agent-dot bg-white" style={{ animationDelay: "400ms" }} />
              </div>
            ) : (
              <>
                Sign in
                <span className="group-hover:translate-x-1 transition-transform"><IconArrow /></span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-7">
          Don't have an account?{" "}
          <Link to="/signup" className="text-brand-400 font-semibold hover:text-brand-300 transition-colors">
            Create one
          </Link>
        </p>

        {/* Feature badges */}
        <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
          {["6 AI Agents", "22+ Languages", "Rural India"].map(tag => (
            <span key={tag} className="text-[10px] text-slate-500 border border-slate-700 rounded-full px-2.5 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
