FROM node:18-bullseye-slim

# Java runtime para node-jt400
RUN apt-get update && apt-get install -y \
    default-jdk \
    python3 \
    make \
    g++ \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/default-java

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
