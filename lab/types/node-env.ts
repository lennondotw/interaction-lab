declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      readonly ENABLE_SOURCE_MAP: 'true' | 'false';
      readonly NODE_ENV: 'development' | 'production' | 'test';
    }
  }
}

export {};
