FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked into the bundle at build time. The default keeps docker compose
# talking to the backend on :8000; CI builds with an empty value so the
# published image calls the API on its own origin (behind one Ingress).
ARG VITE_API_BASE_URL=http://localhost:8000
RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
