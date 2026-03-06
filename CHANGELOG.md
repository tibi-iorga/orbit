# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-03-07

### Added
- **Multi-tenancy** — full Organisation model with Membership, Invitation, and OrganizationIdentityProvider; all data is scoped to an org; bootstrap owner email/name/slug configurable via env vars
- **Role-based access control** — `owner`, `admin`, `editor`, `viewer` roles enforced on every API route via `getRequestContext` / `hasMinimumRole`
- **Users & invitations** — `/settings/users` page and `/api/users` route for managing org members and sending invites
- **SSO / Auth0** — Auth0 OIDC provider replaces credentials in production; dev bypass via `CredentialsProvider` with `DEV_AUTH_EMAIL` / `DEV_AUTH_PASSWORD` env vars
- **Ideas** — new `Idea` model; `/ideas` page for creating, searching, and linking ideas to opportunities; `IdeaOpportunity` junction table
- **Departments** — `Department` model with product-line ownership; `/api/departments` CRUD; bidirectional dept ↔ product assignment in both modals
- **Goals** — `Goal` model and `/api/goals` CRUD for organisation-level OKRs
- **Personas** — `Persona` model with `PersonaProduct` mapping; `/api/personas` CRUD
- **Company settings page** — `/settings/company` with org name/description editor, "Import from website" (scrapes and AI-fills description), departments tab, and users tab
- **Opportunity grouper** — `lib/opportunity-grouper.ts` for cosine similarity clustering of ideas into opportunities with AI title generation (max 150 chars)
- **Semantic routing** — `lib/semantic.ts` adjudicates new feedback: route to existing opportunity, create new opportunity, or no match
- **Feedback processor** — `lib/feedback-processor.ts` and `/api/feedback/process` for background per-item semantic processing
- **Extract feedback from import** — `/api/import/extract-feedback` route for pulling structured feedback out of unstructured import rows
- **Opportunity merge preview** — `/api/opportunities/merge/preview` returns a diff before committing a merge
- **Similar opportunities** — `/api/opportunities/[id]/similar` returns semantically close opportunities
- **UI component library** — `src/components/ui/` with `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Chip`, `Modal`, `Card`, `Spinner`, `EmptyState`, `FormField`, `Divider`, `Avatar`, `Text`
- **`cn` utility** — `src/lib/cn.ts` for conditional Tailwind class merging
- **`request-context.ts`** — `getRequestContext()` helper returns authenticated user + org + role from JWT; used by all API routes
- **Product modal: "Managed by"** — department selector in Add/Edit Product modal; empty state pointing to Company settings when no departments exist
- **Product settings: tree hierarchy** — `ProductsSettings` extracted to its own component; clean recursive tree with `border-l` connector lines; child cards suppress redundant "Parent:" label

### Changed
- **Opportunity status** — changed from `draft / approved / on_roadmap / rejected` to `not_on_roadmap / on_roadmap / archived`; roadmap page filters by `on_roadmap`
- **Opportunity title generation** — AI prompt now specifies "max 150 characters"; safety truncation aligned to 150 chars (was 120)
- **Auth bootstrap** — org name/slug/owner email driven by `BOOTSTRAP_ORG_NAME`, `BOOTSTRAP_ORG_SLUG`, `BOOTSTRAP_OWNER_EMAIL` env vars; defaults are generic (`My Organisation`, `admin@example.com`)
- **Placeholder text** — removed all Cera/DCP-specific placeholder copy from input fields; replaced with generic examples
- **Textarea** — globally resizable vertically (`resize-y`) via `ui/input.tsx`
- **Products API** — `GET /api/products` returns `departmentId` in flat list; POST/PATCH accept and validate `departmentId`
- **"Import from website"** — uses Chrome User-Agent + proper Accept headers; auto-prepends `https://` if omitted; descriptive errors for timeout vs DNS failure

### Removed
- Feedback count on product cards (stale data model reference)

## [0.4.0] - 2026-02-24

