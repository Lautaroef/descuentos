import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  // The source service worker file Serwist bundles into /public/sw.js.
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist({
  // Next.js 15 defaults are fine; strict mode on.
  reactStrictMode: true,
  // Anchor the build root to this project. Otherwise Next walks upward and picks up a stray
  // `~/package-lock.json` as the workspace root, which breaks file tracing on Vercel.
  outputFileTracingRoot: process.cwd(),
  // Keep `scripts/` out of the Next compile boundary — it's the ingestion CLI world.
  outputFileTracingExcludes: {
    '*': ['scripts/**/*', 'docs/**/*', 'db/**/*', 'test/**/*', 'tests/**/*'],
  },
  experimental: {
    // Keep the serverless bundle lean by default.
    optimizePackageImports: ['lucide-react'],
  },
});
