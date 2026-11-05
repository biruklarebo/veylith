# Node 22.18 or later runs the TypeScript that Prisma generates without a build step.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY --chmod=755 start.sh ./
USER node
EXPOSE 8090
# New migrations are applied before the server starts.
CMD ["./start.sh"]
