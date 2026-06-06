-- Add lowest_price floor to products
ALTER TABLE "products" ADD COLUMN "lowest_price" DECIMAL;

-- Enum for incident reasons
CREATE TYPE "IncidentReason" AS ENUM ('OUT_OF_STOCK', 'PRICE_TOO_HIGH', 'NOT_AVAILABLE', 'OTHER');

-- Missed-sale incidents table
CREATE TABLE "incidents" (
    "id"           TEXT NOT NULL,
    "product_id"   TEXT,
    "product_name" TEXT NOT NULL,
    "reason"       "IncidentReason" NOT NULL,
    "note"         TEXT,
    "device_id"    TEXT NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at"    TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- FK (optional — product may have been deleted)
ALTER TABLE "incidents"
    ADD CONSTRAINT "incidents_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "incidents_product_id_idx" ON "incidents"("product_id");
CREATE INDEX "incidents_created_at_idx" ON "incidents"("created_at");
