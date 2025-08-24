// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  // порт НЕ задаём здесь — его задаёт vercel.json через --port $PORT
});
