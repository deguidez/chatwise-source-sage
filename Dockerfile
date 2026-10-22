FROM node:22-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN npm install -g bun && bun install
COPY . .
RUN NITRO_PRESET=node-server bunx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
COPY --from=build /app/.output ./.output
COPY app.cjs ./
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "app.cjs"]
