/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FINNHUB_TOKEN?: string;
  readonly VITE_FINNHUB_QUOTE_RPS?: string;
  readonly VITE_FINNHUB_OTHER_RPS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
