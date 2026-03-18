FROM node:18-slim
WORKDIR /app
COPY package.json ./
COPY bin/ ./bin/
COPY lib/ ./lib/
RUN npm link
ENTRYPOINT ["agentdrop"]
