import { useState, useRef, useCallback, useEffect } from "react";

const ICON_MAP = { "ti-chart-bar": "📊", "ti-award": "🏆", "ti-briefcase": "💼" };

const SKILLS_DB = {
  technical: [
    // Languages
    "python","javascript","typescript","java","c++","c","c#","go","rust","swift","kotlin","scala","r","matlab","bash","php","ruby","dart","perl",
    // Web
    "html","css","react","vue","angular","node.js","django","flask","fastapi","spring","express","tailwind","bootstrap","next.js","nuxt","svelte",
    // Data / ML
    "machine learning","deep learning","nlp","computer vision","data science","tensorflow","pytorch","keras","scikit-learn","pandas","numpy","matplotlib","seaborn","opencv","xgboost","hugging face","langchain",
    // DB
    "sql","nosql","postgresql","mysql","mongodb","redis","elasticsearch","sqlite","oracle","cassandra",
    // DevOps / Cloud
    "docker","kubernetes","aws","azure","gcp","terraform","ci/cd","git","linux","jenkins","ansible","prometheus","grafana","github actions","airflow","kafka","spark","hadoop","dbt","serverless",
    // Other
    "rest api","graphql","microservices","agile","devops","figma","tableau","power bi","blockchain","solidity","cybersecurity","penetration testing","network security","cloud computing","unity","unreal engine","flutter","react native"
  ],
  soft: [
    "leadership","communication","teamwork","problem solving","problem-solving","critical thinking","adaptability","time management","creativity",
    "collaboration","project management","mentoring","public speaking","negotiation","conflict resolution","strategic thinking",
    "attention to detail","decision making","emotional intelligence","customer service","analytical thinking","analytical",
    "self-motivated","fast learner","interpersonal","organized","detail-oriented","result-oriented","innovative","proactive"
  ]
};

// Aliases: words in resume that map to canonical skill names
const SKILL_ALIASES = {
  "ml": "machine learning",
  "ai": "machine learning",
  "artificial intelligence": "machine learning",
  "dl": "deep learning",
  "natural language processing": "nlp",
  "cv": "computer vision",
  "tf": "tensorflow",
  "sk-learn": "scikit-learn",
  "sklearn": "scikit-learn",
  "scikit learn": "scikit-learn",
  "numpy": "numpy",
  "js": "javascript",
  "ts": "typescript",
  "pg": "postgresql",
  "postgres": "postgresql",
  "node": "node.js",
  "expressjs": "express",
  "reactjs": "react",
  "vuejs": "vue",
  "k8s": "kubernetes",
  "githubactions": "github actions",
  "cicd": "ci/cd",
  "ci cd": "ci/cd",
};

const ROLES_MAP = [
  { role: "ML / AI Engineer",       skills: ["python","machine learning","deep learning","tensorflow","keras","pytorch","scikit-learn","numpy","pandas","opencv","nlp","computer vision","sql"] },
  { role: "Data Scientist",          skills: ["python","machine learning","pandas","numpy","scikit-learn","sql","tensorflow","matplotlib","data science","tableau","power bi"] },
  { role: "Backend Developer",       skills: ["python","java","node.js","flask","django","fastapi","spring","postgresql","mysql","sql","rest api","docker","git"] },
  { role: "Frontend Developer",      skills: ["html","css","javascript","react","vue","angular","typescript","tailwind","figma"] },
  { role: "Full Stack Developer",    skills: ["html","css","javascript","react","node.js","python","sql","rest api","docker","git"] },
  { role: "DevOps / Cloud Engineer", skills: ["docker","kubernetes","aws","ci/cd","linux","terraform","ansible","jenkins","git","cloud computing"] },
  { role: "Software Engineer",       skills: ["python","java","c++","c","javascript","sql","git","data structures","rest api","agile"] },
  { role: "Research Engineer",       skills: ["python","machine learning","deep learning","tensorflow","pytorch","numpy","pandas","computer vision","nlp","matlab"] },
];

