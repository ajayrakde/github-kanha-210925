# syntax=docker/dockerfile:1

FROM node:20-bookworm AS builder
WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 5000

CMD ["npm", "start"]
