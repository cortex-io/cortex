# Dependency Report: n8n-mcp-server

**Generated**: 2025-11-03T01:09:00Z
**Worker**: worker-scan-001
**Status**: ✅ All dependencies secure and current

---

## Summary

| Metric | Count |
|--------|-------|
| Total Dependencies | 87 |
| Vulnerable | 0 |
| Outdated (Security) | 0 |
| Up-to-Date | 87 (100%) |

---

## Core Runtime Dependencies

### Production Dependencies (2)

| Package | Current | Latest | Status | Notes |
|---------|---------|--------|--------|-------|
| `mcp` | 1.20.0 | 1.20.0 | ✅ Current | Critical SDK - fully patched |
| `httpx` | 0.28.1 | 0.28.1 | ✅ Current | HTTP client - secure version |

**Security Note**: The MCP SDK was previously vulnerable (CVE-2025-53365, CVE-2025-53366) in versions below 1.9.4. Current version 1.20.0 is fully patched and secure.

---

## Development Dependencies (Key Packages)

| Package | Current | Latest | Status | Purpose |
|---------|---------|--------|--------|---------|
| `pytest` | 8.4.2 | 8.4.2 | ✅ Current | Testing framework |
| `pytest-asyncio` | 1.2.0 | 1.2.0 | ✅ Current | Async test support |
| `pytest-cov` | 7.0.0 | 7.0.0 | ✅ Current | Coverage reporting |
| `bandit` | 1.8.6 | 1.8.6 | ✅ Current | Security linter |
| `safety` | 3.6.2 | 3.6.2 | ✅ Current | Vulnerability scanner |
| `mypy` | 1.18.2 | 1.18.2 | ✅ Current | Type checker |
| `ruff` | 0.14.3 | 0.14.3 | ✅ Current | Linter & formatter |

---

## Security & Infrastructure Dependencies

### HTTP & Networking
- `httpx` 0.28.1 - Modern async HTTP client
- `httpcore` 1.0.9 - Low-level HTTP implementation
- `h11` 0.16.0 - HTTP/1.1 protocol implementation
- `httpx-sse` 0.4.3 - Server-sent events support

### Cryptography & Authentication
- `cryptography` 46.0.3 - Secure cryptographic operations
- `pyjwt` 2.10.1 - JSON Web Token implementation
- `authlib` 1.6.5 - OAuth/OpenID client

### Data Validation & Serialization
- `pydantic` 2.12.3 - Data validation using Python type hints
- `pydantic-core` 2.41.4 - Core validation logic
- `pydantic-settings` 2.11.0 - Settings management
- `jsonschema` 4.25.1 - JSON schema validation

---

## Dependency Health Indicators

### ✅ Positive Indicators

1. **Zero Known Vulnerabilities**
   - Safety scan found no CVEs in any dependency
   - All packages are from trusted PyPI sources

2. **Up-to-Date Core Dependencies**
   - MCP SDK at latest version (1.20.0)
   - All security-critical packages current

3. **Quality Development Tools**
   - Type checking (mypy)
   - Security scanning (bandit, safety)
   - Code quality (ruff)
   - Comprehensive testing (pytest suite)

4. **Minimal Dependency Tree**
   - Only 2 production dependencies
   - Lean and focused dependency graph

---

## Dependency Management Best Practices

### Current Practices ✅

- ✅ Minimal production dependencies (2 packages)
- ✅ Clear separation of dev dependencies
- ✅ Using modern package manager (`uv`)
- ✅ pyproject.toml with version constraints
- ✅ Security tools in dev dependencies

### Recommended Enhancements

1. **Automated Dependency Updates**
   ```yaml
   # .github/dependabot.yml
   version: 2
   updates:
     - package-ecosystem: "pip"
       directory: "/"
       schedule:
         interval: "weekly"
       groups:
         security-updates:
           patterns:
             - "mcp"
             - "httpx"
             - "cryptography"
   ```

2. **Pre-Commit Security Checks**
   ```yaml
   # .pre-commit-config.yaml
   repos:
     - repo: https://github.com/pycqa/bandit
       rev: 1.8.6
       hooks:
         - id: bandit
           args: ["-c", "pyproject.toml"]

     - repo: local
       hooks:
         - id: safety
           name: safety
           entry: safety check
           language: system
           pass_filenames: false
   ```

3. **Dependency Pinning Strategy**
   - Consider using `requirements.lock` for reproducible builds
   - Pin exact versions in production
   - Use version ranges for development

---

## License Compliance

All dependencies use permissive licenses compatible with MIT:
- MIT License: Majority of packages
- Apache 2.0: Some infrastructure packages
- BSD: Legacy packages

**No GPL or copyleft dependencies detected** - safe for commercial use.

---

## Dependency Update Policy

### Recommended Schedule

| Priority | Update Frequency | Scope |
|----------|-----------------|-------|
| Security patches | Immediately | All packages |
| Minor versions | Weekly | Production dependencies |
| Major versions | Monthly (review) | All packages |
| Dev tools | As needed | Development dependencies |

### Security Update Process

1. **Automated Detection**: Dependabot creates PR
2. **Automated Testing**: CI runs test suite
3. **Security Review**: Check changelog for security notes
4. **Deploy**: Merge if tests pass

---

## Conclusion

The n8n-mcp-server project demonstrates **excellent dependency management**:

- ✅ Minimal and focused dependency tree
- ✅ All packages secure and up-to-date
- ✅ Quality development tools in place
- ✅ No licensing concerns

**No immediate action required.** Consider implementing automated dependency updates (Dependabot/Renovate) to maintain this strong posture.

---

## Detailed Dependency List

<details>
<summary>Click to expand full dependency list (87 packages)</summary>

### Production & Core
1. mcp==1.20.0
2. httpx==0.28.1
3. httpcore==1.0.9
4. httpx-sse==0.4.3
5. h11==0.16.0
6. anyio==4.11.0
7. sniffio==1.3.1
8. idna==3.11
9. certifi==2025.10.5
10. charset-normalizer==3.4.4

### Data Validation
11. pydantic==2.12.3
12. pydantic-core==2.41.4
13. pydantic-settings==2.11.0
14. python-dotenv==1.2.1
15. typing-extensions==4.15.0
16. annotated-types==0.7.0

### Security & Testing
17. bandit==1.8.6
18. safety==3.6.2
19. pytest==8.4.2
20. pytest-asyncio==1.2.0
21. pytest-cov==7.0.0
22. pytest-mock==3.15.1
23. coverage==7.11.0

### Development Tools
24. mypy==1.18.2
25. mypy-extensions==1.1.0
26. ruff==0.14.3
27. typing-inspection==0.4.2

### Cryptography
28. cryptography==46.0.3
29. cffi==2.0.0
30. pycparser==2.23
31. pyjwt==2.10.1
32. authlib==1.6.5

### Utilities & Infrastructure
33. click==8.3.0
34. rich==14.2.0
35. typer==0.20.0
36. jinja2==3.1.6
37. markupsafe==3.0.3
38. packaging==25.0
39. tomlkit==0.13.3

...and 48 more transitive dependencies

</details>

---

*Generated by worker-scan-001*
*Part of Commit-Relay Security Master*
