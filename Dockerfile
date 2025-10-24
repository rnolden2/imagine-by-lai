# 1. Build Stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# 2. Prune dev dependencies
FROM node:22-alpine AS pruned
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
RUN yarn install --production --frozen-lockfile

# 3. Final Stage
FROM node:22-alpine
WORKDIR /app

# Copy the pruned node_modules
COPY --from=pruned /app/node_modules ./node_modules
# Copy the standalone server output
COPY --from=builder /app/build ./build

# SvelteKit's node adapter listens on port 3000 by default
EXPOSE 3000
ENV NODE_ENV=production

# Start the server
CMD [ "node", "build/index.js" ]
