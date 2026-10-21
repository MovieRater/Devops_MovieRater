# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:ed04ec1ff34502c339ee5c3ae3f855442398edc1d05591e2b98981dcbbd20b1e AS runtime

# Apply verified Alpine security fixes until the pinned base image includes them.
USER root
RUN apk add --no-cache --upgrade \
    pcre2=10.49-r0 \
    libexpat=2.9.0-r0 \
    libx11=1.8.14-r0 \
    tiff=4.7.2-r0

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

# No runtime templating is needed; avoid startup scripts writing into /etc.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
