# AcmeSoft — Frequently Asked Questions

---

## Account & Login

**Q: How do I reset my password?**
A: Go to **acmesoft.com/login** → click **"Forgot password?"** → enter your registered email address → check your inbox for a reset link (valid for 30 minutes). If you don't see it, check your spam folder.

**Q: I'm locked out of my account after too many failed login attempts. What do I do?**
A: Accounts are locked for 15 minutes after 5 failed attempts. Wait 15 minutes and try again. If you still cannot log in, contact support at support@acmesoft.com with your registered email address.

**Q: How do I enable Multi-Factor Authentication (MFA)?**
A: Go to **Settings → Security → Multi-Factor Authentication → Enable**. Scan the QR code with an authenticator app (Google Authenticator, Authy, or 1Password). MFA codes refresh every 30 seconds.

**Q: Can I log in with Google or Microsoft?**
A: Yes. On the login page click **"Sign in with Google"** or **"Sign in with Microsoft"**. Your account must have been created or linked to that provider first. Admins can enforce SSO from **Settings → Security → SSO Configuration**.

**Q: How do I change my email address?**
A: Go to **Settings → Profile → Email** → enter the new address → click **Save**. A verification email is sent to the new address. The change only takes effect after clicking the link in that email.

---

## Installation & Compatibility

**Q: What operating systems does AcmeSoft support?**
A: Windows 10+, macOS 12 (Monterey)+, and Ubuntu 20.04+. Older OS versions are not officially supported.

**Q: Does AcmeSoft have a mobile app?**
A: Not currently. The web dashboard is mobile-responsive and works on tablets and phones via a browser, but there is no native iOS or Android app.

**Q: How do I upgrade from v2.x to v3.0?**
A: Run the v3.0 installer on top of your existing installation. The installer detects the previous version and migrates your workspace, settings, and saved pipelines automatically. Back up your `~/.acmesoft/` folder before upgrading as a precaution.

**Q: The app crashes on startup. What should I do?**
A: Delete the cache folder and restart:
- **Windows**: `%AppData%\AcmeSoft\cache\`
- **macOS/Linux**: `~/.acmesoft/cache/`
If the crash persists, check `~/.acmesoft/logs/error.log` and send it to support@acmesoft.com.

---

## Data & Files

**Q: What file formats can I import?**
A: CSV, JSON, XML, and Parquet natively. Excel (.xlsx) requires the optional **Data Import Plugin** (free, install from **Plugins → Browse → Data Import**).

**Q: Where are my reports saved?**
A: By default, reports save to `~/Documents/AcmeSoft/Reports/`. Change this under **Settings → Paths → Reports Directory**.

**Q: Is there a file size limit for imports?**
A: Starter plan: 500 MB per file. Business plan: 5 GB per file. Enterprise plan: no limit. For files larger than the plan limit, use the **Streaming Import** option via API.

**Q: Can I schedule automatic data exports?**
A: Yes. In any pipeline, click **Schedule → Export** and configure the frequency (hourly, daily, weekly) and destination (local folder, S3, GCS, Azure Blob, or SFTP).

**Q: How do I delete my data?**
A: Go to the dataset → click the three-dot menu → **Delete Dataset**. This is permanent. Deleted data cannot be recovered. Admins can also bulk-delete from the **Admin → Data Management** panel.

---

## Billing & Subscription

**Q: How do I upgrade my plan?**
A: Go to **Settings → Billing → Upgrade Plan** and select your new plan. The change is prorated — you are charged the difference immediately, and your new limits apply right away.

**Q: Can I get a refund?**
A: We offer a 14-day money-back guarantee for new Starter and Business subscriptions. Contact billing@acmesoft.com within 14 days of your first payment. Enterprise contracts are non-refundable but include a 30-day evaluation period before billing begins.

**Q: Does annual billing auto-renew?**
A: Yes. You receive an email reminder 30 days before renewal. Cancel anytime from **Settings → Billing → Cancel Subscription** to stop the next renewal.

**Q: What payment methods are accepted?**
A: Visa, Mastercard, American Express, and ACH bank transfer (US only). Enterprise customers can pay by wire transfer or purchase order.

---

## Integrations & API

**Q: Does AcmeSoft have a REST API?**
A: Yes. Full API documentation is at **docs.acmesoft.com/api**. Authentication uses Bearer tokens generated from **Settings → Integrations → API Keys**.

**Q: Which databases can I connect to directly?**
A: PostgreSQL, MySQL, MariaDB, MongoDB, Snowflake, BigQuery, and Redshift. Additional connectors are available as plugins.

**Q: Is there a Slack integration?**
A: Yes. Install it from **Plugins → Browse → Slack Notifications**. You can receive alerts for pipeline failures, export completions, and threshold breaches.

---

## Support

**Q: How do I contact support?**
A:
- **Email**: support@acmesoft.com
- **Live chat**: Available in-app (bottom-right corner) — Business and Enterprise plans only
- **Phone**: 1-800-ACME-SOFT (Mon–Fri, 9 AM–6 PM ET)
- **Community forum**: community.acmesoft.com

**Q: What is the typical response time?**
A: Starter plan: up to 48 hours. Business plan: within 8 business hours. Enterprise plan: within 2 hours (critical issues: within 30 minutes with a dedicated CSM).
