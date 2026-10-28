# API tier image (SRS 7, deployment; SRS 6.4, portability). Build from the repository root,
# because the npm workspace lock file lives there:
#   docker build -f server/Dockerfile -t online-bookstore-api .
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Install only the server's runtime dependencies. npm needs every workspace manifest to
# check the lock file, but nothing from the client is installed.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --omit=dev && npm cache clean --force

COPY server/src server/src

WORKDIR /app/server
USER node
EXPOSE 5000

# Configuration comes from the environment (see server/.env.example); no .env is copied in.
CMD ["node", "src/server.js"]
