# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Migrated from SQLite to PostgreSQL for production deployment
- Updated build process to generate Prisma client automatically
- Added comprehensive deployment documentation

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

[Unreleased]: https://github.com/tibi-iorga/orbit/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/tibi-iorga/orbit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tibi-iorga/orbit/releases/tag/v0.1.0
