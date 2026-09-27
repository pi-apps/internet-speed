FROM node:20-bookworm-slim

# glibc on purpose. Two native addons are involved - better-sqlite3 and, through
# pi-backend, sodium-native - and both ship prebuilt binaries for glibc x64 and
# arm64. Alpine's musl has no such prebuilds: npm falls back to compiling or,
# worse, loads a glibc binary that starts and then aborts the process the first
# time it is used, which shows up as a server that restarts whenever a payout
# is attempted.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./

ARG INSTALL_OPTIONAL=true
RUN if [ "$INSTALL_OPTIONAL" = "true" ]; then \
      npm install --omit=dev; \
    else \
      npm install --omit=dev --omit=optional; \
    fi

COPY . .
RUN mkdir -p data

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/index.js"]
