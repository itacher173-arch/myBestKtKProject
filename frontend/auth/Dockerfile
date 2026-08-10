# Auth UI — multi-stage (сборка в контейнере)
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_APP_URL=/app/
ARG VITE_AUTH_URL=/
ENV VITE_APP_URL=${VITE_APP_URL} VITE_AUTH_URL=${VITE_AUTH_URL}
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
