# ---- Install production dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ---- Build TypeScript -> dist ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodejs \
 && mkdir -p /app/logs /app/uploads \
 && chown -R nodejs:nodejs /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 5000
ENV PORT=5000
CMD ["node", "dist/server.js"]
