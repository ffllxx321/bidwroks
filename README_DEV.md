# BidWorks MVP - Developer Instruction Sheet (`README_DEV.md`)

Welcome to the **BidWorks MVP** engineering workspace. This document specifies setup workflows, directory standards, database tables, and core coding conventions mapped out for continuous integration.

---

## 1. Technological Stack & Decisions

Our MVP implements **Option A (Fast MVP First)** specified in `docs/technical-selection.md`:
*   **Web Front**: React 19 + TypeScript + Vite 6 + Tailwind CSS (using standard Brutalist high-contrast typography).
*   **Web Back**: Express + Node.js. PostgreSQL is the mandatory target database for pilot and production environments (requiring pgvector extension), while SQLite is strictly limited to local development fallback in development envs. Silent database fallback in pilot/production is prohibited and will trigger a fatal startup crash.
*   **AI Gateway**: Pluggable adapter router (`MiniMax-M2.7`, `Google GenAI SDK`, or `MockAIProvider`).
*   **Storage Directory Workspace**: Static files are stored inside isolated physical directories, versioned via database links. Large file contents are never stored inside the database. NAS or MinIO is used in production.
*   **Caching & Task Queue**: Redis is deployed alongside the app to manage async document processing tasks and handle concurrency locks. It does not store master data.

---

## 2. Directory Layout & boundaries

The workspace is structured into clear boundaries:

```text
├── backend/                  # RESTful Node API Service Core
│   └── src/
│       ├── common/           # Custom credential express interceptors
│       ├── config/           # Safe ENV variables parser
│       ├── database/         # Schema model type specifications
│       └── modules/
│           ├── ai/           # Pluggable AI Client Gateway and adapters
│           ├── audit-logs/   # Impeccable action auditing
│           └── permissions/  # Active Access Control lists mapping
├── frontend/ (src/)          # Single Page App interface
│   └── src/
│       ├── app/              # Navigation headers and layout wrappers
│       ├── pages/            # View components (Login, Projects, etc.)
│       └── types/ / types.ts # Shared typings
├── migrations/               # Database SQL tables schemas (SQLite/PostgreSQL)
├── scripts/                  # Task automation utilities (Backup DB)
├── storage/                  # Protected folder staging physical files (v1, v2)
└── tests/                    # Project diagnostic suite
```

---

## 3. Implemented Database Schema Table Registry

Defined in `/migrations/202605200000_init_schema.sql`:
1.  `users` — Core credential and operational details.
2.  `roles` & `user_roles` — Granular role identifiers.
3.  `projects` — Multi-tenant workspace separation.
4.  `project_members` — Restricts access to allocated professional teams.
5.  `project_master_data` — Central repository of record metrics.
6.  `master_data_changes` — Impeccable logger capturing manual or AI alterations.
7.  `audit_logs` — Monitors user transactions and logins.
8.  `documents` & `document_versions` — Manages uploaded version sequences.

---

## 4. Fundamental Development Guidelines

All developers are strictly forced to comply with these rules during iteration phases:

### Rule 1: Structural Numerics Storage
Do not write measurements or durations directly with strings in the database. You must separate numbers from units:
*   **Store Area**: `grossFloorAreaValue` (REAL) and `grossFloorAreaUnit` (TEXT, e.g. `㎡`).
*   **Store Duration**: `totalDurationValue` (INTEGER) and `totalDurationUnit` (TEXT, e.g. `日历天`).

### Rule 2: In-File Version Archiving (Never Overwrite)
Raw files are protected. Overwriting past file names on disks is disallowed.
*   Every upload emits a fresh version record in `document_versions` pointing to newly generated isolated paths (e.g. `storage/uploads/proj-1/task-5_v2.pdf`).
*   Past indexes are flagged as `isLatest = false` or `status = "Obsolete"`.

### Rule 3: Isolation of AI Reading of Sensitive Assets
Confidential files (`isSensitive = true`) are physically segregated.
*   AI Slice/RAG tasks throw `AI_PERMISSION_DENIED_EXCLUSION` unless administrative overriding is enabled.
*   Gateway inputs force source footnote citations `citations: Array<{ sourceFileName, sourcePage, sourceParagraph }>` before writing updates.

---

## 5. Development Setup & Launch

### Quick Testing Checks (Diagnostics)
To run the standard integrated sandbox validation of numerical mappings, AI isolations, and permissions:
```bash
RUN_DIAGNOSTICS=true npx tsx tests/skeleton.test.ts
```

### Server Development Launch
```bash
npm run dev
```

### Production Build compilation
To perform dry-runs of Vite compiling and Express servers packaging:
```bash
npm run build
```
