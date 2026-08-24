CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY,
	"name" varchar(80) NOT NULL,
	"role" varchar(100) DEFAULT 'Musiker' NOT NULL,
	"body" text NOT NULL,
	"stars" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
