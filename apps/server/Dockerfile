# The game server: TypeScript compiled with tsc, run on Node 24 in a
# distroless image (no shell, no package manager, runs as uid 65532).
# Build context: the repo root (see docker-compose.yaml).
#
# Bun is only the package manager here: the server runs on Node, as in dev.
# Nothing from the environment is baked in; PORT and NODE_ENV are read at
# runtime.

FROM oven/bun:1.4.2 AS deps
WORKDIR /repo
# Manifests first, so the install layers stay cached until a dependency
# changes. bunfig.toml keeps linker = "hoisted": with bun's isolated linker
# there are two copies of @colyseus/core and every join fails with
# "seat reservation expired".
COPY package.json bun.lock bunfig.toml ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

# Everything, for the build.
FROM deps AS build
RUN bun install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN cd packages/shared && bun run build \
 && cd ../../apps/server && bun run build \
# The lasting scores' directory (#41), empty, copied into the final image
# owned by nonroot: the distroless image has no shell to mkdir or chown, and a
# fresh named volume mounted there takes this ownership.
 && mkdir -p /out/data

# Only the server's runtime dependencies (no tsx, typescript or client libs).
FROM deps AS prod-deps
RUN bun install --frozen-lockfile --production --filter @manif/server \
# typescript comes in as an optional peer of @colyseus/schema (only its
# codegen CLI uses it), with its native compiler: about 30 MB the server
# never loads at runtime.
 && rm -rf node_modules/typescript node_modules/@typescript node_modules/@types

FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
COPY --from=prod-deps /repo/package.json ./
COPY --from=prod-deps /repo/node_modules node_modules
# @manif/shared is a workspace package: node_modules/@manif/shared is a
# symlink to packages/shared, so it keeps the same place here.
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/server/package.json apps/server/
COPY --from=build /repo/apps/server/dist apps/server/dist
# The lasting totals (#41): one SQLite file (node:sqlite, built into Node) in
# /data, where docker-compose.yaml mounts the `scores` volume. Nothing else
# lives there, so the mount hides nothing. 65532 is distroless' nonroot.
COPY --from=build --chown=65532:65532 /out/data /data
# production also turns off the debug knockback message (features/physics/debug.ts).
ENV NODE_ENV=production PORT=2567 SCORE_DB_PATH=/data/manif.db
EXPOSE 2567
USER nonroot
# No shell or wget in the image: node itself polls the server's GET /health.
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Exec form, no shell: node is PID 1 and receives `docker stop`'s SIGTERM
# itself (a shell form would leave /bin/sh as PID 1, which doesn't forward
# it, and the container would be SIGKILLed after the timeout). On SIGTERM
# Colyseus disposes every room, disconnects the players and exits 0 (see
# src/app/index.ts). The image's entrypoint is /nodejs/bin/node.
STOPSIGNAL SIGTERM
CMD ["apps/server/dist/app/index.js"]
