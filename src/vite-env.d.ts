/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the backend API (e.g. https://your-backend.onrender.com)
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
