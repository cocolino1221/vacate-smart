/** @type {import('next').NextConfig} */
const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
export default {
  output: 'standalone',
  images: { unoptimized: true },
  // În dezvoltare /api merge la backend; în producție Nginx trimite /api direct la backend.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};
