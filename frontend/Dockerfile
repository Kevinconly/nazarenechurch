# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Unprivileged nginx listens on 8080 and runs as a non-root user.
FROM nginxinc/nginx-unprivileged:1.29.8-alpine3.23 AS runtime
# The published image still ships brotli-libs 1.2.0-r0, which Trivy reports as
# CVE-2026-111497 (critical, fixed in 1.2.1-r0). Upgrade in-build until the
# upstream image is rebuilt; remove this once the base tag is patched.
USER root
RUN apk upgrade --no-cache brotli-libs
USER 101
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/ || exit 1
