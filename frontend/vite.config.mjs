import {defineConfig} from 'vite';
export default defineConfig({base:'/',build:{outDir:'../web/react-build',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'terminal-react.mjs',chunkFileNames:'terminal-[name].mjs',assetFileNames:'terminal-react.[ext]'}}}});