### Added
- Opportunities — full opportunity management with detail panel, create/edit modal, and merge support
- Auto-clustering — AI-powered grouping of feedback into opportunities via OpenAI; review modal before committing clusters
- Link feedback to opportunities — `LinkOpportunityModal` and `LinkFeedbackModal` for bidirectional linking
- Feedback inbox: "Add feedback" button moved from sidebar to page header as a primary action
- Feedback inbox: description preview — table rows show bold title + truncated description beneath
- Feedback inbox: sortable date column — click Date header to toggle asc/desc (server-side, respects pagination)
- Feedback inbox: datetime on hover — native tooltip reveals full date + time on the date cell
- CSV import: date column mapping — choose which CSV column to use as the feedback creation date
- CSV import: robust date parsing — supports ISO 8601, EU/US formats, and Unix timestamps via date-fns
- AI settings page — configure auto-grouping behaviour (`/settings/auto-group`)
- AI text improvement — `POST /api/ai/improve-text` endpoint for in-place text suggestions
- Feedback PATCH endpoint — `PATCH /api/feedback/[id]` for updating individual feedback items
- Manual feedback creation — `POST /api/feedback/manual` for adding feedback without a CSV import
- Opportunities: bulk delete and preview API routes
- Dimension archiving — archive dimensions without deleting; excluded from scoring
- N/A scoring — dimensions can be marked N/A per feedback item; excluded from combined score
- Scored-count guard — prevents deleting a dimension that has been scored by any feedback item

### Changed
- Feedback page header — two-row layout: title + CTAs on top, status tabs + search + product filter below
- Product filter — replaced "Clear filters" button with an × icon on the dropdown
- Import modal preview — reduced to 1 row for clarity
- Sidebar — removed "Add feedback" nav item; focuses on navigation only
- Scoring dimensions — added `direction` field (`benefit` / `cost`) for signed scoring
- Prisma schema — updated for opportunities, opportunity links, dimension archiving, and N/A scores

### Fixed
- Date sort was page-scoped — sorting now happens in Postgres before pagination, not client-side
- FTS ORDER BY direction — sort direction correctly applied as tiebreaker after relevance rank
- TypeScript: implicit `any[]` on `feedbackItems` in `feedback/route.ts`
- Vercel build: missing module — new components (`AutoClusterReviewModal` etc.) now committed

## [0.3.0] - 2026-02-20

### Changed
- Migrated from SQLite to PostgreSQL for production deployment
- Updated build process to generate Prisma client automatically
- Removed SQLite-specific webpack configuration

### Added
- Comprehensive deployment documentation (DEPLOYMENT.md, SETUP.md)
- Database setup scripts for bash and PowerShell
- Migration commands (db:migrate, db:migrate:deploy)
- Prisma Studio command (db:studio)
- GitHub Actions CI workflow
- CONTRIBUTING.md for development workflow
- DATABASE_URL environment variable requirement

## [0.2.0] - 2026-02-20

### Added
- Product hierarchy management (Products model and CRUD)
- Import management page with delete functionality
- Column preview table in import flow
- Product selection in import workflow
- Product filtering in features list
- Collapsible Products and Settings sections in sidebar
- Import button as modal dialog
- Design system with primary color palette
- Settings reorganized with tabs (Evaluation Criteria, Product Portfolio, Imports)

### Changed
- Import page converted to modal dialog
- Navigation restructured: Products at top, Settings with sub-items
- Import button uses primary color (primary-600)
- Settings page split into sub-pages with tab navigation

### Fixed
- Improved error handling in Products API
- Fixed JSON parsing errors with proper error responses
- Enhanced import validation and warnings

## [0.1.0] - 2026-02-20

### Added
- Initial release
- User authentication (NextAuth with credentials)
- CSV import functionality
- Feature scoring against configurable dimensions
- AI-powered auto-clustering
- Cluster management (rename, merge, move features)
- Report generation with AI summaries
- Dimension management (CRUD operations)
- Server-side pagination for features
- Optimistic UI updates for scoring
- Database schema with Prisma (SQLite)

[Unreleased]: https://github.com/tibi-iorga/orbit/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/tibi-iorga/orbit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tibi-iorga/orbit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/tibi-iorga/orbit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/tibi-iorga/orbit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tibi-iorga/orbit/releases/tag/v0.1.0
