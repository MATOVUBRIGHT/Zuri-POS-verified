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
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1000,
      sourcemap: false,
      target: "es2020",
      minify: "esbuild",
      rollupOptions: {
        output: {
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
      cssCodeSplit: true,
      reportCompressedSize: true,
    },
    optimizeDeps: {
      include: ["react", "react-dom", "@supabase/supabase-js", "@tanstack/react-query"],
      esbuildOptions: { target: "es2020" },
    },
  };
});
