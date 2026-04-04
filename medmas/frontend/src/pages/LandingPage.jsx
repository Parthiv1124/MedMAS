import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/* ═══════════════════════════════════════════════════════════════════════
   MedMAS — Landing Page
   Liquid-glass dark theme · Apple/Microsoft-inspired glassmorphism
   ═══════════════════════════════════════════════════════════════════════ */

// ── Animated Counter Hook ─────────────────────────────────────────────
function useCounter(target, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(!startOnView);
  const ref = useRef(null);

  const start = useCallback(() => setStarted(true), []);

  useEffect(() => {
    if (!startOnView || !ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { start(); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [start, startOnView]);

  useEffect(() => {
    if (!started) return;
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(ease * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, target, duration]);

  return { count, ref };
}

// ── Intersection Observer fade-in hook ────────────────────────────────
function useFadeIn() {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll(".fade-section");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("fade-visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ── SVG Icons ─────────────────────────────────────────────────────────
const PulseIcon = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
    <path d="M4 16h6l3-8 4 16 3-8h8" stroke="#a1a1aa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// ── Data ──────────────────────────────────────────────────────────────
const NAV_LINKS = ["Features", "Agents", "ASHA", "Research", "Demo"];

const PROBLEMS = [
  { icon: "🏥", text: "Rural Access Gap" },
  { icon: "🫀", text: "Undetected NCDs" },
  { icon: "🧠", text: "Mental Health Neglect" },
  { icon: "🌐", text: "Language Barrier" },
  { icon: "💊", text: "Preventive Care Failure" },
  { icon: "👩‍⚕️", text: "ASHA Worker Overload" },
];

const AGENTS = [
  { emoji: "🩺", name: "Symptom Checker", desc: "Rural triage, top-3 differential diagnosis with validated medical reasoning", color: "#71717a" },
  { emoji: "🧪", name: "Disease Predictor", desc: "Lab PDF analysis, NCD risk scoring using ICMR guidelines", color: "#71717a" },
  { emoji: "💬", name: "Empathy Chatbot", desc: "Mental health support, crisis detection & helpline routing", color: "#71717a" },
  { emoji: "📊", name: "Health Scorer", desc: "Preventive wellness scoring & lifestyle recommendations", color: "#71717a" },
  { emoji: "🌐", name: "Multilingual Agent", desc: "22+ Indian languages via Bhashini & IndicBERT translation", color: "#71717a" },
  { emoji: "🏥", name: "ASHA Copilot", desc: "Field triage for community health workers, referral guidance & auto-docs", color: "#71717a" },
];

const ASHA_FEATURES = [
  { icon: "📋", title: "Field Triage Decisions", desc: "Urgent / Routine / Monitor-at-Home" },
  { icon: "🏥", title: "Referral Routing", desc: "PHC → CHC → District Hospital → Specialist" },
  { icon: "📝", title: "Auto-Documentation", desc: "Structured field notes generated instantly" },
  { icon: "🗣️", title: "Patient Script", desc: "Plain-language script the worker speaks aloud" },
];

const ASHA_FLOW = [
  "Field Observation",
  "ASHA Copilot",
  "Triage Decision",
  "Referral Guidance",
  "Documentation Saved",
  "Patient Queue Updated",
];

const COMPARISON = [
  { feature: "Specialization", single: "Generic responses", medmas: "6 domain-expert agents" },
  { feature: "Accuracy", single: "20–40% standalone NLP", medmas: "87–91% MAS accuracy" },
  { feature: "Languages", single: "English only", medmas: "22+ Indian languages" },
  { feature: "Crisis Detection", single: "None", medmas: "Real-time with escalation" },
  { feature: "Field Workers", single: "Not supported", medmas: "ASHA Copilot built-in" },
  { feature: "Human-in-Loop", single: "Optional", medmas: "Mandatory by design" },
];

const TECH_STACK = ["LangGraph", "FastAPI", "GPT-4o Mini", "FAISS", "Supabase", "Bhashini", "IndicBERT", "React"];

const STEPS = [
  { num: "01", title: "Input in Any Language", desc: "Worker or patient sends a message in Hindi, Tamil, Gujarati, or 19+ other languages", icon: "🗣️" },
  { num: "02", title: "Orchestrator Routes", desc: "LangGraph orchestrator classifies intent and routes to specialist agents in parallel", icon: "⚡" },
  { num: "03", title: "Structured Output", desc: "Referral guidance, triage decision, doctor finder, documentation — all delivered instantly", icon: "📋" },
];

// ═══════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  const navigate = useNavigate();
  const pageRef = useFadeIn();
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  // Navbar scroll effect
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Counters
  const c1 = useCounter(11082, 2500);
  const c2 = useCounter(85, 2000);
  const c3 = useCounter(1100, 2200);

  function handleCTA() {
    const token = localStorage.getItem("medmas_token");
    navigate(token ? "/chat" : "/login");
  }

  function scrollTo(id) {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div ref={pageRef} className="landing-root">
      {/* Inter is already loaded from index.html */}

      {/* ══════════════════════════════════════════════════════════════
          1. NAVBAR
          ══════════════════════════════════════════════════════════════ */}
      <nav className={`landing-nav ${navScrolled ? "nav-scrolled" : ""}`}>
        <div className="nav-inner">
          <div className="nav-logo" onClick={() => scrollTo("hero")}>
            <div className="logo-icon"><PulseIcon /></div>
            <span className="logo-text">MedMAS</span>
          </div>

          {/* Desktop links */}
          <div className="nav-links-desktop">
            {NAV_LINKS.map((l) => (
              <button key={l} className="nav-link" onClick={() => scrollTo(l.toLowerCase())}>
                {l}
              </button>
            ))}
          </div>

          <div className="nav-actions">
            <button className="nav-login" onClick={() => navigate("/login")}>Log in</button>
            <button className="nav-cta" onClick={handleCTA}>
              Try Demo <ArrowRight />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button className="nav-hamburger" onClick={() => setMobileMenu(!mobileMenu)}>
            <span /><span /><span />
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div className="mobile-menu">
            {NAV_LINKS.map((l) => (
              <button key={l} className="mobile-link" onClick={() => scrollTo(l.toLowerCase())}>{l}</button>
            ))}
            <button className="mobile-link" onClick={() => { setMobileMenu(false); navigate("/login"); }}>Log in</button>
            <button className="nav-cta mobile-cta" onClick={() => { setMobileMenu(false); handleCTA(); }}>
              Try Demo <ArrowRight />
            </button>
          </div>
        )}
      </nav>

      {/* ══════════════════════════════════════════════════════════════
          2. HERO
          ══════════════════════════════════════════════════════════════ */}
      <section id="hero" className="hero-section">
        {/* Particle grid background */}
        <div className="hero-grid" />
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />

        <div className="hero-content fade-section">
          <div className="hero-badge">
            <span className="badge-dot" />
            Multi-Agent AI Health System
          </div>

          <h1 className="hero-headline">
            <span className="hero-line-1">920 Million People.</span>
            <span className="hero-line-2">One AI Team.</span>
          </h1>

          <p className="hero-sub">
            Six specialist AI agents, orchestrated in real-time, delivering healthcare
            guidance across 22+ Indian languages — built for the communities that need it most.
          </p>

          <div className="hero-ctas">
            <button className="btn-primary" onClick={handleCTA}>
              See How It Works <ArrowRight />
            </button>
            <button className="btn-secondary" onClick={() => scrollTo("research")}>
              View Research <ChevronDown />
            </button>
          </div>

          {/* Stats */}
          <div className="hero-stats" ref={c1.ref}>
            <div className="stat-card">
              <span className="stat-num">1:{c1.count.toLocaleString()}</span>
              <span className="stat-label">Doctor-to-Patient Ratio</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-card" ref={c2.ref}>
              <span className="stat-num">{c2.count}%</span>
              <span className="stat-label">Mental Health Untreated</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-card" ref={c3.ref}>
              <span className="stat-num">{(c3.count / 1000).toFixed(1)}B</span>
              <span className="stat-label">Language Locked Out</span>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="scroll-indicator">
          <div className="scroll-mouse"><div className="scroll-dot" /></div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          3. PROBLEM BANNER (Ticker)
          ══════════════════════════════════════════════════════════════ */}
      <section className="ticker-section">
        <div className="ticker-track">
          {[...PROBLEMS, ...PROBLEMS, ...PROBLEMS].map((p, i) => (
            <div key={i} className="ticker-item">
              <span className="ticker-icon">{p.icon}</span>
              <span className="ticker-text">{p.text}</span>
              <span className="ticker-sep">·</span>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          4. WHY MULTI-AGENT
          ══════════════════════════════════════════════════════════════ */}
      <section id="features" className="section-dark fade-section">
        <div className="section-container why-section">
          <div className="why-left">
            <h2 className="section-title">
              Every startup that tried<br />
              <span className="text-teal">one model</span> failed.
            </h2>
            <p className="section-desc">
              Healthcare is too complex for a single AI. MedMAS deploys specialized agents —
              each trained for a specific clinical domain — orchestrated by LangGraph to deliver
              accurate, contextual, multilingual care.
            </p>

            {/* Comparison Table */}
            <div className="compare-table">
              <div className="compare-header">
                <span>Feature</span>
                <span>Single Model</span>
                <span className="text-teal">MedMAS</span>
              </div>
              {COMPARISON.map((row, i) => (
                <div key={i} className="compare-row">
                  <span className="compare-feature">{row.feature}</span>
                  <span className="compare-single">{row.single}</span>
                  <span className="compare-medmas">{row.medmas}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="why-right">
            {/* Orchestrator Diagram */}
            <div className="orchestrator-diagram">
              <div className="orch-center">
                <div className="orch-core">
                  <span className="orch-icon">⚡</span>
                  <span className="orch-label">Orchestrator</span>
                </div>
                {/* Agent nodes */}
                {AGENTS.map((a, i) => {
                  const angle = (i * 60 - 90) * (Math.PI / 180);
                  const r = 130;
                  const x = Math.cos(angle) * r;
                  const y = Math.sin(angle) * r;
                  return (
                    <div
                      key={i}
                      className="orch-node"
                      style={{
                        transform: `translate(${x}px, ${y}px)`,
                        animationDelay: `${i * 0.15}s`,
                      }}
                    >
                      <div className="orch-node-inner" style={{ borderColor: a.color + "60" }}>
                        <span>{a.emoji}</span>
                      </div>
                      <svg className="orch-line" style={{ position: "absolute", top: "50%", left: "50%", width: "1px", height: "1px", overflow: "visible" }}>
                        <line x1="0" y1="0" x2={-x} y2={-y} stroke={a.color} strokeWidth="1" opacity="0.3" strokeDasharray="4 4" />
                      </svg>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          5. AGENT CARDS — "Meet Your Care Team"
          ══════════════════════════════════════════════════════════════ */}
      <section id="agents" className="section-dark fade-section">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title center">Meet Your Care Team</h2>
            <p className="section-desc center">
              Six specialized AI agents, each an expert in its domain, working together
              through an intelligent orchestrator.
            </p>
          </div>

          <div className="agents-grid">
            {AGENTS.map((agent, i) => (
              <div key={i} className="agent-card" style={{ "--agent-color": agent.color }}>
                <div className="agent-card-glow" />
                <div className="agent-emoji">{agent.emoji}</div>
                <h3 className="agent-name">{agent.name}</h3>
                <p className="agent-desc">{agent.desc}</p>
                <div className="agent-line" style={{ background: agent.color }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          6. ASHA WORKER DEEP-DIVE
          ══════════════════════════════════════════════════════════════ */}
      <section id="asha" className="section-dark asha-section fade-section">
        <div className="section-container">
          <div className="asha-header">
            <div className="asha-accent-bar" />
            <div>
              <h2 className="section-title">Built for the Last Mile — ASHA Workers</h2>
              <p className="section-desc">
                490 million Indians depend on ASHA community health workers. MedMAS gives every
                field worker a specialist AI copilot — right from their phone.
              </p>
            </div>
          </div>

          {/* Feature Pills */}
          <div className="asha-grid">
            {ASHA_FEATURES.map((f, i) => (
              <div key={i} className="asha-pill">
                <span className="asha-pill-icon">{f.icon}</span>
                <div>
                  <h4 className="asha-pill-title">{f.title}</h4>
                  <p className="asha-pill-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Assessment Flow */}
          <div className="asha-flow">
            {ASHA_FLOW.map((step, i) => (
              <div key={i} className="asha-flow-step">
                <div className="asha-flow-dot" style={{ animationDelay: `${i * 0.2}s` }} />
                <span className="asha-flow-label">{step}</span>
                {i < ASHA_FLOW.length - 1 && <div className="asha-flow-line" />}
              </div>
            ))}
          </div>

          {/* Danger sign callout */}
          <div className="asha-callout">
            <span className="asha-callout-icon">⚠️</span>
            <p>
              <strong>Danger sign protocols built-in:</strong> children under 5 with fever,
              pregnant women, BP ≥ 140/90, chest pain, breathing difficulty.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          7. HOW IT WORKS (3-Step Flow)
          ══════════════════════════════════════════════════════════════ */}
      <section className="section-dark fade-section">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title center">How It Works</h2>
            <p className="section-desc center">Three steps. Any language. Instant guidance.</p>
          </div>

          <div className="steps-row">
            {STEPS.map((s, i) => (
              <div key={i} className="step-card">
                <div className="step-num">{s.num}</div>
                <div className="step-icon-circle">{s.icon}</div>
                <h3 className="step-title">{s.title}</h3>
                <p className="step-desc">{s.desc}</p>
                {i < STEPS.length - 1 && (
                  <div className="step-connector">
                    <svg width="60" height="2" viewBox="0 0 60 2">
                      <line x1="0" y1="1" x2="60" y2="1" stroke="#52525b" strokeWidth="2" strokeDasharray="6 4" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          8. RESEARCH STATS
          ══════════════════════════════════════════════════════════════ */}
      <section id="research" className="section-dark fade-section">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title center">Backed by Research</h2>
            <p className="section-desc center">Validated against peer-reviewed benchmarks.</p>
          </div>

          <div className="research-grid">
            {[
              { value: "65×", label: "Lower Compute Cost", sub: "vs. monolithic models" },
              { value: "87–91%", label: "MAS Accuracy", sub: "multi-agent system benchmark" },
              { value: "F1 ≥ 0.8", label: "NLP Extraction", sub: "clinical entity recognition" },
              { value: "76%", label: "Top-2 Differential", sub: "symptom-to-diagnosis accuracy" },
            ].map((s, i) => (
              <div key={i} className="research-card">
                <div className="research-glow" />
                <span className="research-value">{s.value}</span>
                <span className="research-label">{s.label}</span>
                <span className="research-sub">{s.sub}</span>
              </div>
            ))}
          </div>
          <p className="research-cite">Sources: Mount Sinai 2026, Multi-Agent Consensus Papers, ICMR Guidelines</p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          9. TECH STACK STRIP
          ══════════════════════════════════════════════════════════════ */}
      <section className="tech-strip fade-section">
        <div className="section-container">
          <p className="tech-label">Powered By</p>
          <div className="tech-row">
            {TECH_STACK.map((t, i) => (
              <span key={i} className="tech-chip">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          10. SAFETY BANNER
          ══════════════════════════════════════════════════════════════ */}
      <section className="safety-section fade-section">
        <div className="section-container">
          <div className="safety-card">
            <div className="safety-icon-wrap">
              <span className="safety-icon">🛡️</span>
            </div>
            <h3 className="safety-title">AI assists. Humans decide.</h3>
            <p className="safety-desc">
              Every output carries a mandatory doctor referral. 20–40% standalone NLP accuracy
              ceiling is why human-in-the-loop is non-negotiable. MedMAS augments care — it never replaces it.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          11. CTA FOOTER
          ══════════════════════════════════════════════════════════════ */}
      <footer id="demo" className="footer-section">
        <div className="section-container">
          <div className="footer-cta-block fade-section">
            <h2 className="footer-headline">
              Built for India.<br />
              <span className="text-teal">Backed by Research.</span>
            </h2>
            <p className="footer-sub">
              Join the mission to bring AI-powered healthcare to 920 million underserved people.
            </p>

            <div className="footer-form">
              <input type="email" placeholder="Enter your email" className="footer-input" />
              <button className="btn-primary" onClick={handleCTA}>
                Request Early Access <ArrowRight />
              </button>
            </div>
          </div>

          <div className="footer-bottom">
            <div className="footer-brand">
              <div className="logo-icon small"><PulseIcon /></div>
              <span className="logo-text small">MedMAS</span>
            </div>
            <p className="footer-copy">© 2025 MedMAS. Multi-Agent AI Health System. All rights reserved.</p>
            <div className="footer-links">
              <a href="https://github.com/Parthiv1124/MedMAS" target="_blank" rel="noopener noreferrer">GitHub</a>
              <button onClick={() => navigate("/login")}>Login</button>
              <button onClick={() => navigate("/signup")}>Sign Up</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
