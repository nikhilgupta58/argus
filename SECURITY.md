# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: nikhilkumargupta58@gmail.com  
Subject line: `[SECURITY] Argus - <short description>`

We will acknowledge your report within 2 business days and aim to resolve confirmed vulnerabilities within 90 days of the initial report.

## Coordinated disclosure

We follow a 90-day coordinated disclosure window. After 90 days, we will publish details regardless of patch status, to allow users to take protective action.

We will credit researchers who report valid vulnerabilities (unless they prefer anonymity).

## Scope

The following are in scope:

- Contract DSL parser (injection, bypass, denial-of-service via malformed input)
- Lineage signing and verification (signature forgery, chain manipulation)
- Specialist bundle install (unsigned bundle bypass, TOCTOU on verification)
- CLI argument handling (command injection, path traversal)
- Key storage (at-rest encryption weakness)

The following are out of scope:

- Vulnerabilities in third-party dependencies (report to them directly, then let us know)
- Vulnerabilities requiring physical access to the machine
- Social engineering

## Supported versions

| Version | Supported |
|---------|-----------|
| main    | Yes       |
| < 0.1   | No        |
