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
  // Scripts/ is the ingestion CLI world — exclude from every route's trace by
  // default. The Inngest serve endpoint needs the runners, so we override the
  // exclude there specifically. Docs/db/test stay out of the bundle everywhere.
  outputFileTracingExcludes: {
    '*': ['scripts/**/*', 'docs/**/*', 'db/**/*', 'test/**/*', 'tests/**/*'],
    // The Inngest route imports the source runners — allow them to be traced in.
    // We pull in the whole scripts/ tree (runners → lib → schemas) so nothing is
    // silently dropped. Docs/test remain excluded via the '*' entry.
    'app/api/inngest/route': ['docs/**/*', 'db/**/*', 'test/**/*', 'tests/**/*'],
  },
  experimental: {
    // Keep the serverless bundle lean by default.
    optimizePackageImports: ['lucide-react'],
  },
  // Webpack tweak: our `scripts/` tree is NodeNext (ESM with explicit `.js`
  // extensions on relative imports). The Inngest serve route at
  // `src/app/api/inngest/route.ts` imports those modules. Webpack's default
  // resolver has no idea that `foo.js` might actually be `foo.ts` on disk.
  // `extensionAlias` is the idiomatic fix — it's a native webpack feature and
  // mirrors what TypeScript's `bundler` moduleResolution does at typecheck time.
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
});
