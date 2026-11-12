# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_TMDB_API_KEY
ARG VITE_TMDB_BASE_URL
ARG VITE_TMDB_IMAGE_BASE
ARG VITE_OMDB_API_KEY
ARG VITE_OMDB_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_TMDB_API_KEY=$VITE_TMDB_API_KEY \
    VITE_TMDB_BASE_URL=$VITE_TMDB_BASE_URL \
    VITE_TMDB_IMAGE_BASE=$VITE_TMDB_IMAGE_BASE \
    VITE_OMDB_API_KEY=$VITE_OMDB_API_KEY \
    VITE_OMDB_BASE_URL=$VITE_OMDB_BASE_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS runtime

# Apply security updates from the base image's stable Alpine repositories.
USER root
RUN apk upgrade --no-cache

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

# No runtime templating is needed; avoid startup scripts writing into /etc.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]