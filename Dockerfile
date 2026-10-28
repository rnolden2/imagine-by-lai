# Keep build and runtime on the same verified Node patch release.
ARG NODE_IMAGE=node:22.19.0-alpine

# 1. Build Stage
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run check:bundle

# 2. Prune dev dependencies
FROM ${NODE_IMAGE} AS pruned
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# 3. Final Stage
FROM ${NODE_IMAGE}
WORKDIR /app

# Copy the pruned node_modules
COPY --from=pruned /app/node_modules ./node_modules
# Copy the standalone server output
COPY --from=builder /app/build ./build
COPY package.json ./

# SvelteKit's node adapter listens on port 3000 by default
EXPOSE 3000
ENV NODE_ENV=production
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD [ "node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" ]

# Start the server
CMD [ "node", "build/index.js" ]
