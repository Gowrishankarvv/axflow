# ---------- Stage 1: build the Vite bundle ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps with cache-friendly layer
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .

# VITE_API_URL is intentionally empty in production: API calls use relative
# paths and the in-container nginx proxies /api/* to the backend.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------- Stage 2: serve the static bundle ----------
FROM nginx:alpine

# Replace default site config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
