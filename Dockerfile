FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY . .

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "src/index.js"]
