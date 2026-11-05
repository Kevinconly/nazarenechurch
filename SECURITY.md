# Security notes

This document records the application-level controls in this repository and the
cloud controls that must be applied in AWS. The repository cannot configure an
AWS account on its own; see [docs/AWS_PRODUCTION.md](docs/AWS_PRODUCTION.md) for
the deployment checklist.

## Implemented in the application and containers

- **Access control:** server-side RBAC for every admin route; Administrators
  cannot change their own role/status; the last active Administrator cannot be
  disabled or demoted; UUIDs are canonicalized before comparison so PostgreSQL's
  case-insensitive UUID semantics cannot be used to bypass the self-change rule.
- **Authentication:** bcrypt password hashes (never returned by the API), generic
  sign-in errors, dummy hash comparison for unknown accounts, session
  regeneration on sign-in, server-side session expiry, disabled-account checks on
  every protected request, and hashed session/CSRF identifiers at rest.
- **CSRF:** session-bound tokens required for sign-in, sign-out, and all account
  mutations. Tokens are compared by SHA-256 digest.
- **Input validation:** explicit allow-lists for request bodies, UUIDs, roles,
  album slugs, and query parameters; pagination is bounded; JSON bodies are
  limited to 16 KB; unsupported query parameters are rejected.
- **Injection resistance:** all SQL uses parameter binding. No string
  interpolation of request values.
- **Transport and headers:** Helmet security headers, deny framing, no-referrer,
  a strict API CSP, HSTS in production, secure/HTTP-only/SameSite=Lax session
  cookies, and CORS restricted to the configured origin.
- **Abuse resistance:** global API rate limiting plus a stricter sign-in limit,
  request/header/keep-alive timeouts, and a small JSON body limit.
- **Logging:** structured request logs with a correlation ID, method, path
  (without query strings), status, and duration. Passwords, tokens, and bodies
  are never logged.
- **Container hardening:** multi-stage builds, production-only dependencies,
  non-root users, read-only root filesystems, dropped Linux capabilities,
  `no-new-privileges`, and no published backend port in Compose.
- **Supply chain:** committed lockfiles, `npm audit` in CI, Dependabot updates,
  and a Trivy container scan that fails on critical vulnerabilities.

## OWASP Top 10 (2021) mapping

| Risk | App/container control | AWS control still required |
| --- | --- | --- |
| A01 Broken access control | Server-side RBAC, self-change guard, last-admin guard, 404 for unpublished albums, UUID canonicalization | WAF rules, least-privilege IAM, private subnets |
| A02 Cryptographic failures | TLS-verified PostgreSQL, bcrypt, hashed session/CSRF values, secure cookies, HSTS | ACM certificates, KMS, Secrets Manager, encrypted RDS/EBS |
| A03 Injection | Parameterized SQL, body/query/param validation, 16 KB JSON limit | WAF managed rule groups, RDS parameter group hardening |
| A04 Insecure design | Rate limits, bounded pagination, denied-action tests, no self-service role escalation | Abuse detection, quotas, architecture review |
| A05 Security misconfiguration | Helmet, strict CORS, disabled `X-Powered-By`, non-root read-only containers, no dev fixtures in production builds | AWS Config, Security Hub, S3 block-public-access, IMDSv2 |
| A06 Vulnerable components | Lockfiles, `npm audit`, Dependabot, Trivy scan, pinned base images | ECR image scanning, patch pipelines |
| A07 Identification/auth failures | Sign-in rate limit, generic errors, session rotation, expiry, disabled-account recheck | Cognito/WAF bot controls if exposed publicly; MFA is not yet implemented |
| A08 Software/data integrity | Reproducible `npm ci`, CI build before deploy, immutable image tags/digests | Code signing, ECR tag immutability, signed commits |
| A09 Logging/monitoring failures | Structured logs and request IDs, no secret logging | CloudWatch Logs, alarms, CloudTrail, GuardDuty |
| A10 SSRF | Media URLs are restricted to HTTP(S) in the frontend; the API does not fetch user-supplied URLs | Egress restrictions, VPC endpoints, WAF, no public S3 buckets |

## AWS-specific attack classes

These are operational controls; they are not code changes:

1. **Credential theft / over-privileged roles:** use IAM task roles, no long-lived
   AWS keys in containers, and separate deploy/runtime roles.
2. **Public database exposure:** place RDS in private subnets, restrict security
   groups to the backend task, and require TLS.
3. **DDoS and bot abuse:** attach AWS WAF and Shield Standard to the ALB; add
   rate-based rules at the edge.
4. **Secret leakage:** store `DATABASE_URL` and `SESSION_SECRET` in Secrets
   Manager or SSM SecureString, never in images, Compose files, or Git.
5. **Container escape / lateral movement:** run Fargate or hardened EC2, drop
   capabilities, use read-only filesystems, and keep tasks in private subnets.
6. **Supply-chain compromise:** scan images in ECR, deploy by digest, and use
   immutable tags.
7. **Data exfiltration:** encrypt RDS and backups with KMS; restrict egress with
   security groups and VPC endpoints.
8. **Account takeover:** enable CloudTrail, GuardDuty, Security Hub, and MFA on
   AWS identities; alert on root use and IAM changes.
9. **Log tampering:** send logs to CloudWatch with retention and restrict write
   access to the logging role.
10. **Misconfigured storage:** if uploads are added, use private S3 buckets,
    block public access, use presigned URLs, validate file signatures, and scan
    uploads before publishing.

## Known gaps before public production use

- File uploads are **not implemented**. Do not add an upload endpoint without a
  storage design (S3 + presigned URLs), server-side content-type/magic-byte
  validation, size limits, malware scanning, and image re-encoding.
- Single-photo public links and custom/share-token albums are **not
  implemented**. Only published album slugs and their media lists are public.
- Server-side search/filtering is **not implemented**. The current search runs in
  the browser over the frontend's local album records.
- Password reset, invitations, email verification, MFA, and a durable
  administrative audit trail are **not implemented**.
- The public frontend currently reads a local, empty published-album record set;
  it is not yet wired to the live album API. See the README capability table.

## Reporting

Report a suspected vulnerability privately to the repository owner. Do not open
a public issue containing exploit details, credentials, or production data.
