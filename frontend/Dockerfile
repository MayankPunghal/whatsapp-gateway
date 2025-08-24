# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=
RUN npm run build

# Serve stage
FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
ENV PORT=3011
COPY --from=build /app/dist ./dist
EXPOSE 3011
CMD ["serve", "-s", "dist", "-l", "3011"]
