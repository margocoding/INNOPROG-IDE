import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), '');
  const localPreview = mode === 'development' && process.env.IDE_LOCAL_API === '1';
  const previewApiPort = Number(process.env.IDE_LOCAL_API_PORT ?? 8765);
  const previewRoomPort = Number(process.env.IDE_LOCAL_ROOM_PORT ?? 0);
  const previewCatalogPort = Number(process.env.IDE_LOCAL_CATALOG_PORT ?? 0);
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
      'process.env.IDE_LOCAL_ROOM_PREVIEW': JSON.stringify(localPreview && previewRoomPort ? '1' : ''),
      'process.env.IDE_LOCAL_PREVIEW': JSON.stringify(localPreview ? '1' : ''),
    },
    server: {
      port: Number(process.env.PORT ?? loaded.PORT ?? 3000),
      strictPort: true,
      proxy: {
        ...(localPreview ? { '/bot-api': { target: `http://127.0.0.1:${previewApiPort}`, ws: true, changeOrigin: false } } : {}),
        ...(localPreview && previewRoomPort ? {
          '/api/room': { target: `http://127.0.0.1:${previewRoomPort}` },
          '/socket.io': { target: `http://127.0.0.1:${previewRoomPort}`, ws: true },
        } : {}),
        ...(localPreview && previewCatalogPort ? {
          '/lesson-demo': { target: `http://127.0.0.1:${previewCatalogPort}` },
        } : {}),
        '/bot-api/code/console': {
          target: 'http://127.0.0.1:8765',
          ws: true,
          changeOrigin: false,
        },
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
