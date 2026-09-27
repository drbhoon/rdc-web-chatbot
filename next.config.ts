import type { NextConfig } from "next";

// Served at the root on Railway and locally, and under /chatbot on hr.rdcc.ai.
// basePath is baked in at build time, so BASE_PATH must be a Docker build arg
// there; it is also handed to the browser for fetch() and image paths
// (src/lib/basePath.ts), which Next does not prefix by itself.
const basePath = process.env.BASE_PATH || "";

// Which sites may show the bot inside a frame: the HR portal for testing now,
// the company website later. Anyone else framing it could dress it up as
// something it is not.
const frameAncestors = process.env.FRAME_ANCESTORS || "'self' https://hr.rdcc.ai https://www.rdc.in https://rdc.in";

const securityHeaders = [
  { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The microphone is the voice feature; nothing else is needed.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
];

// Browser code gets NEXT_PUBLIC_* values baked in at build time, and the
// Docker build sees neither the Railway variables nor .env (.dockerignore), so
// voice was switched off in every build: the reply was never spoken. Voice is
// the point of this bot, so it is on unless a build sets a flag to "false".
const flag = (name: string, fallback: string) => process.env[name] || fallback;

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_ENABLE_TTS: flag("NEXT_PUBLIC_ENABLE_TTS", "true"),
    NEXT_PUBLIC_USE_AI_TTS: flag("NEXT_PUBLIC_USE_AI_TTS", "true"),
    NEXT_PUBLIC_ENABLE_VOICE_UI: flag("NEXT_PUBLIC_ENABLE_VOICE_UI", "true"),
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
