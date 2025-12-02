# SoftGate Frontend

Serverless console By SoftGate (custom FaaS). Built with Next.js + Tailwind CSS + shadcn/ui to visualize the async queue and isolation architecture.

## Structure
- `softgate/` – Next.js app source
- `softgate_development_plan.md` – 10-phase delivery plan and acceptance criteria

## Current progress (Phase 1)
- Project scaffolded with Next.js (App Router), TypeScript, Tailwind CSS (v4), shadcn/ui (neutral theme)
- Baseline components installed: Button, Input, Card
- Responsive 3-panel layout (20/50/30 split) with placeholders for Monaco editor and run panel

## Getting started
1) Prereq: Node 18+
2) Install deps: `cd softgate && npm install`
3) Run dev server: `npm run dev` then open http://localhost:3000
4) Lint: `npm run lint`

## Notes
- App metadata set to “SoftGate Console”
- Monaco editor and state management land in later phases (see plan)
