# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

UIGen is an AI-powered React component generator. Users describe components in natural language via a chat interface, Claude generates React code using tool calls (file create/edit/delete), and a live preview renders the result in a sandboxed iframe.

## Commands

```bash
npm run setup          # Install deps + generate Prisma client + run migrations
npm run dev            # Next.js dev server with Turbopack (localhost:3000)
npm run build          # Production build
npm run lint           # ESLint
npm test               # Vitest (all tests)
npx vitest run src/lib/__tests__/file-system.test.ts  # Single test file
npm run db:reset       # Reset SQLite database (destructive)
npx prisma generate    # Regenerate Prisma client after schema changes
npx prisma migrate dev # Create/apply migrations
```

Note: `node-compat.cjs` is required via NODE_OPTIONS in scripts to fix Node 25+ SSR compatibility (removes non-functional global localStorage/sessionStorage).

## Architecture

### Core Data Flow

1. User sends message → `/api/chat` route → Claude (or mock provider) responds with streaming tool calls
2. Tools (`str_replace_editor`, `file_manager`) modify a **virtual filesystem** (in-memory, no disk I/O)
3. File changes trigger Babel JSX transformation (client-side) → preview renders in sandboxed iframe
4. For authenticated users, messages and file state are persisted to SQLite via Prisma

### Key Modules

- **`src/lib/provider.ts`** — AI provider abstraction. Uses Claude Haiku 4.5 when `ANTHROPIC_API_KEY` is set, otherwise falls back to a mock provider that returns placeholder components.
- **`src/lib/file-system.ts`** — Virtual filesystem implementation. All generated files live in memory, rooted at `/`. Entry point is always `/App.jsx`.
- **`src/lib/prompts/generation.tsx`** — System prompt that instructs Claude to generate React components with Tailwind CSS.
- **`src/lib/tools/str-replace.ts`** — Zod-validated text editor tool (create, view, edit, insert operations).
- **`src/lib/tools/file-manager.ts`** — File rename/delete tool.
- **`src/lib/transform/jsx-transformer.ts`** — Babel JSX transformation and preview HTML generation. Resolves `@/` imports to local virtual files.
- **`src/lib/contexts/`** — React contexts for file system state (`file-system-context.tsx`) and chat/AI state (`chat-context.tsx`).

### UI Layout

The main interface (`src/app/main-content.tsx`) is a resizable split panel:
- **Left (35%)**: Chat interface (`src/components/chat/`)
- **Right (65%)**: Tabbed preview (iframe) and code editor (Monaco + file tree)

### Auth & Persistence

- JWT sessions in httpOnly cookies (7-day expiry), bcrypt password hashing
- Prisma + SQLite with two models: `User` and `Project`
- Project stores messages and virtual filesystem as serialized JSON
- Anonymous users get localStorage-based tracking via `anon-work-tracker.ts`
- Middleware protects `/api/projects` and `/api/filesystem` routes

## Tech Stack

- Next.js 15 (App Router), React 19, TypeScript 5
- Tailwind CSS v4 (PostCSS-first, no `tailwind.config` file), Shadcn/ui (Radix-based)
- Vercel AI SDK + `@ai-sdk/anthropic`
- Prisma 6 with SQLite
- Monaco Editor, Babel Standalone (client-side JSX transform)
- Vitest 3 + Testing Library (jsdom environment)

## Environment Variables

- `ANTHROPIC_API_KEY` — Optional. Without it, the app uses a mock AI provider.
- `JWT_SECRET` — Optional. Defaults to `"development-secret-key"` in dev.

## Path Aliases

`@/*` maps to `src/*` (configured in tsconfig.json).
