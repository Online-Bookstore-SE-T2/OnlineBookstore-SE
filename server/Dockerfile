# Build the React client and package it with the API so the demo uses one HTTPS origin.
FROM node:20-bookworm-slim AS client-build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY client client
RUN npm run build -w client

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --omit=dev && npm cache clean --force
COPY server/src server/src
COPY --from=client-build /app/client/dist client/dist

WORKDIR /app/server
USER node
EXPOSE 5000

# Configuration comes from the environment; no .env or secret is copied into the image.
CMD ["node", "src/server.js"]
