import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { withTimeout } from "@/lib/with-timeout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Aggregated admin dashboard payload.
 * Bounded queries + timeouts so one slow section cannot hang forever.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { requireAdmin: true });
  if (!auth.authenticated) {
    return NextResponse.json(
      { success: false, error: { code: "unauthorized", message: auth.error || "Unauthorized" } },
      { status: 401 }
    );
  }

  const started = Date.now();

  async function safeSection<T>(
    name: string,
    fn: () => Promise<T>,
    fallback: T,
    ms = 8_000
  ): Promise<{ name: string; ok: boolean; data: T; error?: string; ms: number }> {
    const t0 = Date.now();
    try {
      const data = await withTimeout(fn(), ms, name);
      return { name, ok: true, data, ms: Date.now() - t0 };
    } catch (err: any) {
      console.error(`[admin/dashboard] ${name} failed:`, err?.message || err);
      return {
        name,
        ok: false,
        data: fallback,
        error: err?.message || "failed",
        ms: Date.now() - t0,
      };
    }
  }

  const [ordersSection, recentSection, lowStockSection, productsSection, customersSection] =
    await Promise.all([
      safeSection(
        "orders_stats",
        async () => {
          const { data, error } = await supabaseAdmin
            .from("orders")
            .select("total, payment_status, created_at, email")
            .order("created_at", { ascending: false })
            .limit(2000);
          if (error) throw new Error(error.message);
          return data || [];
        },
        [] as any[]
      ),
      safeSection(
        "recent_orders",
        async () => {
          const { data, error } = await supabaseAdmin
            .from("orders")
            .select(
              "id, order_number, user_id, email, created_at, total, status, shipping_address, payment_status"
            )
            .eq("payment_status", "paid")
            .order("created_at", { ascending: false })
            .limit(5);
          if (error) throw new Error(error.message);
          return data || [];
        },
        [] as any[]
      ),
      safeSection(
        "low_stock",
        async () => {
          const { data, error } = await supabaseAdmin
            .from("products")
            .select("name, quantity")
            .lt("quantity", 10)
            .order("quantity", { ascending: true })
            .limit(5);
          if (error) throw new Error(error.message);
          return data || [];
        },
        [] as any[]
      ),
      safeSection(
        "top_products",
        async () => {
          const { data, error } = await supabaseAdmin
            .from("products")
            .select("id, name, slug, quantity, product_images(url)")
            .order("created_at", { ascending: false })
            .limit(4);
          if (error) throw new Error(error.message);
          return data || [];
        },
        [] as any[]
      ),
      safeSection(
        "customers_count",
        async () => {
          const { count, error } = await supabaseAdmin
            .from("customers")
            .select("id", { count: "exact", head: true });
          if (error) throw new Error(error.message);
          return count ?? 0;
        },
        0
      ),
    ]);

  const allOrders = ordersSection.data || [];
  const paidOrders = allOrders.filter((o: any) => o.payment_status === "paid");
  const totalRevenue = paidOrders.reduce(
    (sum: number, order: any) => sum + (Number(order.total) || 0),
    0
  );
  const totalOrders = allOrders.length;
  const paidOrderCount = paidOrders.length;
  const avgOrderValue = paidOrderCount > 0 ? totalRevenue / paidOrderCount : 0;
  const uniqueCustomers = new Set(allOrders.map((o: any) => o.email).filter(Boolean)).size;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });
  const chartMap: Record<string, number> = {};
  for (const date of last7Days) chartMap[date] = 0;
  for (const order of paidOrders) {
    const date = new Date(order.created_at).toISOString().split("T")[0];
    if (chartMap[date] !== undefined) {
      chartMap[date] += Number(order.total) || 0;
    }
  }
  const chartData = Object.keys(chartMap).map((date) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    revenue: chartMap[date],
  }));

  const degraded = [
    ordersSection,
    recentSection,
    lowStockSection,
    productsSection,
    customersSection,
  ].some((s) => !s.ok);

  return NextResponse.json({
    success: true,
    degraded,
    durationMs: Date.now() - started,
    sections: {
      orders_stats: { ok: ordersSection.ok, ms: ordersSection.ms, error: ordersSection.error },
      recent_orders: { ok: recentSection.ok, ms: recentSection.ms, error: recentSection.error },
      low_stock: { ok: lowStockSection.ok, ms: lowStockSection.ms, error: lowStockSection.error },
      top_products: { ok: productsSection.ok, ms: productsSection.ms, error: productsSection.error },
      customers_count: {
        ok: customersSection.ok,
        ms: customersSection.ms,
        error: customersSection.error,
      },
    },
    data: {
      stats: {
        totalRevenue,
        totalOrders,
        uniqueCustomers: customersSection.ok
          ? Math.max(customersSection.data, uniqueCustomers)
          : uniqueCustomers,
        avgOrderValue,
        paidOrderCount,
      },
      chartData,
      recentOrders: recentSection.data,
      lowStockProducts: lowStockSection.data,
      topProducts: productsSection.data,
    },
  });
}
