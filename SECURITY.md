# Security Policy

The APEX team takes the security and integrity of our open-source software seriously. This document outlines our vulnerability reporting process, supported versions, and commitment to responsible disclosure.

---

## Supported Versions

Security updates and patches are actively maintained for the following versions:

| Version | Supported | Notes |
|---|---|---|
| `main` (trunk) | :white_check_mark: | Primary development branch; receiving immediate hotfixes. |
| `1.x.x` | :white_check_mark: | Latest stable releases. |
| `< 1.0.0` | :x: | Legacy preview releases; please upgrade to `1.x` or `main`. |

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in APEX, **please do not report it via a public GitHub issue or pull request**. Public disclosure before a fix is available puts our users and downstream deployments at risk.

### Preferred Reporting Method

1. **GitHub Private Vulnerability Advisory**:
   Submit your report privately through [GitHub Security Advisories](https://gitlab.com/pavan9b/Movie-Recommendation-System/security/advisories/new).
2. **Email Disclosure**:
   Alternatively, email the maintainer directly at `pavanbadempet@gmail.com` with the subject line `[SECURITY VULNERABILITY] APEX - <Short Summary>`.

### Information to Include in Your Report

To help us investigate and reproduce the issue rapidly, please provide:
- **Type of vulnerability** (e.g., SQL Injection, Remote Code Execution, Authentication Bypass, Secret Leak, Denial of Service).
- **Affected component(s)** (e.g., FastAPI gateway, Rust SIMD core, Docker Compose environment, Databricks ETL scripts).
- **Step-by-step reproduction instructions** or a minimal Proof of Concept (PoC).
- **Potential impact** and exploitation scenarios.
- Any suggested remediation or patches (if available).

---

## Response Timeline & Commitment

Our maintainers adhere to the following response timeline:

- **Initial Acknowledgment**: Within **48 hours** of report receipt.
- **Triage & Assessment**: Within **5 business days**, confirming severity and scope.
- **Fix & Patch Development**: A fix will be developed in a private security branch and verified with targeted regression tests.
- **Public Disclosure & Release**: Coordinated disclosure within **30 days** of initial confirmation, or earlier if mutually agreed.

---

## Security Best Practices for Deployments

When running APEX in production:
1. **Never commit `.env` files, secrets, or API keys** to version control.
2. **Rotate JWT secret keys and database passwords** periodically.
3. **Run non-root Docker containers** as specified in the production `Dockerfile`.
4. **Use TLS/HTTPS** on public-facing FastAPI and frontend endpoints.
5. **Enable differential privacy** (`backend/data/privacy_budget.json`) when exporting user interaction logs.

---

## Recognition & Hall of Fame

We believe in acknowledging security researchers who help protect the community through responsible disclosure. Researchers who report verified vulnerabilities will be credited in our release notes and Security Hall of Fame (unless anonymity is requested).
