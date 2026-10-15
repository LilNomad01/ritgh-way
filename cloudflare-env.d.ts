declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    VIDEOS: R2Bucket;
    ASSETS: Fetcher;
    AUTH_JWT_SECRET?: string;
    ROOT_ADMIN_EMAIL?: string;
    ROOT_ADMIN_PASSWORD_HASH?: string;
    ROOT_ADMIN_PASSWORD_SALT?: string;
    OPENAI_API_KEY?: string;
    SPEECH_TRANSCRIPTION_MODEL?: string;
    SPEECH_EVALUATION_MODEL?: string;
  }
}
