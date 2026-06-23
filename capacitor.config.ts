import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.onpalate.composer",
  appName: "Composer",
  webDir: "public",
  server: {
    url: "https://composer.onpalate.com",
    cleartext: false,
  },
};

export default config;
