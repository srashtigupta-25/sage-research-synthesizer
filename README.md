# ◆ Sage — AI Research Synthesizer

> **Ask anything. Understand everything.**

Sage takes any research topic and delivers a structured AI-generated intelligence brief in under 45 seconds — built on a fully serverless AWS pipeline.

![Stack](https://img.shields.io/badge/Java-25-orange?style=flat-square) ![AWS](https://img.shields.io/badge/AWS-Serverless-FF9900?style=flat-square) ![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square) ![Bedrock](https://img.shields.io/badge/Claude-Haiku_4.5-6B48FF?style=flat-square) ![CloudFront](https://img.shields.io/badge/CloudFront-CDN-FF9900?style=flat-square)

**🌐 Live Demo:** [https://d1kbvlvilht945.cloudfront.net](https://d1kbvlvilht945.cloudfront.net) · **GitHub:** [sage-research-synthesizer](https://github.com/srashtigupta-25/sage-research-synthesizer)

---

## What Sage Does

Submit any topic — technical, financial, scientific, historical. Sage decomposes it into 3 research vectors, runs them in parallel on Amazon Bedrock, and synthesizes a structured intelligence brief.

**Try:** `"Nvidia investment thesis 2025"` · `"How CRISPR works - 2 page report"` · `"What caused the 2008 financial crisis"`

---

## Architecture

```
POST /reports
     │
     ▼
API Gateway → Cognito Auth → Lambda (Orchestrator)
                                      │
                                      ▼
                          Step Functions: SagePipeline
                          │
                          ├─ State 1: Decompose (Claude Haiku 4.5)
                          │          topic → 3 sub-questions
                          │
                          ├─ State 2: Research × 3 (parallel Map state)
                          │          Claude Haiku 4.5 on each thread
                          │
                          ├─ State 3: Generate Report (Claude Haiku 4.5)
                          │          domain-aware structured brief
                          │
                          ├─ State 4: Generate Images (S3)
                          │
                          └─ State 5: Persist → DynamoDB (status: COMPLETE)

Frontend polls GET /reports/{id} every 3s until COMPLETE
```
---

## AWS Services

| Service | Role |
|---|---|
| API Gateway | REST API — POST /reports, GET /reports/{id}, DELETE /reports/{id} |
| AWS Lambda | 7 serverless functions in Java 25 |
| Step Functions | 5-state chain-of-thought pipeline |
| Amazon Bedrock | Claude Haiku 4.5 — decompose, research, synthesize |
| DynamoDB | Report persistence — on-demand, NoSQL |
| S3 | Image storage |
| Cognito | JWT authentication on all endpoints |

---

## Tech Stack

```
Backend   Java 25 · AWS SDK v2 · Maven · No Spring (pure Lambda handlers)
Frontend  React 18 · Vite · Axios · Amazon Cognito Identity JS
Auth      Cognito User Pools + API Gateway Authorizer
Database  DynamoDB on-demand
Pipeline  Step Functions Standard Workflow (ASL)
AI        Claude Haiku 4.5 via Amazon Bedrock (us-east-1 inference profile)
```
---

## Features

| Feature | Details |
|---|---|
| Any topic | Technical, financial, scientific, historical |
| Custom length | "500 word report", "2 page report", "executive summary" |
| Smart validation | Rejects vague, real-time, personal, inappropriate topics |
| Report history | Persistent via DynamoDB + localStorage |
| Delete reports | Removes from DynamoDB and local cache with confirmation |
| JWT auth | All endpoints secured via Cognito |
| Mobile responsive | Full mobile support |
| Copy to clipboard | One-click report sharing |

---

## Engineering Decisions

**Java 25 over Python** — Strong typing, enterprise AWS SDK v2, matches real-world backend standards. Cold start ~1.5s is acceptable for this use case.

**Step Functions over a single Lambda** — Clean separation of concerns. The Map state runs 3 research threads in true parallel, cutting research time ~60% vs sequential.

**DynamoDB over RDS** — Reports accessed by UUID with no joins needed. On-demand billing means $0 at zero traffic, scales automatically.

**Polling over WebSockets** — 3-second polling is simpler, more reliable, sufficient for 45-second generation. WebSockets add complexity with minimal UX benefit at this scale.

**WAF deferred** — Architecture designed with SageWebACL (Amazon IP reputation list + Core rule set). Deferred deployment to avoid $7/month cost on a portfolio project — a conscious engineering trade-off.

---

## Topic Validation

| Type | Example | Error |
|---|---|---|
| Too short | `"AI"` | TOPIC_TOO_SHORT |
| Too vague | `"life"` | TOPIC_TOO_VAGUE |
| Real-time | `"Apple stock price today"` | REALTIME_DATA_REQUEST |
| Personal advice | `"Should I invest in Tesla"` | PERSONAL_ADVICE_REQUEST |
| Inappropriate | `"How to make bomb"` | INAPPROPRIATE_TOPIC |

---

## Project Structure

```
sage-research-synthesizer/
├── lambdas/src/main/java/com/sage/
│   ├── orchestrator/      POST /reports — validates, writes DynamoDB, starts pipeline
│   ├── decompose/         State 1 — Claude decomposes topic into 3 sub-questions
│   ├── research/          State 2 — parallel research on each sub-question
│   ├── generatereport/    State 3 — synthesizes structured intelligence brief
│   ├── generateimages/    State 4 — image generation
│   ├── persist/           State 5 — writes COMPLETE status to DynamoDB
│   ├── getreport/         GET /reports/{id} — polling endpoint
│   └── deletereport/      DELETE /reports/{id} — removes from DynamoDB
├── frontend/src/
│   ├── App.jsx            All screens and components
│   ├── api.js             API client with JWT injection
│   ├── auth.js            Cognito authentication
│   └── config.js          AWS resource configuration
└── step_functions/
└── state_machine.json ASL pipeline definition
```

---

## Running Locally

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend — build and upload JAR to AWS Lambda
cd lambdas && mvn clean package
# Upload target/sage-lambdas-1.0.jar to each Lambda in AWS Console
```

**AWS resources needed:** DynamoDB table `SageReports`, Cognito User Pool, API Gateway, Step Functions `SagePipeline`, IAM roles `SageLambdaRole` + `SageSFRole`

---

## What I'd Build Next

- Document upload — PDF/Word analysis through the same pipeline
- Real image generation — when AWS activates Nova Canvas
- Export to PDF — one-click download
- Public report sharing — shareable URLs

---

## Author

**Srashti Gupta** · MS Computer Science, Northeastern University · 5+ years backend engineering (NAB, IBM)

[Portfolio](https://srashtigupta-25.github.io) · [LinkedIn](https://linkedin.com/in/srashtigupta)

---

*Built for demonstrating AWS serverless architecture, AI pipeline engineering, and full-stack development.*
