import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import dns from "node:dns";

dns.setDefaultResultOrder("verbatim");

export default defineConfig(() => {
  const plugins: PluginOption[] = [react()];

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        protocol: "ws",
        host: "localhost",
        port: 8080,
      },
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
    build: {
      chunkSizeWarningLimit: 1000,
      sourcemap: false,
    },
  };
});
