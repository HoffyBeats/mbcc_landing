import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const imageStore = getStore({ name: "review-images", consistency: "strong" });
const allowedKey = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export default async (_request: Request, context: Context) => {
  const key = context.params.key;
  if (!allowedKey.test(key)) return new Response("Not found", { status: 404 });

  const image = await imageStore.get(key, { type: "arrayBuffer" });
  if (!image) return new Response("Not found", { status: 404 });

  const extension = key.split(".").pop();
  const contentType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;

  return new Response(image as ArrayBuffer, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
};

export const config: Config = {
  path: "/api/review-images/:key",
};
