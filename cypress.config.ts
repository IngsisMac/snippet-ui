import { defineConfig } from "cypress";
import dotenv from 'dotenv';
dotenv.config();

const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:8080";

export default defineConfig({
  chromeWebSecurity: false,
  e2e: {
    chromeWebSecurity: false,
    experimentalModifyObstructiveThirdPartyCode: true,
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium') {
          launchOptions.args.push('--disable-gpu');
          launchOptions.args.push('--disable-dev-shm-usage');
          launchOptions.args.push('--no-sandbox');
        }
        return launchOptions;
      });

      config.env = {
        ...process.env,
        auth0_domain: process.env.VITE_AUTH0_DOMAIN,
        auth0_client_id: process.env.VITE_AUTH0_CLIENT_ID,
        ...config.env,
      }
      return config
    },
    experimentalStudio: true,
    baseUrl: frontendUrl,
  },
});
