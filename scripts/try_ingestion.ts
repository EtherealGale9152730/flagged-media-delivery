import { decideDelivery, ingestionBody } from "../src/media_pipeline.ts";

const input = ingestionBody.parse({
  creatorId: "preview_ada",
  assetName: "launch-cut.mp4",
  sourceUrl: "https://media.example/launch-cut.mp4",
  mimeType: "video/mp4",
});

console.log(decideDelivery(input, true, "creator-preview"));
