import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  // 发票识别用 pdfjs 抽 PDF 文字层：它靠 worker 文件在运行时按路径加载，
  // 被打进 server chunk 后会找不到 pdf.worker.mjs，所以保持外部依赖、直接从 node_modules 读。
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
