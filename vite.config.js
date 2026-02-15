import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    server: {
        host: true,
        allowedHosts: ['macbook-pro.local']
    }
});
