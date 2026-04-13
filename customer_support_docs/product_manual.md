# AcmeSoft Product Manual — v3.0

## Overview
AcmeSoft is a cloud-based data management and analytics platform designed for mid-to-large enterprises. It enables teams to ingest, transform, visualize, and export structured and semi-structured data with minimal engineering overhead.

---

## Installation & Setup

### System Requirements
| Component | Minimum | Recommended |
|---|---|---|
| OS | Windows 10, macOS 12, Ubuntu 20.04 | Windows 11, macOS 14, Ubuntu 22.04 |
| RAM | 8 GB | 16 GB |
| Disk | 2 GB free | 10 GB free |
| CPU | 4-core | 8-core |
| Network | 10 Mbps | 100 Mbps |

### Installation Steps
1. Download the installer from **acmesoft.com/download** (choose your OS)
2. Run the installer:
   - **Windows**: Double-click `AcmeSoft-Installer.exe` → follow the prompts
   - **macOS**: Open `AcmeSoft.dmg` → drag to Applications
   - **Linux**: Run `sudo bash installer.sh` in your terminal
3. Launch AcmeSoft and sign in with your organisation credentials
4. On first launch, the Setup Wizard walks you through workspace configuration

### Configuration File
All settings live in `~/.acmesoft/config.yaml`. Key fields:
```yaml
workspace: /path/to/your/data
theme: light          # or dark
auto_save: true
api_endpoint: https://api.acmesoft.com
```

### Setting Your API Key
Navigate to **Settings → Integrations → API Keys → Generate New Key**. Copy the key and paste it into `config.yaml` under `api_key`.

---

## Core Features

### Data Ingestion
- Import CSV, JSON, XML, Parquet, and Excel (.xlsx via plugin)
- Connect to databases: PostgreSQL, MySQL, MongoDB, Snowflake
- REST API ingestion with configurable polling intervals
- Real-time streaming via Kafka or AWS Kinesis connectors

### Data Transformation
- Visual drag-and-drop pipeline builder
- SQL editor with syntax highlighting and auto-complete
- Python scripting engine for custom transformations
- Built-in data type detection and schema inference

### Visualisation
- 20+ chart types: bar, line, scatter, heatmap, treemap, Sankey
- Drag-and-drop dashboard builder
- Scheduled report generation (PDF/PNG export)
- Shareable public links for dashboards (read-only)

### Export
- Export to CSV, JSON, Parquet, Excel
- Schedule exports to S3, GCS, or Azure Blob Storage
- Webhook push on export completion

---

## User Management

### Roles
| Role | Permissions |
|---|---|
| Admin | Full access — manage users, billing, integrations |
| Editor | Create and edit pipelines, dashboards, reports |
| Viewer | Read-only access to dashboards and reports |
| API User | Programmatic access only — no UI |

### Adding Users
1. Go to **Settings → Team → Invite Member**
2. Enter email and select role
3. The user receives an invitation email valid for 48 hours

### Removing Users
1. Go to **Settings → Team**
2. Click the three-dot menu next to the user → **Remove**
3. Their data remains but login is revoked immediately

---

## Security

- All data encrypted in transit (TLS 1.3) and at rest (AES-256)
- SSO supported: Okta, Azure AD, Google Workspace
- MFA enforced for Admin roles by default
- Audit logs retained for 90 days (Enterprise plan: 1 year)
- IP allowlisting available on Business and Enterprise plans

---

## Billing & Plans

| Plan | Price | Users | Storage | Support |
|---|---|---|---|---|
| Starter | $49/mo | Up to 5 | 50 GB | Email |
| Business | $199/mo | Up to 25 | 500 GB | Priority email + chat |
| Enterprise | Custom | Unlimited | Unlimited | Dedicated CSM |

Annual billing gives 20% discount. Upgrade or downgrade anytime from **Settings → Billing**.
