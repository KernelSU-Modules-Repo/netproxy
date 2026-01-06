import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        outDir: '../module/webroot',
        emptyOutDir: true,
        sourcemap: false
    },
    server: {
        port: 1234,
        open: true
    }
})
