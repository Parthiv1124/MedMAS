# 🏥 MedMAS - Multi-Agentic AI Healthcare Platform

<p align="center">
  <img src="https://img.shields.io/badge/Type-B2B2C%20SaaS-blueviolet?style=for-the-badge" alt="Type">
  <img src="https://img.shields.io/badge/Stack-FastAPI%20%2B%20React%20%2B%20LangGraph-blueviolet?style=for-the-badge" alt="Stack">
  <img src="https://img.shields.io/badge/Models-Qwen3--VL%20%2B%20Llama3-FF6B6B?style=for-the-badge" alt="Models">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Status-Production%20Ready-brightgreen?style=for-the-badge" alt="Status">
</p>

> 🚀 **Enterprise-Grade Multi-Tenant AI Healthcare SaaS** — A multilingual, multi-agentic platform delivering intelligent healthcare automation across diverse customer segments.

---

## 🎯 What is MedMAS?

MedMAS is a **B2B2C Multi-Tenant AI SaaS Platform** designed to serve:

| Segment | Description | Revenue Model |
|---------|-------------|---------------|
| 🏛️ **B2B - Healthcare Companies** | Hospitals, clinics, diagnostic chains, health tech companies | Enterprise subscriptions |
| 🏥 **B2B - Government** | State/district health programs via ASHA workers | Government contracts |
| 👤 **B2C - End Users** | Urban users seeking AI-powered health assistance | Freemium/Paid consultations |

With **6 specialist AI agents** orchestrated by LangGraph, MedMAS delivers clinically accurate, multilingual healthcare automation in 14+ languages.

---

## 🏆 Platform Capabilities

### 🧠 Multi-Agent AI Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    MedMAS Orchestrator                          │
│  (LangGraph-powered intelligent routing & coordination)         │
└─────────────────────────────────────────────────────────────────┘
         │        │        │        │        │        │
         ▼        ▼        ▼        ▼        ▼        ▼
    ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
    │Symptom  ││Disease  ││Mental   ││Health   ││ ASHA    ││ Doctor  │
    │Checker  ││Predictor ││Health   ││Scorer   ││ Copilot ││ Finder  │
    └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
```

| Agent | Capability | Enterprise Use Case |
|-------|-----------|---------------------|
| 🩺 **Symptom Checker** | ICMR-guideline symptom triage | Triage automation for hospitals |
| 📊 **Disease Predictor** | Lab report analysis & risk scoring | Integrated diagnostics |
| 💚 **Mental Health** | Empathy-driven emotional support | Employee wellness programs |
| ⚖️ **Health Scorer** | Lifestyle & habit analysis | Insurance risk assessment |
| 👩‍🏫 **ASHA Copilot** | Frontline worker assistance | Government health programs |
| 🔍 **Doctor Finder** | Nearby doctor & facility discovery | Healthcare marketplace |

### 📄 Intelligent Lab Report Processing (VLM-Powered)
- **Qwen3-VL-30B** vision model extracts lab values from PDF reports
- Automated detection of 30+ lab parameters (HbA1c, glucose, cholesterol, etc.)
- ICMR/WHO threshold-based risk flagging
- Enterprise integration via API

### 🗣️ Voice-First Accessibility
- **Whisper-large-v3** for speech-to-text in 10+ Indian languages
- Voice messages from users get transcribed and processed
- Low-bandwidth optimized for tier-2/3 cities

### 🌐 True Multilingual Support
- Real-time language detection (Hindi, Gujarati, Tamil, Bengali, Marathi, etc.)
- Responses delivered in user's native language
- Regional dialect understanding
- 14+ languages supported

### 🏢 Multi-Tenant Architecture
- Tenant isolation with role-based access
- White-label ready for enterprise clients
- Custom branding per tenant
- Usage-based billing support

---

## 💼 Revenue Models

### For Healthcare Companies (B2B)
- **SaaS Subscription** - Monthly/annual platform access
- **API Usage** - Pay-per-consultation pricing
- **White-label** - Full brand customization

### For Government Programs (B2B)
- **Government Contracts** - State health department deployments
- **ASHA Worker Integration** - Doorstep healthcare delivery
- **Public Health Campaigns** - Disease monitoring & alerts

### For End Users (B2C)
- **Freemium** - Free basic consultations
- **Premium** - AI specialist consultations
- **Insurance Integration** - Partner with health insurers

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** - High-performance async API
- **LangGraph** - Multi-agent orchestration
- **DeepInfra** - GPU-accelerated LLM inference (Llama 3.1, Qwen3-VL)
- **Supabase** - Auth, database, real-time
- **Qdrant** - Vector database for medical knowledge retrieval

### Frontend
- **React 18** with Vite
- **Tailwind CSS** for styling
- **React Router** for navigation

### Infrastructure
- PostgreSQL (Supabase)
- Qdrant Vector Store
- OpenStreetMap APIs
- DeepInfra GPU Inference

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- Supabase account
- DeepInfra API key

### 1. Clone & Install

```bash
# Backend
cd medmas/backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Environment Setup

