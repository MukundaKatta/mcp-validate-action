# mcpcheck — MCP config linter
#
# Usage:
#   docker run --rm -v "$PWD:/work" -w /work ghcr.io/mukundakatta/mcpcheck
#   docker run --rm -v "$PWD:/work" -w /work ghcr.io/mukundakatta/mcpcheck mcp.json --format sarif
#
# The image bundles the CLI; the working directory is mounted read-write so
# --fix can write back. Non-root by default.

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /build

# Only copy what we need to install + build the library. Plugins/extensions
# aren't part of the CLI image.
COPY package.json package-lock.json* tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/
COPY action.yml schema.json ./
COPY schema/ schema/

RUN npm install --no-audit --no-fund && npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app

# Drop root; /work is the conventional mount point.
RUN adduser -D -u 10001 mcpcheck && mkdir -p /work && chown mcpcheck:mcpcheck /work

COPY --from=builder --chown=mcpcheck:mcpcheck /build/dist /app/dist
COPY --from=builder --chown=mcpcheck:mcpcheck /build/node_modules /app/node_modules
COPY --from=builder --chown=mcpcheck:mcpcheck /build/package.json /app/package.json
COPY --from=builder --chown=mcpcheck:mcpcheck /build/schema.json /app/schema.json
COPY --from=builder --chown=mcpcheck:mcpcheck /build/schema /app/schema

RUN ln -s /app/dist/cli.js /usr/local/bin/mcpcheck && chmod +x /app/dist/cli.js

USER mcpcheck
WORKDIR /work
ENTRYPOINT ["mcpcheck"]
CMD []
