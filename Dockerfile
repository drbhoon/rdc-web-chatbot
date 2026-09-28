FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV NEXT_TELEMETRY_DISABLED=1
# "/chatbot" on hr.rdcc.ai, empty (served at the root) on Railway. Next bakes
# it into the pages at build time, so it must be a build argument; the server
# reads it again at start, so it is set at runtime too.
ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "start"]