Create `.env` file in `backend/`:
```env
DEEPINFRA_API_KEY=your_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
MODEL_NAME=meta-llama/Meta-Llama-3.1-8B-Instruct
VLM_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct
```

### 3. Run the Application

```bash
# Backend (Terminal 1)
cd backend
python -m uvicorn main:app --reload --port 8000

# Frontend (Terminal 2)
cd frontend
npm run dev
```

### 4. Access the Application

- 🌐 **Web App**: http://localhost:5173
- 📚 **API Docs**: http://localhost:8000/docs

---

## 📡 API Endpoints

### User APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | AI health consultation |
| `/api/chat/upload` | POST | Upload lab report PDF |
| `/api/transcribe` | POST | Speech-to-text |
| `/api/auth/send-otp` | POST | Send OTP |
| `/api/auth/verify-otp` | POST | Verify OTP & login |

### Doctor APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/doctor/signup` | POST | Doctor registration |
| `/api/doctor/login` | POST | Doctor authentication |
| `/api/cases/doctor/{id}` | GET | List assigned cases |
| `/api/prescriptions/suggest` | POST | AI prescription suggestion |

### Enterprise/Tenant APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tenant/register` | POST | Register new tenant |
| `/api/tenant/stats` | GET | Usage analytics |
| `/api/asha/queue/{worker_id}` | GET | ASHA worker patient queue |

---

## 🏥 Demo Scenarios

### Scenario 1: Symptom Analysis (B2C)
```
User: "I have fever since 3 days and chest pain"
→ Symptom Checker routes to emergency triage
→ Returns: "Urgent - consult doctor within 24hrs"
→ Doctor Finder shows nearby cardiac specialists
```

### Scenario 2: Lab Report Upload (B2B)
```
User: Uploads PDF lab report via hospital portal
→ Qwen3-VL extracts: HbA1c: 8.5, Glucose: 180
→ Disease Predictor flags: High diabetes risk
→ Returns: Risk score, lifestyle recommendations
→ Doctor Finder suggests endocrinologist
```

### Scenario 3: Government Health Program (B2B)
```
ASHA: "A pregnant woman in my village needs checkup"
→ ASHA Copilot guides through assessment
→ Creates patient record in system
→ Flags high-risk cases for doctor review
→ Data syncs to district health dashboard
```

### Scenario 4: Enterprise Triage (B2B)
```
Hospital System: API call with patient symptoms
→ Symptom Checker runs clinical triage
→ Returns urgency level + specialty recommendation
→ Creates case for on-duty doctor
→ Patient notified via SMS
```

---

## 📂 Project Structure

```
medmas/
├── backend/
│   ├── agents/              # AI agent implementations
│   │   ├── symptom_checker_v2.py
│   │   ├── disease_predictor.py
│   │   ├── empathy_chatbot.py
│   │   ├── health_scorer.py
│   │   ├── asha_copilot.py
│   │   └── crisis_guard.py
│   ├── services/            # Business logic
│   │   ├── pdf_parser.py    # VLM-powered lab extraction
│   │   ├── image_parser.py  # Vision model for images
│   │   ├── doctor_finder.py
│   │   └── notifications.py
│   ├── orchestrator.py      # LangGraph workflow
│   ├── main.py             # FastAPI app
│   └── config.py           # Configuration
├── frontend/
│   ├── src/
│   │   ├── pages/          # React pages
│   │   ├── components/     # UI components
│   │   └── lib/           # Utilities
│   └── dist/              # Production build
├── data/
│   ├── doctors.csv         # Doctor database
│   └── lab_ranges.json    # ICMR lab thresholds
└── docs/                  # Architecture docs
```

---

## 🎯 Target Market

| Market | Size | Approach |
|--------|------|-----------|
| Indian Healthcare Companies | $50B+ | Direct sales, partnerships |
| Government Health Programs | $20B+ | Tender/contract process |
| Urban End Users | 500M+ | Digital marketing, app stores |
| International Markets | $500B+ | Future expansion |

---

## 🔐 Clinical Safety & Compliance

- ✅ **No medical advice replaces doctor consultation**
- ✅ All responses include disclaimer
- ✅ Emergency cases flagged for immediate referral
- ✅ ICMR/WHO guidelines baked into every agent
- ✅ Human-in-the-loop for critical decisions
- ✅ HIPAA/SOC2 ready architecture
- ✅ Data encryption at rest and in transit

---

## 🤝 Partner With Us

MedMAS is ready for enterprise deployment. Contact us for:
- **API Integration** - Plug into your existing systems
- **White-label Solutions** - Full brand customization
- **Government Deployments** - State health program integration
- **Healthcare Chains** - Multi-location hospital networks

```bash
# For partnership inquiries
# Email: partners@medmas.ai
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **ICMR** - Indian Council of Medical Research guidelines
- **DeepInfra** - GPU-accelerated model serving
- **Supabase** - Open-source Firebase alternative
- **LangChain/LangGraph** - Agent orchestration
- **OpenStreetMap** - Free map data

---

<p align="center">
  <strong>Built for the Future of Healthcare</strong><br>
  Multi-tenant · Multilingual · Multi-Agentic AI Platform
</p>