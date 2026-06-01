FROM oven/bun:1
WORKDIR /app
COPY package.json ./
COPY server.ts index.html ./
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
