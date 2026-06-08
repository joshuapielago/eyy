FROM node:20-alpine

WORKDIR /app

# Install only runtime dependencies for a small, reproducible image.
COPY package*.json ./
RUN npm ci --omit=dev

# App code + SQL schema (read at startup to create the kudos table).
COPY src ./src
COPY sql ./sql

# Your values/GIFs config: mount it at runtime or bake it in by uncommenting.
# Either way, point EYY_CONFIG_PATH at it (default ./eyy.config.json).
# COPY eyy.config.json ./eyy.config.json

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/health" || exit 1

CMD ["node", "src/index.js"]
