import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: true,
        allowedHosts: ['macbook-pro.local']
    }
});
