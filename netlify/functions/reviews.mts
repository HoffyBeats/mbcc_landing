import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reviews } from "../../db/schema.js";

const imageStore = getStore({ name: "review-images", consistency: "strong" });

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function detectImage(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { extension: "png", contentType: "image/png" };
  }

  const signature = new TextDecoder().decode(bytes.slice(0, 12));
  if (signature.startsWith("RIFF") && signature.endsWith("WEBP")) {
    return { extension: "webp", contentType: "image/webp" };
  }

  return null;
}

function serializeReview(review: typeof reviews.$inferSelect) {
  return {
    id: review.id,
    name: review.name,
    role: review.role,
    body: review.body,
    stars: review.stars,
    createdAt: review.createdAt,
    imageUrl: review.imageKey ? `/api/review-images/${review.imageKey}` : null,
  };
}

export default async (request: Request, context: Context) => {
  try {
    if (request.method === "GET") {
      const publicReviews = await db
        .select()
        .from(reviews)
        .orderBy(desc(reviews.createdAt))
        .limit(100);

      return json(publicReviews.map(serializeReview));
    }

    if (request.method === "POST") {
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 4_500_000) {
        return json({ error: "Anmeldelsen eller billedet er for stort." }, 413);
      }

      let payload: FormData;
      try {
        payload = await request.formData();
      } catch {
        return json({ error: "Ugyldige data." }, 400);
      }

      if (cleanText(payload.get("website"), 200)) {
        return json({ accepted: true }, 201);
      }

      const name = cleanText(payload.get("name"), 80);
      const role = cleanText(payload.get("role"), 100) || "Musiker";
      const body = cleanText(payload.get("body"), 1500);
      const stars = Number(payload.get("stars"));

      if (name.length < 2 || body.length < 10) {
        return json({ error: "Skriv dit navn og mindst 10 tegn i anmeldelsen." }, 400);
      }

      if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        return json({ error: "Vælg mellem 1 og 5 stjerner." }, 400);
      }

      const image = payload.get("image");
      let imageKey: string | null = null;

      if (image instanceof File && image.size > 0) {
        if (image.size > 3 * 1024 * 1024) {
          return json({ error: "Billedet må højst fylde 3 MB." }, 413);
        }

        const imageBuffer = await image.arrayBuffer();
        const imageFormat = detectImage(new Uint8Array(imageBuffer.slice(0, 12)));
        if (!imageFormat) {
          return json({ error: "Billedet skal være JPG, PNG eller WEBP." }, 400);
        }

        imageKey = `${crypto.randomUUID()}.${imageFormat.extension}`;
        await imageStore.set(imageKey, imageBuffer);
      }

      try {
        const [createdReview] = await db
          .insert(reviews)
          .values({ name, role, body, stars, imageKey })
          .returning();

        return json(serializeReview(createdReview), 201);
      } catch (error) {
        if (imageKey) await imageStore.delete(imageKey);
        throw error;
      }
    }

    if (request.method === "DELETE") {
      const user = await getUser();
      if (!user?.roles?.includes("admin")) {
        return json({ error: "Kun administratorer kan slette anmeldelser." }, 403);
      }

      const reviewId = Number(context.params.id);
      if (!Number.isInteger(reviewId) || reviewId < 1) {
        return json({ error: "Ugyldigt anmeldelses-id." }, 400);
      }

      const [review] = await db
        .select({ imageKey: reviews.imageKey })
        .from(reviews)
        .where(eq(reviews.id, reviewId))
        .limit(1);

      if (!review) {
        return json({ error: "Anmeldelsen findes ikke." }, 404);
      }

      await db.delete(reviews).where(eq(reviews.id, reviewId));
      if (review.imageKey) {
        try {
          await imageStore.delete(review.imageKey);
        } catch {}
      }

      return new Response(null, { status: 204 });
    }

    return json({ error: "Metoden understøttes ikke." }, 405);
  } catch {
    return json({ error: "Anmeldelserne er midlertidigt utilgængelige." }, 500);
  }
};

export const config: Config = {
  path: ["/api/reviews", "/api/reviews/:id"],
};
