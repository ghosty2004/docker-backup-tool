FROM node:24-alpine3.22 AS base
WORKDIR /app

FROM base AS build
COPY package*.json ./
RUN npm install --frozen-lockfile
COPY . .
RUN npm run build

FROM base AS final
RUN apk add --no-cache docker-cli
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package*.json /app/
RUN npm install --frozen-lockfile --omit=dev
ENTRYPOINT ["node", "dist/main.js"]