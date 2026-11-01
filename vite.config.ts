import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// api.notion.com sends no CORS headers, so browser calls go to /notion-api on this server and are forwarded; the token travels in the request's Authorization header and is never stored server-side.
const notionProxy: Record<string, ProxyOptions> = {
  '/notion-api': {
    target: 'https://api.notion.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/notion-api/, '/v1'),
    configure: (proxy) => proxy.on('proxyReq', (request) => { request.removeHeader('origin'); request.removeHeader('referer'); request.removeHeader('cookie'); }),
  },
};

export default defineConfig({ plugins: [react(), tailwindcss()], server: { proxy: notionProxy }, preview: { proxy: notionProxy } });
