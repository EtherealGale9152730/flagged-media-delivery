import assert from "node:assert/strict";
import test from "node:test";
import { decideDelivery, ingestionBody } from "../src/media_pipeline.ts";

const asset = {
  creatorId: "creator_42",
  assetName: "weekly-show.mp4",
  sourceUrl: "https://media.example/weekly-show.mp4",
  mimeType: "video/mp4" as const,
};

test("holds a processed asset while media streaming is disabled", () => {
  const result = decideDelivery(ingestionBody.parse(asset), false, "all-creators");
  assert.equal(result.processing, "queued");
  assert.equal(result.delivery, "held");
});

test("releases only preview creators during the preview phase", () => {
  const regular = decideDelivery(ingestionBody.parse(asset), true, "creator-preview");
  const preview = decideDelivery(
    ingestionBody.parse({ ...asset, creatorId: "preview_42" }),
    true,
    "creator-preview",
  );
  assert.equal(regular.delivery, "held");
  assert.equal(preview.delivery, "creator-preview");
});

test("rejects an ingestion body without a valid source URL", () => {
  const result = ingestionBody.safeParse({ ...asset, sourceUrl: "local-file" });
  assert.equal(result.success, false);
});
