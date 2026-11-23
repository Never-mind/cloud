# syntax=docker/dockerfile:1
# Debian provides Chromium and its native libraries for the target architecture.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
COPY . .
# No production credentials are present during this build.
RUN FEISHU_INVOICE_AUTO_SYNC=0 FEISHU_PAYMENT_AUTO_SYNC=0 FRAPPE_DEMAND_AUTO_SYNC=0 npm run build
# Compile the same PDF renderer/check used by the app; no tsx/dev dependencies at runtime.
RUN ./node_modules/.bin/tsc -p deploy/pdf-check-tsconfig.json
RUN mkdir -p public \
    && sed -i 's/\r$//' deploy/docker-entrypoint.sh \
    && chmod 755 deploy/docker-entrypoint.sh

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    INVOICE_PDF_BROWSER=/usr/bin/chromium \
    NEXT_DIST_DIR=.next
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-cjk fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/.pdf-check ./.pdf-check
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/src/lib/invoice-templates ./src/lib/invoice-templates
COPY --from=builder --chown=node:node /app/deploy ./deploy
RUN mkdir -p uploads && chown node:node uploads
USER node
# Fail the image build if its own Chromium cannot really print a PDF.
RUN node .pdf-check/scripts/check-invoice-pdf.js
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD ["node", "deploy/healthcheck.cjs"]
ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
