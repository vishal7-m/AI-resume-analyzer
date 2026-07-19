# AI Resume Analyzer

A single-file React component that analyzes resumes entirely client-side — no backend, no API calls, no data leaving the browser. It parses raw resume text into structured sections, detects technical/soft skills, computes an ATS-friendliness score, matches against a pasted job description, and ranks the resume against common tech roles.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Required External Dependencies](#required-external-dependencies)
- [Architecture / How It Works](#architecture--how-it-works)
  - [1. Text Normalization](#1-text-normalization)
  - [2. Section Splitting](#2-section-splitting)
  - [3. Skill Extraction](#3-skill-extraction)
  - [4. ATS Scoring](#4-ats-scoring)
  - [5. JD Matching](#5-jd-matching)
  - [6. Role Fit Ranking](#6-role-fit-ranking)
- [Component Structure](#component-structure)
- [Data Reference](#data-reference)
- [Styling / Theming](#styling--theming)
- [Known Limitations](#known-limitations)
- [Roadmap Ideas](#roadmap-ideas)
- [License](#license)

---

## Features

| Feature | Description |
|---|---|
| **Resume Parsing** | Extracts structured sections — summary, skills, education, experience, projects, certifications, additional info, contact — from raw resume text (including badly-formatted PDF-extracted text). |
| **Skill Detection** | Matches resume content against a built-in database of 80+ technical skills and 25+ soft skills, with alias resolution (`ML` → `machine learning`, `K8s` → `kubernetes`, `sklearn` → `scikit-learn`, etc). |
| **ATS Score** | A 0–100 score broken into 5 weighted factors: sections (25), keywords (35), length (15), skills coverage (15), structure (10). |
| **JD Matching** | Paste a job description; the tool diffs required skills against detected resume skills and lists what's missing. |
| **Role Fit Ranking** | Scores the resume against 8 predefined role profiles (ML/AI Engineer, Data Scientist, Backend, Frontend, Full Stack, DevOps/Cloud, Software Engineer, Research Engineer) and ranks by match %. |
| **Section Completeness Checklist** | Visual checklist (found/missing) for each standard resume section. |
| **Tabbed UI** | Overview / Skills / Roles tabs for organizing the analysis output. |

## Tech Stack

- **React** — functional component using `useState`, `useRef`, `useCallback`, `useEffect`
- **Chart.js 4.4.1** — loaded via CDN (`cdnjs`) for score visualizations
- **Tabler Icons** (`ti ti-*` classes) — used throughout for iconography
- **Inline styles + CSS custom properties** — no CSS framework dependency; theming is done via `--color-*` and `--border-radius-*` CSS variables that you define globally

No external npm packages are required beyond React itself.

## Installation

1. Copy `AI-ResumeAnalyzer.jsx` into your project's `src/components/` (or equivalent).
2. Make sure your project has React set up (Create React App, Vite, Next.js, etc.).
3. Add the required external dependencies (see below).
4. Import and render the component.

```bash
# If using Vite
npm create vite@latest my-app -- --template react
cd my-app
# then drop AI-ResumeAnalyzer.jsx into src/components/
npm install
npm run dev
```

## Usage

```jsx
import AIResumeAnalyzer from "./components/AI-ResumeAnalyzer";

function App() {
  return (
    <div className="App">
      <AIResumeAnalyzer />
    </div>
  );
}

export default App;
```

The component is self-contained — it manages its own internal state (resume text, JD text, active tab, computed scores) and doesn't require any props.

## Required External Dependencies

Because the component uses plain `<script>`/CSS-variable theming instead of imported packages, these need to be available in the host page:

1. **Chart.js** — loaded automatically via
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
   ```
   (already injected at the bottom of the component's render output — no action needed if you're rendering this component directly in a browser page).

2. **Tabler Icons** — the component uses classes like `ti ti-check`, `ti ti-x`, `ti ti-code`, `ti ti-users`, `ti ti-alert-triangle`. Add the stylesheet to your `index.html`:
   ```html
   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css">
   ```

3. **CSS custom properties** — define these in your global stylesheet (values below are examples; adjust to your design system):
   ```css
   :root {
     --color-background-primary: #ffffff;
     --color-background-secondary: #f5f5f7;
     --color-background-tertiary: #eeeeee;
     --color-text-primary: #1a1a1a;
     --color-text-secondary: #6b6b6b;
     --color-text-tertiary: #9a9a9a;
     --color-text-danger: #c0392b;
     --color-border-tertiary: #e0e0e0;
     --border-radius-lg: 12px;
   }
   ```

## Architecture / How It Works

### 1. Text Normalization
Raw resume text (especially text extracted from PDFs) frequently loses line breaks entirely, collapsing everything into one long string. The component runs a normalization pass (`extractTextFromContent`) that:
- Normalizes line endings (`\r\n`/`\r` → `\n`)
- Converts bullet characters (`•`) into new lines
- Spaces out pipe separators (`|`)
- Injects a newline before any recognized section header (from a fixed list like `TECHNICAL SKILLS`, `EDUCATION`, `PROJECTS`, etc.) using a generated regex
- Collapses excessive blank lines

### 2. Section Splitting
Once normalized, the text is split into lines and scanned against `SECTION_MAP` — a list of canonical section keys (`summary`, `skills`, `education`, `experience`, `projects`, `certifications`, `additional`) each mapped to the header phrases that identify them (e.g. `"work experience"`, `"internship"`, `"employment"` all map to `experience`). A line only counts as a header if it's short and closely matches one of these names — not just any sentence containing the word — to avoid false positives.

### 3. Skill Extraction
Detected skill text is checked against `SKILLS_DB.technical` and `SKILLS_DB.soft` (80+ and 25+ entries respectively). Before matching, tokens are run through `SKILL_ALIASES` so that common shorthand/variants resolve to a single canonical skill name (e.g. `"ai"`, `"ml"` → `"machine learning"`; `"reactjs"` → `"react"`; `"k8s"` → `"kubernetes"`).

### 4. ATS Scoring
The overall ATS score (0–100) is a weighted sum of 5 factors:

| Factor | Max Points | What it measures |
|---|---|---|
| Sections | 25 | How many standard resume sections are present |
| Keywords | 35 | Density/relevance of detected skill keywords |
| Length | 15 | Whether resume length falls in an ideal range (not too short/long) |
| Skills coverage | 15 | Breadth of technical + soft skills detected |
| Structure | 10 | Formatting cues (bullets, headers, consistent structure) |

Each factor is rendered as its own progress bar in the "ATS score factors" panel, colored green (≥70%), blue (≥40%), or amber (below).

### 5. JD Matching
If a job description is pasted in, the component extracts skill keywords from the JD the same way it does from the resume, then diffs them against the resume's detected skills. Any skill present in the JD but absent from the resume is surfaced under "Missing from JD" with a suggestion to add it if relevant experience exists.

### 6. Role Fit Ranking
`ROLES_MAP` defines 8 role archetypes, each with an associated ideal skill set (e.g. *ML/AI Engineer* → `python, machine learning, deep learning, tensorflow, ...`). For each role, the component computes what % of that role's skill list is present in the resume, then ranks all 8 roles by match percentage. The top match is flagged "Best match"; each role card shows matched skills (highlighted) vs. gaps (greyed out).

## Component Structure

```
AI-ResumeAnalyzer.jsx
├── SKILLS_DB              // technical + soft skill dictionaries
├── SKILL_ALIASES          // shorthand → canonical skill name map
├── ROLES_MAP              // 8 role profiles with associated skill sets
├── extractTextFromContent // normalization + section-splitting + skill extraction
├── SECTION_MAP            // canonical section keys → header phrase variants
└── AIResumeAnalyzer()     // main component
    ├── state: resumeText, jdText, activeTab, sections, skills, atsScore, matchedSkills, missingSkills, roles
    ├── tabs: Overview | Skills | Roles
    └── renders: section checklist, ATS breakdown, skill tag clouds, role match cards
```

## Data Reference

- **`SKILLS_DB.technical`** — Languages, web frameworks, data/ML libraries, databases, DevOps/cloud tools, and misc (REST, GraphQL, Figma, Unity, etc.) — 80+ entries.
- **`SKILLS_DB.soft`** — Leadership, communication, teamwork, problem-solving, adaptability, and 20+ more.
- **`SKILL_ALIASES`** — ~20 shorthand mappings (extendable — add new key/value pairs as needed).
- **`ROLES_MAP`** — 8 roles: ML/AI Engineer, Data Scientist, Backend Developer, Frontend Developer, Full Stack Developer, DevOps/Cloud Engineer, Software Engineer, Research Engineer.

To extend the tool with new skills, roles, or aliases, edit these constants directly at the top of the file — no other logic needs to change.

## Styling / Theming

All visual styling is done via inline `style={{ }}` props referencing CSS custom properties (no Tailwind, no CSS modules, no styled-components). This makes the component portable into any design system as long as the required `--color-*` and `--border-radius-*` variables are defined (see [Required External Dependencies](#required-external-dependencies)). Status colors (green/blue/amber/red for scores) are hardcoded hex values rather than variables, since they carry semantic meaning independent of theme.

## Known Limitations

- **Heuristic-based parsing** — section/header detection relies on pattern matching against a fixed header list; unconventional resume formats or heavily designed resumes (multi-column, graphic-heavy) may not parse cleanly.
- **Static skill/role databases** — skills and role profiles are hardcoded; keeping them current for new frameworks/tools requires manual edits.
- **No real NLP/AI model** — despite the name, matching is keyword/alias-based, not semantic (e.g. it won't recognize "built predictive models" as implying "machine learning" unless the term itself appears).
- **Tech-role focus** — the role map and skill database are oriented toward software/data/ML roles; not tuned for non-technical resumes (marketing, finance, design, etc.).
- **Client-side only** — no persistence; refreshing the page loses the current analysis unless you add your own storage layer.

## Roadmap Ideas

- [ ] PDF/DOCX file upload with in-browser text extraction (e.g. via `pdf.js` / `mammoth.js`)
- [ ] Export analysis as a downloadable PDF/report
- [ ] User-configurable skill/role databases (JSON import)
- [ ] Optional integration with an actual LLM API for semantic (not just keyword) matching
- [ ] Persist analysis history via localStorage

## License

MIT
