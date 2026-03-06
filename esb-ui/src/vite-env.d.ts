/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE: 'designer' | 'runtime' | undefined;
  readonly VITE_DESIGNER_URL: string | undefined;
  readonly VITE_RUNTIME_URL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
