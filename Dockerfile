FROM node:22-alpine AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .

RUN yarn build

FROM nginx:stable-alpine

ENV BOT_API_PROXY_URL=https://webhook.bot.innoprog.ru \
    BOT_API_PROXY_HOST=webhook.bot.innoprog.ru \
    CODE_RUNNER_API_PROXY_URL=https://api.innoprog.ru \
    CODE_RUNNER_API_PROXY_HOST=api.innoprog.ru \
    CODE_RUNNER_AUTH_TOKEN=

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
