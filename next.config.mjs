/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // The static build publishes `/excel/<slug>`; the ported app serves `/learn/excel/<slug>`. Every
  // legacy URL keeps resolving, permanently, so both builds can run side by side during phase 0.
  async redirects() {
    return [
      { source: "/excel/:slug", destination: "/learn/excel/:slug", permanent: true },
      { source: "/index.html", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
