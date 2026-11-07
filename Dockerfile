FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY . .
# Attendance data is saved here. Mount a persistent volume at /app/data.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
