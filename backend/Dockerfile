FROM node:18-bullseye-slim

# Install Chromium & fonts (headless-friendly)
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto \
    fonts-noto-color-emoji \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
WORKDIR /app

# Dependencies first for better layer cache
COPY package.json ./
RUN npm install --omit=dev

# Copy source (context is ./backend)
COPY index.js sessions.js ./

EXPOSE 3010
CMD ["node", "index.js"]
