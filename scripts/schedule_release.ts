import { createInfraiClient } from "../src/infrai_client.ts";

const publicUrl = process.env.PUBLIC_SERVICE_URL;
if (!publicUrl) throw new Error("Set PUBLIC_SERVICE_URL to the deployed media service origin");

const infrai = createInfraiClient();
const steps = [
  { phase: "creator-preview", cron_expr: "0 14 6 10 *" },
  { phase: "all-creators", cron_expr: "0 14 13 10 *" },
] as const;

for (const step of steps) {
  const task = new URL(`/internal/release/${step.phase}`, publicUrl).toString();
  const job = await infrai.cron.create(
    { cron_expr: step.cron_expr, task },
    `media-streaming-${step.phase}`,
  );
  console.log(`${step.phase}: ${job.job_id}`);
}
