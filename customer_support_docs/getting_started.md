# AcmeSoft — Getting Started Guide

Welcome to AcmeSoft! This guide walks you through everything you need to get from zero to your first working pipeline in under 30 minutes.

---

## Step 1 — Create Your Account

1. Go to **acmesoft.com/signup**
2. Enter your name, work email, and choose a password (min 10 characters, at least one number and one special character)
3. Verify your email — check your inbox for a message from no-reply@acmesoft.com
4. You are placed on the **Starter plan** (free 14-day trial with Business plan features enabled)

---

## Step 2 — Set Up Your Workspace

On first login, the **Setup Wizard** opens automatically:

1. **Workspace name** — Give your workspace a name (e.g., your company name). This appears in all reports and exports
2. **Time zone** — Select your local time zone. Scheduled jobs run according to this setting
3. **Invite team members** — Optionally invite colleagues now (you can do this later too)
4. **Connect a data source** — Choose from: file upload, database connector, or API endpoint

---

## Step 3 — Import Your First Dataset

### Option A — Upload a File
1. Click **Data → New Dataset → Upload File**
2. Drag and drop your file (CSV, JSON, XML, or Parquet) or click **Browse**
3. AcmeSoft auto-detects the schema — review column names and types
4. Click **Import** — your dataset appears in the **Data Library**

### Option B — Connect a Database
1. Click **Data → New Dataset → Database Connection**
2. Select your database type (PostgreSQL, MySQL, Snowflake, BigQuery, etc.)
3. Enter connection details — host, port, database name, username, password
4. Click **Test Connection** — a green tick confirms success
5. Choose the table or write a SQL query → **Import**

### Option C — REST API Source
1. Click **Data → New Dataset → API Source**
2. Enter the endpoint URL, select HTTP method (GET/POST), and add headers or auth tokens as needed
3. Set the polling interval (e.g., every 15 minutes)
4. Map the JSON response fields to columns → **Save**

---

## Step 4 — Build Your First Pipeline

A pipeline is a sequence of steps that transforms data from source to output.

1. Click **Pipelines → New Pipeline**
2. Give it a name (e.g., "Daily Sales Report")
3. **Add a Source** — select the dataset you imported in Step 3
4. **Add a Transform step** — choose from:
   - **Filter**: Keep only rows matching a condition (e.g., `status = "active"`)
   - **Aggregate**: Group by a column and calculate sum, average, count, etc.
   - **Join**: Merge two datasets on a common key
   - **Formula**: Add a calculated column (e.g., `revenue = price * quantity`)
   - **Python Script**: Write custom transformation logic
5. **Add an Output step** — choose where the result goes:
   - Export to CSV/JSON/Parquet
   - Send to another dataset
   - Feed a dashboard
6. Click **Run Pipeline** → watch each step execute with live progress
7. Click **Save Pipeline**

---

## Step 5 — Create Your First Dashboard

1. Click **Dashboards → New Dashboard**
2. Name it and select a layout (single column, two-column, or free-form)
3. Click **Add Chart**:
   - Select a dataset or pipeline output as the data source
   - Choose chart type (bar, line, pie, table, KPI card, etc.)
   - Drag fields into **X-axis**, **Y-axis**, and **Group By** slots
   - Apply filters and styling in the right panel
4. Add more charts — each can have a different data source
5. Click **Save Dashboard**

### Share a Dashboard
- Click **Share → Get Link** for a read-only public URL
- Click **Share → Invite** to give specific team members access
- Click **Schedule → Email Report** to send a PDF snapshot on a recurring schedule

---

## Step 6 — Set Up Your API Key

For programmatic access (integrating AcmeSoft with your own apps or scripts):

1. Go to **Settings → Integrations → API Keys**
2. Click **Generate New Key**
3. Copy the key — it is only shown once
4. Store it securely (e.g., in a `.env` file, never in source code)
5. Use it in API calls: `Authorization: Bearer YOUR_API_KEY`

Full API reference: **docs.acmesoft.com/api**

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| New pipeline | `Ctrl/Cmd + N` |
| Run pipeline | `Ctrl/Cmd + Enter` |
| Save | `Ctrl/Cmd + S` |
| Search data library | `Ctrl/Cmd + K` |
| Toggle dark mode | `Ctrl/Cmd + Shift + D` |
| Open command palette | `Ctrl/Cmd + Shift + P` |

---

## Getting Help

| Resource | URL / Contact |
|---|---|
| Documentation | docs.acmesoft.com |
| Video tutorials | acmesoft.com/tutorials |
| Community forum | community.acmesoft.com |
| Email support | support@acmesoft.com |
| In-app chat | Bottom-right corner (Business/Enterprise) |
| Status page | status.acmesoft.com |

Your 14-day trial includes access to priority email support. Make the most of it!
