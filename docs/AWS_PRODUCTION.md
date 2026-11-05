# AWS production deployment

This is a reference deployment for the containers in this repository. It is not
an automated AWS provisioning stack: apply these controls in the target account
with your infrastructure tooling (Terraform, CDK, CloudFormation, or the console)
and review them against the AWS Well-Architected Framework.

## Reference architecture

```
Internet
  -> Route 53
  -> AWS WAF + Shield Standard
  -> Application Load Balancer (ACM TLS, HTTP -> HTTPS redirect)
  -> ECS Fargate: frontend (nginx, private subnet)
       -> ECS Service Connect DNS: backend:3001
  -> ECS Fargate: backend (Node API, private subnet)
       -> RDS PostgreSQL (private subnets, TLS required)
       -> Secrets Manager (DATABASE_URL, SESSION_SECRET)
       -> CloudWatch Logs
```

Only the ALB is public. The frontend and backend tasks have no public IPs. The
database is not reachable from the internet.

## 1. Build and publish images

Images are built in CI and can be published to ECR. Deploy by immutable digest,
not by a mutable tag.

```sh
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -t "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/nazarene-backend:<sha>" ./backend
docker build -t "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/nazarene-frontend:<sha>" ./frontend
docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/nazarene-backend:<sha>"
docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/nazarene-frontend:<sha>"
```

Enable ECR scan-on-push and tag immutability.

## 2. Database

- Use RDS for PostgreSQL in private subnets, with storage encryption (KMS),
  automated backups, deletion protection, and a security group that only accepts
  TCP 5432 from the backend task security group.
- Require TLS. The app verifies the server certificate. If the RDS CA is not in
  the Node trust store, mount the CA bundle into the backend task and set
  `DATABASE_SSL_CA_FILE` to that path.
- Create a dedicated database role for the application. It needs DML on the
  application tables and the sequence/functions used by the schema; it does not
  need superuser or database-owner rights after migrations.
- Run migrations as a one-off ECS task using the backend image:

```sh
node dist/db/migrate.js
```

- Provision the first Administrator as a one-off interactive task (never as a
  command-line password argument):

```sh
node dist/auth/provisionAdmin.js
```

## 3. Secrets

Store these in Secrets Manager (or SSM SecureString) and inject them into the
backend task definition. Do not put them in the image, environment files in Git,
or build arguments.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL with TLS enabled |
| `SESSION_SECRET` | At least 32 random bytes, unique per environment |
| `FRONTEND_ORIGIN` | Exact public HTTPS origin, e.g. `https://archive.example.org` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY_HOPS` | `2` for ALB + nginx, or the exact trusted chain |
| `DATABASE_SSL_CA_FILE` | Optional path to a mounted CA bundle |

A task role should only have permission to read the specific secret ARNs it
needs. Do not use an access key in the container.

## 4. TLS and cookies

- Terminate TLS at the ALB with an ACM certificate. Redirect HTTP to HTTPS at the
  listener.
- `NODE_ENV=production` enables Secure cookies and HSTS. The session cookie is
  HTTP-only and SameSite=Lax.
- Set `FRONTEND_ORIGIN` to the exact HTTPS origin. CORS does not allow arbitrary
  origins.
- If CloudFront sits in front of the ALB, update `TRUST_PROXY_HOPS` to the exact
  number of trusted proxies and ensure forwarded headers are overwritten, not
  appended by untrusted clients.

## 5. Edge protection

Attach AWS WAF to the ALB (or CloudFront) with:

- AWS managed rule groups for common web attacks and known bad inputs.
- A rate-based rule for `/api/auth/sign-in` and a broader rule for `/api/*`.
- Bot control or CAPTCHA only if it does not block legitimate archive visitors.
- Shield Standard is enabled automatically; consider Shield Advanced for
  high-profile public endpoints.

The application also rate limits in-process. For multiple backend tasks,
front-load rate limiting at WAF/ALB or use a shared Redis store; in-memory limits
are per task.

## 6. Network and IAM

- Put the ALB in public subnets and all tasks/database in private subnets.
- Backend security group: inbound 3001 only from the frontend task security
  group.
- Frontend security group: inbound 8080 only from the ALB security group.
- RDS security group: inbound 5432 only from the backend task security group.
- Use VPC endpoints for ECR, CloudWatch Logs, Secrets Manager, and S3 where
  possible so tasks do not need public egress.
- Require IMDSv2 where EC2 launch types are used.
- Separate deploy and runtime roles; require MFA for human AWS access.

## 7. Monitoring and response

- Send container logs to CloudWatch Logs with a retention policy. The API emits
  JSON logs with `requestId`, method, path, status, and duration.
- Alarm on sign-in 401/429 spikes, 5xx rates, task restarts, RDS CPU/storage,
  and WAF block-rate changes.
- Enable CloudTrail in all regions, GuardDuty, Security Hub, and AWS Config rules
  for public S3 access, unencrypted volumes, and open security groups.
- Keep RDS backups and test restore procedures.

## 8. Local container smoke test

Docker is not installed on every development machine. On a machine with Docker:

```sh
cp .env.example .env
# Edit .env: set a real DATABASE_URL, SESSION_SECRET, FRONTEND_ORIGIN, TRUST_PROXY_HOPS=1

# Local plain-HTTP smoke test only:
#   NODE_ENV=development
#   SESSION_COOKIE_SECURE=false
#   FRONTEND_ORIGIN=http://localhost:8080
docker compose build
docker compose run --rm backend node dist/db/migrate.js
docker compose run --rm backend node dist/auth/provisionAdmin.js
docker compose up -d
```

The frontend is then on `http://localhost:8080` and proxies `/api` to the
backend. Because production mode sets Secure cookies, do not use the Compose
stack over plain HTTP for real accounts; terminate TLS in front of it (or use a
local HTTPS proxy) for authenticated testing. The local smoke-test overrides
above are not suitable for production.

## 9. Before go-live checklist

- [ ] Images built by CI, scanned, pushed to ECR, and deployed by digest.
- [ ] RDS private, encrypted, backed up, and reachable only from the backend.
- [ ] Secrets are in Secrets Manager; no AWS keys in the task.
- [ ] ALB has ACM TLS, HTTP redirect, and WAF managed/rate rules.
- [ ] `FRONTEND_ORIGIN`, `TRUST_PROXY_HOPS`, and `SESSION_SECRET` are correct.
- [ ] Migrations applied and the initial Administrator provisioned.
- [ ] CloudWatch alarms, CloudTrail, GuardDuty, and Security Hub enabled.
- [ ] Backup restore and incident response contacts documented.
- [ ] File uploads, share links, and server-side search are either implemented
      securely or explicitly out of scope for the launch.
