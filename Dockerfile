# Sri Suriya Polymers – container image.  Build: docker build -t suriya .
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 TRUST_PROXY=1 DATA_DIR=/data/db UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# better-sqlite3 ships ready-made binaries (see .npmrc), so no compiler is needed
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data/db /data/uploads && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# one process; use ["node","cluster.js"] with WORKERS=2.. on a machine with several CPUs
CMD ["node", "server.js"]