function extractTextFromContent(rawText) {
  const sections = { skills: [], education: [], experience: [], projects: [], certifications: [], additional: [], summary: "", contact: {} };

  // ── Step 1: Aggressively normalise PDF text ──────────────────────────────
  // PDFs extracted as plain text often lose newlines entirely — everything becomes
  // one long string. We inject newlines before known section headers so the
  // line-by-line parser below can work reliably.
  const KNOWN_HEADERS = [
    "CAREER OBJECTIVE","OBJECTIVE","SUMMARY","PROFILE",
    "TECHNICAL SKILLS","SKILLS","CORE COMPETENCIES","TECH STACK",
    "PROGRAMMING LANGUAGES","WEB TECHNOLOGIES","TOOLS & TECHNOLOGIES",
    "EDUCATION","ACADEMIC","QUALIFICATION",
    "EXPERIENCE","WORK EXPERIENCE","PROFESSIONAL EXPERIENCE","INTERNSHIP","INTERNSHIPS",
    "PROJECTS","PROJECT","KEY PROJECTS","ACADEMIC PROJECTS","PERSONAL PROJECTS",
    "CERTIFICATIONS","CERTIFICATION","CERTIFICATES","ACHIEVEMENTS","AWARDS","COURSES","TRAINING",
    "ADDITIONAL INFORMATION","ADDITIONAL","SOFT SKILLS","AREA OF INTEREST",
    "LANGUAGES","HOBBIES","INTERESTS","EXTRACURRICULAR","VOLUNTEER",
  ];

  // Build a regex that injects \n before any known header word/phrase
  const headerRx = new RegExp(
    "(?<![A-Z])(" + KNOWN_HEADERS.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?=[^a-z]|$)",
    "g"
  );

  let text = rawText
    .replace(/\r\n|\r/g, "\n")         // normalise line endings
    .replace(/•/g, "\n• ")             // bullets → new lines
    .replace(/\|/g, " | ")             // pipe separators
    .replace(headerRx, "\n$1")         // inject newline before each header
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // ── Step 2: Section header patterns — must be a standalone header LINE, ──
  // not just any sentence that happens to contain the word. A real header is:
  //   • short (under ~45 chars)
  //   • mostly uppercase OR Title Case, with no sentence punctuation
  //   • matches one of our known section names as the ENTIRE line (ignoring case/spacing)
  const SECTION_MAP = [
    { key: "summary",        names: ["career objective","objective","summary","profile","about me"] },
    { key: "skills",         names: ["technical skills","skills","core competencies","tech stack","programming languages","web technologies","tools & technologies","tools and technologies","key skills"] },
    { key: "education",      names: ["education","academic background","qualification","academics","educational qualification"] },
    { key: "experience",     names: ["work experience","experience","employment","professional experience","internship","internships","work history"] },
    { key: "projects",       names: ["projects","personal projects","key projects","academic projects","major projects"] },
    { key: "certifications", names: ["certifications","certification","certificates","achievements","awards","courses","training","awards and achievements"] },
    { key: "additional",     names: ["additional information","additional","soft skills","area of interest","areas of interest","hobbies","interests","extracurricular","volunteer","languages known"] },
  ];

  // Normalise a candidate header line: lowercase, strip punctuation/extra spaces
  const cleanHeader = (line) => line.toLowerCase().replace(/[:.\-–—•]/g, " ").replace(/\s+/g, " ").trim();

  const matchHeader = (line) => {
    if (line.length > 45) return null;                  // too long to be a header
    if (/[.!?,]{1}\s+\w/.test(line)) return null;        // contains sentence punctuation = body text
    if (/\d{2,}/.test(line) && !/^[A-Za-z\s&/]+$/.test(line)) return null; // has numbers = probably not header
    const clean = cleanHeader(line);
    for (const sec of SECTION_MAP) {
      if (sec.names.includes(clean)) return sec.key;
    }
    return null;
  };

  let currentSection = null;

  for (const line of lines) {
    if (/^[-=_*]{2,}$/.test(line)) continue;           // dividers
    if (/^page\s*\d+/i.test(line)) continue;            // page numbers

    const matchedKey = matchHeader(line);

    if (matchedKey) {
      currentSection = matchedKey;
      continue;
    }

    // Route line to correct section bucket
    if (!currentSection) {
      // Pre-section: pick up contact info and name
      const emailM = line.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
      if (emailM) { sections.contact.email = emailM[0]; continue; }
      const phoneM = line.match(/\+?\d[\d\s\-().]{6,}\d/);
      if (phoneM) { sections.contact.phone = phoneM[0]; continue; }
    } else if (currentSection === "summary") {
      if (!sections.summary) sections.summary = line;
    } else {
      sections[currentSection].push(line);
    }
  }

  // ── Step 3: Fallback — if sections are empty, scan raw text for inline labels
  // e.g. "Programming Languages: C, C++, Python" embedded in one paragraph
  if (sections.skills.length === 0) {
    const inlineSkillRx = /(?:programming languages?|web technologies?|tools?|frameworks?|database)\s*[:\-]\s*([^\n.]+)/gi;
    let m;
    while ((m = inlineSkillRx.exec(rawText)) !== null) {
      sections.skills.push(m[1].trim());
    }
  }
  if (sections.experience.length === 0) {
    const internRx = /(?:intern|internship)[^\n]*/gi;
    let m;
    while ((m = internRx.exec(rawText)) !== null) {
      sections.experience.push(m[0].trim());
    }
  }
  if (sections.certifications.length === 0) {
    const certRx = /(?:certified?|nptel|coursera|udemy|microsoft|cisco|linkedin|aws certified?|google certified?)[^\n]*/gi;
    let m;
    while ((m = certRx.exec(rawText)) !== null) {
      sections.certifications.push(m[0].trim());
    }
  }

  return sections;
}

