FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG REACT_APP_BOT_API_URL=/bot-api
ARG REACT_APP_WS_URL=https://ide.innoprog.ru
ARG REACT_APP_PARENT_APP_ORIGIN=https://app.innoprog.ru
ARG REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS=https://app.innoprog.ru,https://api.innoprog.ru,https://cabinet.innoprog.ru
ENV REACT_APP_BOT_API_URL=${REACT_APP_BOT_API_URL} \
    REACT_APP_WS_URL=${REACT_APP_WS_URL} \
    REACT_APP_PARENT_APP_ORIGIN=${REACT_APP_PARENT_APP_ORIGIN} \
    REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS=${REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS}

RUN npm run build

FROM nginx:stable-alpine

ENV BOT_API_PROXY_URL=https://webhook.bot.innoprog.ru \
    BOT_API_PROXY_HOST=webhook.bot.innoprog.ru \
    CODE_RUNNER_API_PROXY_URL=https://api.innoprog.ru \
    CODE_RUNNER_API_PROXY_HOST=api.innoprog.ru

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
