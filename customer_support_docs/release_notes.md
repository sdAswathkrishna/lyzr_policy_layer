# AcmeSoft Release Notes

---

## v3.0.0 — January 15, 2026

### Highlights
This is a major release introducing real-time collaboration, a redesigned UI, and significant performance improvements across all pipeline operations.

### New Features
- **Dark Mode** — Full dark theme across all panels, dashboards, and editors. Toggle via **Settings → Appearance → Theme**
- **Real-Time Collaboration** — Up to 10 users can co-edit pipelines and dashboards simultaneously. Presence indicators show active users. Changes sync in under 500 ms
- **Batch Export** — Export multiple datasets to CSV or JSON in a single operation. Queue up to 50 export jobs from **Data → Batch Export**
- **REST API v2** — New API with OpenAPI 3.1 spec, improved rate limiting (1,000 req/min on Business+), and webhook support for all pipeline events
- **Python 3.12 Engine** — Custom transformation scripts now run on Python 3.12 with full async support and 60% faster execution

### Improvements
- Dashboard load time reduced by 45% via lazy rendering
- SQL editor now supports multi-tab editing
- CSV import parser is 3× faster for files > 100 MB
- MFA enrollment flow redesigned — now takes under 60 seconds

### Bug Fixes
- Fixed crash when opening files larger than 500 MB on Windows
- Resolved memory leak in dashboard widget renderer (affected sessions > 4 hours)
- Fixed date parsing errors for non-US locales (dd/mm/yyyy format)
- Fixed broken pagination in data tables when row count > 10,000
- Resolved XSS vulnerability in the report viewer (security patch — update strongly recommended)

### Breaking Changes
- **API v1 deprecated** — API v1 endpoints will be removed in v3.2.0. Migrate to API v2. See migration guide at docs.acmesoft.com/api-migration
- **Python 2.x scripts no longer supported** in the transformation engine

---

## v2.9.5 — November 20, 2025

### Bug Fixes
- Security patch: fixed reflected XSS vulnerability in the report viewer
- Fixed broken pagination in data tables (> 10,000 rows)
- Improved application startup time by 40% on all platforms

---

## v2.9.0 — September 8, 2025

### New Features
- **Sankey Charts** added to the visualisation library
- **SFTP export destination** for scheduled exports
- **Audit Log Export** — Admins can now download audit logs as CSV from **Settings → Security → Audit Logs**

### Improvements
- BigQuery connector now supports partitioned table reads
- Memory usage in the pipeline runner reduced by 25%

### Bug Fixes
- Fixed pipeline timeout on Snowflake queries > 10 minutes
- Resolved OAuth token refresh failure for Google Workspace SSO

---

## v2.8.0 — June 30, 2025

### New Features
- **Slack Notifications Plugin** — Receive alerts for pipeline failures, export completions, and data threshold breaches
- **Redshift Connector** added
- **Keyboard Shortcuts** — Full keyboard navigation across the pipeline builder

### Bug Fixes
- Fixed Excel plugin crash on files with merged cells
- Resolved chart rendering issue in Safari 17
- Fixed API rate limiter incorrectly blocking valid requests during burst traffic

---

## v2.7.0 — March 14, 2025

### New Features
- **Parquet Import/Export** support added natively (no plugin required)
- **MariaDB Connector** added
- **Data Quality Rules** — Define validation rules on ingested data; flag or reject rows that fail checks

### Improvements
- PostgreSQL connector now supports connection pooling (up to 50 connections)

### Bug Fixes
- Fixed timezone handling in scheduled exports crossing DST boundaries
- Resolved memory spike when importing JSON files with deeply nested objects

---

## Support & Upgrade Path

For upgrade assistance or questions about any release, contact support@acmesoft.com or visit community.acmesoft.com.

Upgrade guides for each major version are published at docs.acmesoft.com/upgrade.
