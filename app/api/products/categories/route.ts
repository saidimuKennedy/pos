import { prisma } from "@/lib/server/db";

export async function GET() {
  try {
    const rows = await prisma.product.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });

    const categories = rows.map((r) => r.category as string);
    return Response.json({ data: { categories }, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ data: null, error: message }, { status: 500 });
  }
}
