import { defineConfig } from "vite";

// GitHub Pages(サブパス)とVPS(ルート)の両方に対応: CIから BASE_PATH で指定
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
});
