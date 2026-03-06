# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_ONLYOFFICE_URL is baked into the bundle at build time.
# Pass it as a build-arg so the container can override it.
ARG VITE_ONLYOFFICE_URL=http://localhost:8080
ENV VITE_ONLYOFFICE_URL=$VITE_ONLYOFFICE_URL

RUN npm run build

# ── Serve stage ──────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
