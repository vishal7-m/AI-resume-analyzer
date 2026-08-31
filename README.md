# AI Resume Analyzer

React app that parses a resume, extracts skills, scores it against ATS
criteria, matches it against a job description, and recommends job roles.

## Run locally

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build
npm run preview
```

## Deploy

1. Push this folder to a GitHub repo.
2. Import the repo on [vercel.com](https://vercel.com) or
   [netlify.com](https://netlify.com).
3. Build command: `npm run build` — Output directory: `dist`.
4. Deploy. Auto-redeploys on every push to `main`.

If you add real LLM/API calls later, don't call the API directly from the
browser — add a serverless function (Vercel/Netlify function or a small
Express server) that holds the API key server-side and proxies requests.
