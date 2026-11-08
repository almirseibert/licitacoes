# ---------- Etapa 1: build do frontend ----------
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------- Etapa 2: imagem final (API e worker saem desta mesma imagem) ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime && echo America/Sao_Paulo > /etc/timezone
COPY package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./backend/
COPY worker/ ./worker/
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN mkdir -p /dados/editais /dados/empresa /dados/pacotes
EXPOSE 4000
# API:    npm run api      (comando padrão)
# Worker: npm run worker   (mesmo Dockerfile, só muda o comando no EasyPanel)
CMD ["npm", "run", "api"]
