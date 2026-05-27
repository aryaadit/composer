import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // Privacy policy moved to the main onpalate.com site as the
        // canonical version. Permanent (308) so search engines update
        // and external bookmarks land in the right place. The in-app
        // SMS consent link in AuthScreen already points at the new
        // URL directly; this catches bookmarks, indexed results, and
        // any Twilio TFV scraper hits.
        source: "/privacy",
        destination: "https://www.onpalate.com/composer/privacy",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
