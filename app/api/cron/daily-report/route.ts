import { prisma } from "@/lib/server/db";
import { Resend } from "resend";

const LOW_STOCK_THRESHOLD = 5;

export async function POST() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const transactions = await prisma.inventoryTransaction.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { product: true },
    });

    // Group by productId
    type ProductSummary = {
      name: string;
      sku: string;
      sales: number;
      purchases: number;
      adjustments: number;
      returns: number;
      revenue: number;
    };

    const byProduct = new Map<string, ProductSummary>();

    for (const tx of transactions) {
      if (!byProduct.has(tx.productId)) {
        byProduct.set(tx.productId, {
          name: tx.product.name,
          sku: tx.product.sku,
          sales: 0,
          purchases: 0,
          adjustments: 0,
          returns: 0,
          revenue: 0,
        });
      }
      const s = byProduct.get(tx.productId)!;
      if (tx.type === "SALE") {
        s.sales += tx.quantity;
        s.revenue += tx.quantity * Number(tx.unitPrice ?? tx.product.sellingPrice);
      } else if (tx.type === "PURCHASE") {
        s.purchases += tx.quantity;
      } else if (tx.type === "ADJUSTMENT") {
        s.adjustments += tx.quantity;
      } else if (tx.type === "RETURN") {
        s.returns += tx.quantity;
      }
    }

    // Compute running stock per product from all-time transactions
    const allTime = await prisma.inventoryTransaction.groupBy({
      by: ["productId", "type"],
      _sum: { quantity: true },
    });

    const stockByProduct = new Map<string, number>();
    for (const row of allTime) {
      const prev = stockByProduct.get(row.productId) ?? 0;
      const qty = row._sum.quantity ?? 0;
      if (row.type === "PURCHASE" || row.type === "RETURN") {
        stockByProduct.set(row.productId, prev + qty);
      } else if (row.type === "SALE" || row.type === "ADJUSTMENT") {
        stockByProduct.set(row.productId, prev - qty);
      }
    }

    // Flag low stock
    const allProducts = await prisma.product.findMany();
    const lowStock = allProducts.filter(
      (p) => (stockByProduct.get(p.id) ?? 0) < LOW_STOCK_THRESHOLD
    );

    // Build email
    const date = start.toDateString();
    const summaryRows = [...byProduct.entries()]
      .map(([, s]) => `<tr><td>${s.name}</td><td>${s.sku}</td><td>${s.sales}</td><td>${s.purchases}</td><td>$${s.revenue.toFixed(2)}</td></tr>`)
      .join("");

    const lowStockRows = lowStock
      .map((p) => `<tr><td>${p.name}</td><td>${p.sku}</td><td>${stockByProduct.get(p.id) ?? 0}</td></tr>`)
      .join("");

    const html = `
      <h2>Daily Inventory Report — ${date}</h2>
      <h3>Sales Summary</h3>
      <table border="1" cellpadding="4">
        <thead><tr><th>Product</th><th>SKU</th><th>Units Sold</th><th>Units Purchased</th><th>Revenue</th></tr></thead>
        <tbody>${summaryRows || "<tr><td colspan='5'>No transactions today</td></tr>"}</tbody>
      </table>
      ${
        lowStock.length > 0
          ? `<h3>⚠ Low Stock Alert (below ${LOW_STOCK_THRESHOLD} units)</h3>
             <table border="1" cellpadding="4">
               <thead><tr><th>Product</th><th>SKU</th><th>Current Stock</th></tr></thead>
               <tbody>${lowStockRows}</tbody>
             </table>`
          : "<p>All products are sufficiently stocked.</p>"
      }
    `;

    await resend.emails.send({
      from: "POS Reports <reports@resend.dev>",
      to: process.env.REPORT_EMAIL!,
      subject: `Daily Inventory Report — ${date}`,
      html,
    });

    return Response.json({ data: { sent: true, date }, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ data: null, error: message }, { status: 500 });
  }
}
