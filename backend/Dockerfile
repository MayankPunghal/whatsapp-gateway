FROM node:18-bullseye-slim AS base

# Install Chromium & fonts (headless-friendly)
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto \
    fonts-noto-color-emoji \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app

# Dev stage
FROM base AS dev
ENV NODE_ENV=development
COPY package.json ./
RUN npm install --no-cache
COPY . .
EXPOSE 3010
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS production
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-cache
COPY . .
EXPOSE 3010
CMD ["node", "index.js"]
