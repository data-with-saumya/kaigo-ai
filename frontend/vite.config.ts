import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs on :8080. In production Firebase Hosting rewrites /api/** to Cloud Run.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8080" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
