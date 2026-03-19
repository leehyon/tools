/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EMBEDDING_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
