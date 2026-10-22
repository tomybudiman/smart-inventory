# Image produksi Cloud Run. Folder dist/ dibangun lokal lewat `npm run build:cloudrun`
# agar file .env tidak perlu ikut ter-upload ke Cloud Build.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server.mjs ./
COPY src/ai-config.mjs ./src/
COPY dist ./dist
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