// ── Skill token normaliser ─────────────────────────────────────────────────
// Strips all label noise and punctuation, returns clean lowercase text
function normaliseForSkills(text) {
  return text
    .replace(/programming languages?\s*[:\-]/gi, " ")
    .replace(/web technologies?\s*[:\-]/gi, " ")
    .replace(/tools?\s*[:\-]/gi, " ")
    .replace(/frameworks?\s*[:\-]/gi, " ")
    .replace(/databases?\s*[:\-]/gi, " ")
    .replace(/soft skills?\s*[:\-]/gi, " ")
    .replace(/technical skills?\s*[:\-]/gi, " ")
    .replace(/area of interest\s*[:\-]/gi, " ")
    .replace(/languages?\s*[:\-]/gi, " ")
    .replace(/skills?\s*[:\-]/gi, " ")
    .replace(/[,|•:()\/\\[\]{}@#$%^&*+=~`<>?!]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function identifySkills(text) {
  const foundTech = new Set();
  const foundSoft = new Set();

  const norm = normaliseForSkills(text);

  // ── 1. Alias expansion (ai→machine learning, sklearn→scikit-learn, etc.) ──
  for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) {
    const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp("(?:^|[ \\t])" + esc + "(?=[ \\t]|$)", "i").test(norm)) {
      foundTech.add(canonical);
    }
  }

  // ── 2. Match technical skills (longest first avoids substring collisions) ──
  const techSorted = [...SKILLS_DB.technical].sort((a, b) => b.length - a.length);

  for (const skill of techSorted) {
    const esc = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Strategy by length:
    // • 1 char  ("c", "r")  → must be surrounded by spaces (very strict)
    // • 2 chars ("go")      → non-alpha boundary on both sides
    // • 3+ chars            → standard \b word boundary
    let rx;
    if (skill.length === 1) {
      rx = new RegExp("(?:^| )" + esc + "(?= |$)", "i");
    } else if (skill.length === 2) {
      rx = new RegExp("(?:^|[^a-z0-9])" + esc + "(?=[^a-z0-9]|$)", "i");
    } else {
      // c++ and similar symbols: escape properly, \b works for word chars
      rx = new RegExp("(?:^|[^a-z0-9])" + esc + "(?=[^a-z0-9]|$)", "i");
    }

    if (rx.test(norm)) foundTech.add(skill);
  }

  // ── 3. Soft skills — match against full original text (preserves context) ──
  const softNorm = text.toLowerCase().replace(/[,|•\-:()\/\\]/g, " ").replace(/\s+/g, " ");

  for (const skill of SKILLS_DB.soft) {
    const esc = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const withSpace  = esc.replace(/-/g, "[ \\-]");   // "problem.solving" or "problem-solving"
    if (new RegExp("\\b(?:" + esc + "|" + withSpace + ")\\b", "i").test(softNorm)) {
      foundSoft.add(skill.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    }
  }

  return { technical: [...foundTech], soft: [...foundSoft] };
}

function calculateATSScore(sections, skills, jdSkills, resumeText) {
  let score = 0;
  const breakdown = {};
  // Sections: skills + education + experience each worth 7, projects/certs/additional worth 2 each
  let secScore = 0;
  if (sections.skills?.length)         secScore += 7;
  if (sections.education?.length)      secScore += 7;
  if (sections.experience?.length)     secScore += 7;
  if (sections.projects?.length)       secScore += 2;
  if (sections.certifications?.length) secScore += 2;
  breakdown.sections = Math.min(secScore, 25);
  score += breakdown.sections;

  const allSkills = [...skills.technical, ...skills.soft].map(s => s.toLowerCase());
  const keywordHits = jdSkills.filter(s => allSkills.some(us => us === s || us.includes(s))).length;
  const keywordScore = jdSkills.length > 0 ? Math.min(Math.round((keywordHits / jdSkills.length) * 35), 35) : 20;
  breakdown.keywords = keywordScore;
  score += breakdown.keywords;

  const lengthScore = resumeText.length > 500 && resumeText.length < 6000 ? 15 : resumeText.length >= 500 ? 10 : 5;
  breakdown.length = lengthScore;
  score += breakdown.length;

  // Skills coverage: technical (up to 10) + soft skills bonus (up to 5)
  const techScore = Math.min(skills.technical.length * 1.5, 10);
  const softBonus = Math.min(skills.soft.length, 5);
  breakdown.skillsCoverage = Math.round(techScore + softBonus);
  score += breakdown.skillsCoverage;

  // Structure: contact + certifications boost
  let structScore = sections.contact?.email ? 7 : 3;
  if (sections.certifications?.length > 0) structScore += 3;
  breakdown.structure = Math.min(structScore, 10);
  score += breakdown.structure;

  return { total: Math.min(score, 100), breakdown };
}

function recommendedRoles(skills) {
  const allSkills = [...skills.technical, ...skills.soft].map(s => s.toLowerCase());
  return ROLES_MAP.map(r => {
    const matched = r.skills.filter(s => allSkills.some(us => us === s || us.includes(s) || s.includes(us)));
    // Weighted: each matched skill counts, bonus for core skills (first 4 in list)
    const coreMatches = r.skills.slice(0, 4).filter(s => allSkills.some(us => us === s || us.includes(s) || s.includes(us))).length;
    const rawScore = (matched.length / r.skills.length) * 70 + (coreMatches / 4) * 30;
    return { ...r, match: Math.min(Math.round(rawScore), 100), matched };
  }).sort((a, b) => b.match - a.match);
}

const MOCK_USERS = [{ id: 1, email: "demo@example.com", password: "demo123", name: "Alex Johnson", role: "user" }, { id: 2, email: "admin@resumeai.com", password: "admin123", name: "Admin", role: "admin" }];
let ANALYSIS_HISTORY = [];
let nextId = 1;

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "", isRegister: false });
  const [authError, setAuthError] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [history, setHistory] = useState([]);
  const fileRef = useRef();
  const chartRef = useRef(null);
  const radarRef = useRef(null);
  const chartInstances = useRef({});

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-resumeai-vars", "true");
    style.textContent = `
      :root {
        --color-background-primary: #ffffff;
        --color-background-secondary: #f5f5f7;
        --color-background-tertiary: #eef0f3;
        --color-background-danger: #fdecea;
        --color-text-primary: #1a1a1a;
        --color-text-secondary: #6b6b6b;
        --color-text-tertiary: #9a9a9a;
        --color-text-danger: #c0392b;
        --color-border-secondary: #d8d8dc;
        --color-border-tertiary: #e4e4e8;
        --border-radius-lg: 12px;
        --border-radius-md: 8px;
        --font-mono: 'SFMono-Regular', Consolas, monospace;
      }
      input, textarea, select {
        font-family: inherit;
        padding: 8px 10px;
        border-radius: 8px;
        border: 0.5px solid var(--color-border-secondary);
        font-size: 14px;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // ── Lightweight SVG chart helpers (no external chart library needed) ──────
  function DonutChart({ value, size = 140, color = "#1D9E75", trackColor = "#E1F5EE", centerLabel, centerSub }) {
    const stroke = 14;
    const r = (size - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, value));
    const dash = (clamped / 100) * circumference;
    return (
      <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <span style={{ fontSize: 28, fontWeight: 500, color }}>{centerLabel}</span>
          {centerSub && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{centerSub}</span>}
        </div>
      </div>
    );
  }

  function BarChart({ data, height = 140 }) {
    const maxVal = 35;
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height, padding: "0 4px" }}>
        {data.map((d) => {
          const pct = Math.max(2, Math.round((d.value / maxVal) * 100));
          return (
            <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{d.value}</span>
              <div style={{ width: "100%", height: `${pct}%`, background: d.color, borderRadius: "6px 6px 0 0", transition: "height 0.5s ease", minHeight: 4 }}></div>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 6, textAlign: "center" }}>{d.label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function handleLogin() {
    const found = MOCK_USERS.find(u => u.email === authForm.email && u.password === authForm.password);
    if (found) { setUser(found); setPage("app"); setAuthError(""); }
    else setAuthError("Invalid email or password.");
  }

  function handleRegister() {
    if (!authForm.name || !authForm.email || !authForm.password) { setAuthError("All fields required."); return; }
    const newUser = { id: MOCK_USERS.length + 1, email: authForm.email, password: authForm.password, name: authForm.name, role: "user" };
    MOCK_USERS.push(newUser);
    setUser(newUser); setPage("app"); setAuthError("");
  }

  async function readFileAsText(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      if (file.name.endsWith(".pdf")) reader.readAsText(file);
      else reader.readAsText(file);
    });
  }

  async function handleAnalyze() {
    if (!resumeText.trim()) { alert("Please upload a resume or paste resume text."); return; }
    setLoading(true);
    const msgs = ["Parsing resume structure...", "Extracting skills with NLP...", "Analyzing job description...", "Running semantic matching...", "Calculating ATS score...", "Generating recommendations..."];
    for (let i = 0; i < msgs.length; i++) {
      setLoadingMsg(msgs[i]);
      await new Promise(r => setTimeout(r, 600));
    }
    try {
      const sections = extractTextFromContent(resumeText);
      const skills = identifySkills(resumeText);
      let jdSkills = [], jdKeywords = [], matchedSkills = [], missingSkills = [];
      let aiRec = [], aiSummary = "";

      if (jobDesc.trim()) {
        const jdExtracted = identifySkills(jobDesc);
        jdSkills = [...new Set([...jdExtracted.technical, ...jdExtracted.soft])];
        jdKeywords = jdSkills;

        // Build a normalised set of ALL skills found in the resume (tech + soft)
        const resumeSkillSet = new Set([
          ...skills.technical.map(s => s.toLowerCase()),
          ...skills.soft.map(s => s.toLowerCase()),
        ]);

        // A JD skill is "matched" if the resume skill set contains it (or a substring match)
        matchedSkills = jdSkills.filter(jd => {
          const jdL = jd.toLowerCase();
          return resumeSkillSet.has(jdL) ||
            [...resumeSkillSet].some(rs => rs.includes(jdL) || jdL.includes(rs));
        });
        missingSkills = jdSkills.filter(jd => !matchedSkills.includes(jd));
      }

      const atsScore = calculateATSScore(sections, skills, jdSkills, resumeText);
      const roles = recommendedRoles(skills);

      const prompt = `You are an expert resume analyzer and ATS specialist. Analyze this resume and give a focused, honest assessment.

