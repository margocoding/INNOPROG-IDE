const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  const codeRunnerProxy = createProxyMiddleware({
    target: "https://ide.innoprog.ru",
    changeOrigin: true,
    secure: true,
  });

  app.use("/bot-api/check", codeRunnerProxy);
  app.use("/bot-api/code/run", codeRunnerProxy);
};
