// One-time setup for push alerts and the teacher digest. Prints (never stores):
//  - VAPID keys for push (Vercel env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)
//  - a CRON_SECRET (Vercel env + GitHub secret) and the SQL that registers its hash
// Run: node scripts/notify-setup.mjs
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
const secret = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(secret, "utf8").digest("hex");

console.log(`
Add these in Vercel (Project -> Settings -> Environment Variables, Production):
  VAPID_PUBLIC_KEY=${keys.publicKey}
  VAPID_PRIVATE_KEY=${keys.privateKey}
  VAPID_SUBJECT=mailto:you@example.com
  CRON_SECRET=${secret}
  DIGEST_DAILY_LIMIT=200        (optional; Brevo free plan allows 300 a day)

Add in GitHub (Settings -> Secrets and variables -> Actions -> Secrets):
  CRON_SECRET=${secret}

Run in the Supabase SQL editor, after applying db/migrations/0030_notifications.sql:
  insert into job_secret (id, secret_hash) values (1, '${hash}')
  on conflict (id) do update set secret_hash = excluded.secret_hash, updated_at = now();
  NOTIFY pgrst, 'reload schema';

Keep the VAPID private key and CRON_SECRET private. Do not commit this output.
`);
