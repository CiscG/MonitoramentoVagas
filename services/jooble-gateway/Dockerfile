FROM node:22-alpine
WORKDIR /srv
COPY --chown=node:node server.cjs ./server.cjs
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "require('node:http').get('http://127.0.0.1:8787/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","server.cjs"]
