# Multi-stage Dockerfile for React Production Build (Regla de cátedra: estático con NGINX, prohibido devServer)
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci --silent

COPY . .

ARG VITE_AUTH0_DOMAIN=dev-o02i7bmya113pn5u.us.auth0.com
ARG VITE_AUTH0_CLIENT_ID=ucXYWKDkLUEd32VY21MxKMBoyqbpH9bT
ARG VITE_AUTH0_AUDIENCE=https://snippet-searcher.ingsis/

ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN
ENV VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID
ENV VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