Resume Text:
${resumeText.substring(0, 2000)}

${jobDesc ? `Target Job Description:\n${jobDesc.substring(0, 1000)}` : ""}

Skills Found: ${[...skills.technical, ...skills.soft].join(", ") || "none clearly detected"}
Missing Skills (from JD): ${missingSkills.join(", ") || "n/a"}
ATS Score: ${atsScore.total}/100

Provide a JSON response with this exact structure (no markdown, no preamble):
{
  "summary": "2-3 sentence overall assessment of resume quality and ATS readiness",
  "strengths": ["strength1", "strength2", "strength3"],
  "quickWins": ["specific, actionable improvement 1", "specific actionable improvement 2", "specific actionable improvement 3"]
}`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, messages: [{ role: "user", content: prompt }] })
      });
      const data = await resp.json();
      const rawText = data.content?.map(c => c.text || "").join("") || "{}";
      let aiData = {};
      try { aiData = JSON.parse(rawText.replace(/```json|```/g, "").trim()); } catch { aiData = { summary: rawText.substring(0, 200), strengths: [], quickWins: [] }; }

      const result = { sections, skills, jdSkills, matchedSkills, missingSkills, atsScore, roles, aiData, resumeText, jobDesc, timestamp: new Date().toISOString(), id: nextId++ };
      setAnalysis(result);
      const histEntry = { id: result.id, timestamp: result.timestamp, atsScore: atsScore.total, fileName: resumeFile?.name || "Pasted text", matchScore: jdSkills.length > 0 ? Math.round((matchedSkills.length / jdSkills.length) * 100) : 0, userId: user.id };
      ANALYSIS_HISTORY.unshift(histEntry);
      setHistory([...ANALYSIS_HISTORY.filter(h => h.userId === user.id)]);
      setActiveTab("overview");
      setPage("dashboard");
    } catch (err) {
      alert("Analysis failed: " + err.message);
    } finally { setLoading(false); setLoadingMsg(""); }
  }

  const tabs = [
    { id: "overview", label: "Overview", icon: "ti-chart-bar" },
    { id: "skills", label: "Skills", icon: "ti-award" },
    { id: "roles", label: "Job Roles", icon: "ti-briefcase" },
  ];

  const scoreColor = (s) => s >= 75 ? "#1D9E75" : s >= 50 ? "#378ADD" : s >= 30 ? "#EF9F27" : "#E24B4A";
  const scoreBg = (s) => s >= 75 ? "#E1F5EE" : s >= 50 ? "#E6F1FB" : s >= 30 ? "#FAEEDA" : "#FCEBEB";

  if (page === "login" || page === "register") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ width: 52, height: 52, borderRadius: "14px", background: "#534AB7", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
              <span style={{ fontSize: 26, color: "#fff" }}>📄</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>ResumeAI</h1>
            <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 14 }}>Intelligent resume analysis & career guidance</p>
          </div>
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.5rem" }}>
            <div style={{ display: "flex", marginBottom: "1.5rem", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", overflow: "hidden" }}>
              {["login", "register"].map(t => (
                <button key={t} onClick={() => { setPage(t); setAuthError(""); }} style={{ flex: 1, padding: "8px", border: "none", cursor: "pointer", fontSize: 14, fontWeight: page === t ? 500 : 400, background: page === t ? "#534AB7" : "transparent", color: page === t ? "#fff" : "var(--color-text-secondary)", transition: "all 0.15s" }}>
                  {t === "login" ? "Sign in" : "Register"}
                </button>
              ))}
            </div>
            {authError && <div style={{ background: "var(--color-background-danger)", color: "var(--color-text-danger)", padding: "8px 12px", borderRadius: "var(--border-radius-md)", fontSize: 13, marginBottom: "1rem" }}>{authError}</div>}
            {page === "register" && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Full name</label>
                <input type="text" placeholder="Alex Johnson" value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
            )}
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Email</label>
              <input type="email" placeholder={page === "login" ? "demo@example.com" : "you@example.com"} value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Password</label>
              <input type="password" placeholder={page === "login" ? "demo123" : "at least 6 chars"} value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={e => e.key === "Enter" && (page === "login" ? handleLogin() : handleRegister())} style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <button onClick={page === "login" ? handleLogin : handleRegister} style={{ width: "100%", padding: "10px", background: "#534AB7", color: "#fff", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
              {page === "login" ? "Sign in" : "Create account"}
            </button>
            {page === "login" && <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center", margin: "12px 0 0" }}>Demo: demo@example.com / demo123</p>}
          </div>
        </div>
      </div>
    );
  }

  if (page === "admin" && user?.role === "admin") {
    const allAnalyses = ANALYSIS_HISTORY;
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
        <header style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "0 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "#534AB7", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 16 }}>📄</span>
            </div>
            <span style={{ fontWeight: 500, fontSize: 15 }}>ResumeAI Admin</span>
          </div>
          <button onClick={() => setPage("app")} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>← Back to app</button>
        </header>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: "1.5rem" }}>System overview</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: "2rem" }}>
            {[{ label: "Total analyses", value: allAnalyses.length }, { label: "Registered users", value: MOCK_USERS.length }, { label: "Avg ATS score", value: allAnalyses.length ? Math.round(allAnalyses.reduce((a, b) => a + b.atsScore, 0) / allAnalyses.length) + "%" : "—" }, { label: "Avg match score", value: allAnalyses.length ? Math.round(allAnalyses.reduce((a, b) => a + b.matchScore, 0) / allAnalyses.length) + "%" : "—" }].map(m => (
              <div key={m.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>{m.label}</p>
                <p style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>All analyses</h3>
            </div>
            {allAnalyses.length === 0 ? <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>No analyses yet.</p> : allAnalyses.map((a, i) => (
              <div key={a.id} style={{ padding: "12px 1.25rem", borderBottom: i < allAnalyses.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 500 }}>{a.fileName}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>User ID: {a.userId} · {new Date(a.timestamp).toLocaleString()}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 99, background: scoreBg(a.atsScore), color: scoreColor(a.atsScore), fontWeight: 500 }}>ATS {a.atsScore}%</span>
                  <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 99, background: "#E6F1FB", color: "#185FA5", fontWeight: 500 }}>Match {a.matchScore}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (page === "app") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
        <header style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "0 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "#534AB7", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 16 }}>📄</span>
            </div>
            <span style={{ fontWeight: 500, fontSize: 15 }}>ResumeAI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user?.role === "admin" && <button onClick={() => setPage("admin")} style={{ fontSize: 13, padding: "5px 12px", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", cursor: "pointer", color: "var(--color-text-secondary)" }}>Admin panel</button>}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#534AB7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 500 }}>{user?.name?.[0]?.toUpperCase()}</div>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{user?.name}</span>
            </div>
            <button onClick={() => { setUser(null); setPage("login"); setAnalysis(null); }} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Sign out</button>
          </div>
        </header>

        <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1rem" }}>
          <div style={{ marginBottom: "2rem" }}>
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 6px" }}>Analyze your resume</h1>
            <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 14 }}>Upload your resume and an optional job description for AI-powered analysis, ATS scoring, and career recommendations.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
              <label style={{ fontSize: 14, fontWeight: 500, display: "block", marginBottom: "0.75rem" }}><span style={{ marginRight: 6 }}>⬆️</span>Resume</label>
              <div onClick={() => fileRef.current.click()} style={{ border: "1.5px dashed var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", padding: "1.5rem", textAlign: "center", cursor: "pointer", marginBottom: "0.75rem", transition: "border-color 0.15s" }} onMouseOver={e => e.currentTarget.style.borderColor = "#534AB7"} onMouseOut={e => e.currentTarget.style.borderColor = "var(--color-border-secondary)"}>
                <span style={{ fontSize: 28, color: "#534AB7", display: "block", marginBottom: 6 }}>📤</span>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 500 }}>{resumeFile ? resumeFile.name : "Drop file here or click to upload"}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>PDF or DOCX · max 5MB</p>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={async e => {
                const f = e.target.files[0];
                if (!f) return;
                setResumeFile(f);
                const text = await readFileAsText(f);
                setResumeText(text);
              }} />
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 6px" }}>Or paste resume text:</p>
              <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} placeholder="Paste your resume content here..." rows={6} style={{ width: "100%", boxSizing: "border-box", fontSize: 13, fontFamily: "var(--font-mono)", resize: "vertical" }} />
            </div>

            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
              <label style={{ fontSize: 14, fontWeight: 500, display: "block", marginBottom: "0.75rem" }}><span style={{ marginRight: 6 }}>💼</span>Job description <span style={{ color: "var(--color-text-secondary)", fontWeight: 400, fontSize: 12 }}>(optional)</span></label>
              <textarea value={jobDesc} onChange={e => setJobDesc(e.target.value)} placeholder="Paste the job description here to get skill gap analysis, keyword matching, and a tailored match score..." rows={16} style={{ width: "100%", boxSizing: "border-box", fontSize: 13, resize: "vertical" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={handleAnalyze} disabled={loading || !resumeText.trim()} style={{ padding: "11px 28px", background: "#534AB7", color: "#fff", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: loading || !resumeText.trim() ? "not-allowed" : "pointer", opacity: !resumeText.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: 8 }}>
              {loading ? <><span style={{ fontSize: 16, animation: "spin 1s linear infinite" }}>⏳</span>{loadingMsg}</> : <><span style={{ fontSize: 16 }}>🧠</span>Analyze resume</>}
            </button>
            {history.length > 0 && <button onClick={() => setPage("dashboard")} style={{ padding: "11px 20px", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", fontSize: 14, cursor: "pointer", color: "var(--color-text-secondary)" }}>
              <span style={{ fontSize: 16, marginRight: 6 }}>🕘</span>View last analysis
            </button>}
          </div>

          {history.length > 0 && (
            <div style={{ marginTop: "2rem", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.25rem", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Analysis history</h3>
              </div>
              {history.map((h, i) => (
                <div key={h.id} style={{ padding: "10px 1.25rem", borderBottom: i < history.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ margin: "0 0 2px", fontSize: 14 }}>{h.fileName}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{new Date(h.timestamp).toLocaleString()}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 99, background: scoreBg(h.atsScore), color: scoreColor(h.atsScore), fontWeight: 500 }}>ATS {h.atsScore}%</span>
                    {h.matchScore > 0 && <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 99, background: "#E6F1FB", color: "#185FA5", fontWeight: 500 }}>Match {h.matchScore}%</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (page === "dashboard" && analysis) {
    const { sections, skills, jdSkills, matchedSkills, missingSkills, atsScore, roles, aiData } = analysis;
    const matchPct = jdSkills.length > 0 ? Math.round((matchedSkills.length / jdSkills.length) * 100) : 0;

    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
        <header style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "0 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "#534AB7", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 16 }}>📄</span>
            </div>
            <span style={{ fontWeight: 500, fontSize: 15 }}>ResumeAI</span>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)", marginLeft: 4 }}>/ Analysis results</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPage("app")} style={{ fontSize: 13, padding: "5px 12px", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", cursor: "pointer", color: "var(--color-text-secondary)" }}>New analysis</button>
            {user?.role === "admin" && <button onClick={() => setPage("admin")} style={{ fontSize: 13, padding: "5px 12px", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", cursor: "pointer", color: "var(--color-text-secondary)" }}>Admin</button>}
            <button onClick={() => { setUser(null); setPage("login"); setAnalysis(null); }} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Sign out</button>
          </div>
        </header>

        <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem 1rem" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: "1.25rem", flexWrap: "wrap" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "7px 14px", borderRadius: "var(--border-radius-md)", border: activeTab === t.id ? "none" : "0.5px solid var(--color-border-secondary)", background: activeTab === t.id ? "#534AB7" : "var(--color-background-primary)", color: activeTab === t.id ? "#fff" : "var(--color-text-secondary)", fontSize: 13, cursor: "pointer", fontWeight: activeTab === t.id ? 500 : 400, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{ICON_MAP[t.icon]}</span>{t.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: "1.25rem" }}>
                {[
                  { label: "ATS score", value: atsScore.total + "%", color: scoreColor(atsScore.total), bg: scoreBg(atsScore.total) },
                  { label: "Skills found", value: skills.technical.length + skills.soft.length },
                  ...(jdSkills.length > 0 ? [{ label: "JD match", value: matchPct + "%", color: scoreColor(matchPct), bg: scoreBg(matchPct) }, { label: "Missing skills", value: missingSkills.length }] : [{ label: "Tech skills", value: skills.technical.length }, { label: "Soft skills", value: skills.soft.length }]),
                ].map(m => (
                  <div key={m.label} style={{ background: m.bg || "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
                    <p style={{ fontSize: 12, color: m.color ? m.color : "var(--color-text-secondary)", margin: "0 0 4px" }}>{m.label}</p>
                    <p style={{ fontSize: 26, fontWeight: 500, margin: 0, color: m.color || "var(--color-text-primary)" }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {aiData.summary && (
                <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem", marginBottom: "1.25rem" }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 500 }}><span style={{ marginRight: 6, color: "#534AB7" }}>✨</span>AI assessment</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>{aiData.summary}</p>
                  {aiData.strengths?.length > 0 && (
                    <div style={{ marginTop: "1rem" }}>
                      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Key strengths</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {aiData.strengths.map((s, i) => (
                          <span key={i} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, background: "#E1F5EE", color: "#0F6E56", fontWeight: 500 }}>✓ {s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiData.quickWins?.length > 0 && (
                    <div style={{ marginTop: "1rem" }}>
                      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Quick wins to boost your ATS score</p>
                      {aiData.quickWins.map((q, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 14, color: "#EF9F27", flexShrink: 0, marginTop: 2 }}>💡</span>
                          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{q}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
                <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--color-text-secondary)" }}>ATS score</p>
                  <DonutChart value={atsScore.total} color={scoreColor(atsScore.total)} trackColor={scoreBg(atsScore.total)} centerLabel={atsScore.total} centerSub="/ 100" />
                </div>
                {jdSkills.length > 0 && (
                  <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--color-text-secondary)" }}>JD match</p>
                    <DonutChart value={matchPct} color={scoreColor(matchPct)} trackColor={scoreBg(matchPct)} centerLabel={`${matchPct}%`} centerSub="match" />
                  </div>
                )}
                <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-text-secondary)" }}>ATS score breakdown</p>
                  <BarChart data={[
                    { label: "Sections", value: atsScore.breakdown.sections, color: "#534AB7" },
                    { label: "Keywords", value: atsScore.breakdown.keywords, color: "#1D9E75" },
                    { label: "Length", value: atsScore.breakdown.length, color: "#378ADD" },
                    { label: "Skills", value: atsScore.breakdown.skillsCoverage, color: "#D85A30" },
                    { label: "Structure", value: atsScore.breakdown.structure, color: "#D4537E" },
                  ]} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 500 }}>Resume sections detected</h3>
                  {[
                    { key: "summary",        label: "Summary / Objective",    found: !!(sections.summary && sections.summary.length > 0) },
                    { key: "contact",        label: "Contact info",           found: !!(sections.contact?.email || sections.contact?.phone) },
                    { key: "skills",         label: "Technical skills",       found: !!(sections.skills?.length > 0) },
                    { key: "education",      label: "Education",              found: !!(sections.education?.length > 0) },
                    { key: "experience",     label: "Experience / Internship",found: !!(sections.experience?.length > 0) },
                    { key: "projects",       label: "Projects",               found: !!(sections.projects?.length > 0) },
                    { key: "certifications", label: "Certifications",         found: !!(sections.certifications?.length > 0) },
                    { key: "additional",     label: "Additional info",        found: !!(sections.additional?.length > 0) },
                  ].map(({ key, label, found }) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14, color: found ? "#1D9E75" : "#E24B4A", flexShrink: 0 }}>{found ? "✓" : "✕"}</span>
                      <span style={{ fontSize: 13, color: found ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{label}</span>
                      <span style={{ fontSize: 12, marginLeft: "auto", color: found ? "#1D9E75" : "var(--color-text-danger)", fontWeight: found ? 500 : 400 }}>{found ? "found" : "missing"}</span>
                    </div>
                  ))}
                </div>

                <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 500 }}>ATS score factors</h3>
                  {[
                    { key: "sections",       label: "Sections",       max: 25 },
                    { key: "keywords",       label: "Keywords",        max: 35 },
                    { key: "length",         label: "Length",          max: 15 },
                    { key: "skillsCoverage", label: "Skills coverage", max: 15 },
                    { key: "structure",      label: "Structure",       max: 10 },
                  ].map(({ key, label, max }) => {
                    const v = atsScore.breakdown[key] || 0;
                    const pct = Math.round((v / max) * 100);
                    return (
                      <div key={key} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12 }}>{label}</span>
                          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{v}/{max}</span>
                        </div>
                        <div style={{ height: 6, background: "var(--color-background-tertiary)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: pct + "%", background: pct >= 70 ? "#1D9E75" : pct >= 40 ? "#378ADD" : "#EF9F27", borderRadius: 99, transition: "width 0.5s" }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "skills" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 500 }}><span style={{ marginRight: 6 }}>💻</span>Technical skills ({skills.technical.length})</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {skills.technical.length > 0 ? skills.technical.map(s => (
                    <span key={s} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, background: matchedSkills.includes(s) ? "#E1F5EE" : "#EEEDFE", color: matchedSkills.includes(s) ? "#0F6E56" : "#3C3489", fontWeight: 500 }}>{s}</span>
                  )) : <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No technical skills detected. Ensure skills are clearly listed.</p>}
                </div>
              </div>
              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 500 }}><span style={{ marginRight: 6 }}>👥</span>Soft skills ({skills.soft.length})</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {skills.soft.length > 0 ? skills.soft.map(s => (
                    <span key={s} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, background: "#FAEEDA", color: "#633806", fontWeight: 500 }}>{s}</span>
                  )) : <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No soft skills detected.</p>}
                </div>
              </div>
              {missingSkills.length > 0 && (
                <div style={{ gridColumn: "1 / -1", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 500 }}><span style={{ marginRight: 6, color: "#EF9F27" }}>⚠️</span>Missing from JD ({missingSkills.length})</h3>
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-text-secondary)" }}>These skills appear in the job description but not your resume. Consider adding them if you have relevant experience.</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {missingSkills.map(s => (
                      <span key={s} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, background: "#FCEBEB", color: "#791F1F", fontWeight: 500 }}>+ {s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "roles" && (
            <div>
              <p style={{ margin: "0 0 1rem", fontSize: 13, color: "var(--color-text-secondary)" }}>Roles ranked by how well your current skills align. Green = skills you have, gray = gaps to fill.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                {roles.map((r, i) => (
                  <div key={r.role} style={{ background: "var(--color-background-primary)", border: i === 0 ? "2px solid #534AB7" : "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
                    {i === 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#EEEDFE", color: "#3C3489", fontWeight: 500, display: "inline-block", marginBottom: 8 }}>Best match</span>}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, flex: 1, paddingRight: 8 }}>{r.role}</h3>
                      <span style={{ fontSize: 20, fontWeight: 500, color: scoreColor(r.match), flexShrink: 0 }}>{r.match}%</span>
                    </div>
                    <div style={{ height: 5, background: "var(--color-background-tertiary)", borderRadius: 99, marginBottom: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: r.match + "%", background: scoreColor(r.match), borderRadius: 99, transition: "width 0.5s" }}></div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {r.skills.map(s => (
                        <span key={s} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: r.matched.includes(s) ? "#E1F5EE" : "var(--color-background-secondary)", color: r.matched.includes(s) ? "#0F6E56" : "var(--color-text-tertiary)", fontWeight: r.matched.includes(s) ? 500 : 400, border: r.matched.includes(s) ? "none" : "0.5px solid var(--color-border-tertiary)" }}>{s}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return null;
}
