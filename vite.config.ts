import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
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

// Each build is stamped with an id (the commit on GitHub) that is both baked into the app and published as version.json, so a running
// app can tell that a newer deploy is out and reload itself.
const buildId = process.env.GITHUB_SHA?.slice(0, 12) ?? `local-${Date.now().toString(36)}`;

const versionFile: Plugin = { name: 'version-file', apply: 'build', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) }); } };

export default defineConfig({ plugins: [react(), tailwindcss(), versionFile], define: { __BUILD_ID__: JSON.stringify(buildId) }, server: { proxy: notionProxy }, preview: { proxy: notionProxy } });
