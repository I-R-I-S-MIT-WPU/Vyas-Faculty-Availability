import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Vyas Room Flow",
        short_name: "Vyas",
        description: "Vyas Building Room Booking System",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell only: API, Google OAuth and Socket.IO must always hit the network.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/auth\/google/, /^\/socket\.io/],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
