/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "sharp", "pdf-lib", "docx", "exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
};
export default nextConfig;
