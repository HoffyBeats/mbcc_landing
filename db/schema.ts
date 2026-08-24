import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const reviews = pgTable("reviews", {
  id: serial().primaryKey(),
  name: varchar({ length: 80 }).notNull(),
  role: varchar({ length: 100 }).notNull().default("Musiker"),
  body: text().notNull(),
  stars: integer().notNull(),
  imageKey: varchar("image_key", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
