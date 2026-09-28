import { randomUUID } from "node:crypto";
import { z } from "zod";

export const ingestionBody = z.object({
  creatorId: z.string().min(1),
  assetName: z.string().min(1),
  sourceUrl: z.string().url(),
  mimeType: z.enum(["video/mp4", "audio/mpeg"]),
});

export type IngestionInput = z.infer<typeof ingestionBody>;
export type ReleasePhase = "team" | "creator-preview" | "all-creators";

export type MediaJob = {
  assetId: string;
  jobId: string;
  creatorId: string;
  assetName: string;
  processing: "queued";
  delivery: "held" | "creator-preview" | "ready";
};

export function decideDelivery(
  input: IngestionInput,
  mediaStreamingEnabled: boolean,
  phase: ReleasePhase,
): MediaJob {
  const eligible = phase === "all-creators" || (phase === "creator-preview" && input.creatorId.startsWith("preview_"));
  const delivery = !mediaStreamingEnabled || !eligible
    ? "held"
    : phase === "creator-preview"
      ? "creator-preview"
      : "ready";

  return {
    assetId: randomUUID(),
    jobId: randomUUID(),
    creatorId: input.creatorId,
    assetName: input.assetName,
    processing: "queued",
    delivery,
  };
}
