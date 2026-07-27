import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), '');
  const environmentNames = [
    'REACT_APP_BOT_API_URL',
    'REACT_APP_WS_URL',
    'REACT_APP_PARENT_APP_ORIGIN',
    'REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS',
  ];
  const define = Object.fromEntries(
    environmentNames.map((name) => [
      `process.env.${name}`,
      JSON.stringify(process.env[name] ?? loaded[name] ?? ''),
    ]),
  );

  return {
    plugins: [react()],
    define: {
      ...define,
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    server: {
      port: Number(process.env.PORT ?? loaded.PORT ?? 3000),
      strictPort: true,
      proxy: {
        '/bot-api/check': {
          target: 'https://ide.innoprog.ru',
          changeOrigin: true,
        },
        '/bot-api/code/run': {
          target: 'https://ide.innoprog.ru',
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2018',
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store)[\\/]/.test(id)) {
              return 'react-vendor';
            }
            if (/[\\/]node_modules[\\/](@codemirror|codemirror|@lezer)[\\/]/.test(id)) {
              return 'editor-vendor';
            }
            if (/[\\/]node_modules[\\/](yjs|y-websocket|lib0)[\\/]/.test(id)) {
              return 'collaboration-vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
