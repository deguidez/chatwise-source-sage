FROM node:22-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN npm install -g bun@1.3.5 && bun install --frozen-lockfile
COPY . .
RUN NITRO_PRESET=node-server bunx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
COPY --from=build /app/.output ./.output
COPY app.cjs ./
RUN mkdir -p /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app.cjs"]
