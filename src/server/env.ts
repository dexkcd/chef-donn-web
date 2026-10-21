/** Server configuration, read once. Everything has a safe local default except prod secrets. */
export const env = {
  isProd: process.env.NODE_ENV === "production",
  appUrl: process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  authSecret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
  bootstrapOwnerEmail: process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase() || null,
  resendApiKey: process.env.RESEND_API_KEY || null,
  mailFrom: process.env.MAIL_FROM ?? "Chef Donn's <login@chefdonns.ph>",
  /** No Resend yet: print sign-in links to the server logs (deploy-time stopgap, opt-in). */
  signinLinksToLogs: process.env.SIGNIN_LINKS_TO_LOGS === "1",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  /** Only for API keys not created inside a workspace: sent as the anthropic-workspace-id header. */
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID?.trim() || null,
  receiptModel: process.env.RECEIPT_MODEL ?? "claude-opus-5-5",
  priceModel: process.env.PRICE_MODEL ?? "claude-opus-5-5",
  planModel: process.env.PLAN_MODEL ?? "claude-opus-5-5",
  /** "anthropic" | "fake" | "null" — tests and e2e force "fake". */
  aiPlanner: process.env.AI_PLANNER ?? null,
  planDraftDailyLimit: Number(process.env.PLAN_DRAFT_DAILY_LIMIT ?? 10),
  /** "anthropic" | "fake" | "null" — tests and e2e force "fake". */
  aiExtractor: process.env.AI_EXTRACTOR ?? null,
  priceProvider: process.env.PRICE_PROVIDER ?? null,
  priceSearchDailyLimit: Number(process.env.PRICE_SEARCH_DAILY_LIMIT ?? 50),
  /** Allow http:// and private hosts for webhook callbacks (tests only). */
  allowInsecureCallbacks: process.env.ALLOW_INSECURE_CALLBACKS === "1",
  storageDriver: (process.env.STORAGE_DRIVER ?? "fs") as "fs" | "s3",
  storageDir: process.env.STORAGE_DIR ?? ".data/uploads",
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "auto",
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
  },
  /** Disable the background sweeper (tests drive jobs directly). */
  disableSweeper: process.env.DISABLE_SWEEPER === "1",
};
