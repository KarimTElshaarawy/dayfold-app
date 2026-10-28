declare const __APP_NAME__: string;
declare const __STARTUP_MS__: number;

/** The app name comes from app.config.json at build time (vite.config.ts). */
export const APP_NAME: string = __APP_NAME__;
/** How long the start-up animation plays, from app.config.json (startupSeconds). */
export const STARTUP_MS: number = __STARTUP_MS__;
