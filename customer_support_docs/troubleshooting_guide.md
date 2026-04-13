# AcmeSoft Troubleshooting Guide

---

## Login & Authentication Issues

### "Invalid credentials" error on correct password
1. Ensure Caps Lock is off
2. Try resetting your password at acmesoft.com/login → "Forgot password?"
3. If using SSO (Google/Microsoft), click the SSO button — do not type credentials manually
4. Check with your Admin whether your account is active (**Settings → Team**)

### MFA code not accepted
- Ensure your device clock is accurate (MFA codes are time-based; a clock drift of > 30s causes failures)
- On macOS/Linux: `sudo ntpdate -u time.apple.com` to sync your clock
- On Windows: **Control Panel → Date and Time → Internet Time → Update Now**
- If the issue persists, ask your Admin to reset your MFA under **Settings → Team → [your name] → Reset MFA**

### SSO login redirects to error page
- Confirm your email domain is included in the SSO configuration (**Settings → Security → SSO**)
- Clear browser cookies and cache, then retry
- Try an incognito/private window to rule out browser extension interference

---

## Installation & Startup Issues

### App crashes immediately on startup
1. Delete the cache directory:
   - **Windows**: `%AppData%\AcmeSoft\cache\`
   - **macOS**: `~/Library/Application Support/AcmeSoft/cache/`
   - **Linux**: `~/.acmesoft/cache/`
2. Restart the application
3. If the crash continues, check the error log at `~/.acmesoft/logs/error.log`
4. Send the log file to support@acmesoft.com

### "Insufficient permissions" error during Linux installation
Run the installer with `sudo`:
```bash
sudo bash installer.sh
```
Ensure the target directory is writable by the current user after installation.

### App won't open on macOS ("damaged or can't be opened")
This is a Gatekeeper warning. Run:
```bash
xattr -cr /Applications/AcmeSoft.app
```
Then try opening again.

---

## Data Import Issues

### Import fails with "unsupported format" error
- Check the file extension. AcmeSoft natively supports: `.csv`, `.json`, `.xml`, `.parquet`
- Excel (`.xlsx`) requires the **Data Import Plugin** — install from **Plugins → Browse → Data Import**
- For other formats, export your data to CSV first

### CSV import produces garbled text / encoding errors
- The file may use a non-UTF-8 encoding. Re-save it as UTF-8 from your source application:
  - **Excel**: File → Save As → CSV UTF-8 (Comma delimited)
  - **Python**: `df.to_csv('file.csv', encoding='utf-8')`
- In AcmeSoft, go to **Import → Advanced → Encoding** and select the correct encoding (e.g., `latin-1`, `cp1252`)

### Import hangs / times out on large files
- Starter plan limit: 500 MB per file
- Business plan limit: 5 GB per file
- For files exceeding your plan limit, use the **Streaming Import** API endpoint
- Split the file into smaller chunks: `split -l 1000000 large_file.csv chunk_`

### Date columns imported as text
In the import wizard, on the **Schema** step, click the column header → **Change Type → Date** and specify the date format (e.g., `YYYY-MM-DD`, `MM/DD/YYYY`)

---

## Pipeline & Transformation Issues

### Pipeline fails with "Python script error"
1. Click the failing step → **View Logs** to see the full Python traceback
2. Check that all required libraries are installed — AcmeSoft supports the standard data science stack (pandas, numpy, scipy, sklearn). Custom packages can be added via **Settings → Python Environment → Add Package**
3. Ensure your script targets Python 3.12 (Python 2.x is no longer supported since v3.0)

### Pipeline is running slowly
- Enable **Parallel Processing** on the pipeline settings (gear icon → **Execution → Parallel Steps**)
- For Snowflake/BigQuery sources, check if query-pushdown is enabled (**Connector Settings → Push Down Queries**)
- Consider scheduling large pipelines during off-peak hours

### Scheduled pipeline did not run
1. Check **Activity → Scheduled Jobs** for the run status and any error messages
2. Ensure the pipeline is not paused (**Pipeline → Settings → Status: Active**)
3. Verify your workspace timezone setting matches your intended schedule (**Settings → Workspace → Timezone**)

---

## Dashboard & Visualisation Issues

### Chart shows "No data available"
- Check that the pipeline feeding the dashboard has run successfully since the last data update
- Verify the date filter range on the dashboard — it may exclude all records
- Click **Refresh** (circular arrow icon top-right) to force a data reload

### Dashboard loads slowly or freezes
- Reduce the number of charts on a single dashboard (recommended: ≤ 15 charts)
- Enable **Lazy Loading** under **Dashboard Settings → Performance**
- Check your browser's memory usage — close other tabs and retry
- For very large datasets, use aggregation in your pipeline before feeding the dashboard

### Exported PDF/PNG report is blank
- Ensure your browser allows pop-ups from acmesoft.com
- Disable ad-blockers temporarily for the AcmeSoft domain
- Switch to Chrome or Edge if using Firefox or Safari
- If the issue persists, generate the report via the API: `POST /v2/reports/{id}/export`

---

## Network & Connectivity Issues

### "Unable to connect to server" error
1. Check your internet connection
2. Verify acmesoft.com is not blocked by your firewall or proxy — port 443 (HTTPS) must be open
3. For on-premise installs, confirm the AcmeSoft service is running: `systemctl status acmesoft`
4. Check the AcmeSoft status page at **status.acmesoft.com**

### Database connector timeout
- Increase the connection timeout in **Connector Settings → Advanced → Timeout (seconds)**
- Check network latency between your AcmeSoft instance and the database server (should be < 100 ms)
- For Snowflake: verify the warehouse is not suspended (auto-resumes on query but adds ~15s latency)

---

## Error Codes Reference

| Code | Meaning | Resolution |
|---|---|---|
| E1001 | Authentication failure | Check API key / credentials |
| E1002 | Rate limit exceeded | Reduce request frequency; upgrade plan |
| E1003 | File size limit exceeded | Split file or upgrade plan |
| E2001 | Pipeline step timeout | Optimise query or increase timeout setting |
| E2002 | Python script error | Check script logs for traceback |
| E3001 | Export destination unreachable | Check S3/GCS/SFTP credentials and network |
| E4001 | Database connection refused | Check firewall rules and connector settings |
| E5001 | Internal server error | Contact support with the request ID shown |

---

## Collecting Logs for Support

When contacting support, please include:
1. **Error log**: `~/.acmesoft/logs/error.log`
2. **Version**: shown in **Help → About AcmeSoft**
3. **OS and browser version**
4. **Steps to reproduce** the issue
5. **Request ID** (shown in error dialogs) if available

Email to: support@acmesoft.com
