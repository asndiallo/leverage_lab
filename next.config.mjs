/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow document (PDF) uploads through Server Actions.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
