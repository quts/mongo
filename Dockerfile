# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM dependencies AS validation
RUN npx playwright install --with-deps chromium
COPY . .
ENV CI=true
CMD ["sh", "-c", "npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e"]

FROM development AS build
RUN npm run build

FROM nginx:stable-alpine AS runtime
COPY containers/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
