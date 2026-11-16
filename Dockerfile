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
# API:    migra, semeia e sobe (comando padrão). `migrar` é idempotente (tabela `migracoes`):
#         a cada implantação aplica só as migrações novas; se falhar, a API não sobe
#         e o erro fica no Log do serviço, em vez de login e cadastro caírem em 500.
#         `semear` também é idempotente (backend/config/semear.js): só insere o que falta
#         e só atualiza fonte que o usuário nunca configurou (config = '{}') — nunca
#         sobrescreve o que foi editado na tela de Fontes. Assim, uma fonte nova ou
#         corrigida no código chega sozinha em produção a cada deploy, sem passo manual.
# Worker: npm run worker       (mesmo Dockerfile, só muda o comando no EasyPanel; não migra
#         nem semeia, para os três serviços não disputarem a mesma escrita ao subir juntos)
CMD ["sh", "-c", "npm run migrar && npm run semear && npm run api"]
