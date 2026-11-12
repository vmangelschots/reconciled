FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked into the bundle at build time. The default keeps docker compose
# talking to the backend on :8000; CI builds with an empty value so the
# published image calls the API on its own origin (behind one Ingress).
ARG VITE_API_BASE_URL=http://localhost:8000
# Which build this is, stamped by CI (see openspec/specs/app-version).
ARG APP_VERSION=dev
ARG APP_COMMIT=
ARG APP_BUILT=
RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" \
    VITE_APP_VERSION="$APP_VERSION" VITE_APP_COMMIT="$APP_COMMIT" VITE_APP_BUILT="$APP_BUILT" \
    npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker-entrypoint.d/05-version.sh /docker-entrypoint.d/
COPY --from=build /app/dist /usr/share/nginx/html
# For the startup log line written by 05-version.sh.
ARG APP_VERSION=dev
ARG APP_COMMIT=
ARG APP_BUILT=
ENV APP_VERSION=$APP_VERSION \
    APP_COMMIT=$APP_COMMIT \
    APP_BUILT=$APP_BUILT
EXPOSE 80
