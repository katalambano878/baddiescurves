import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { withTimeout } from "@/lib/with-timeout";
import { normalizeCurrency, sumByCurrency } from "@/lib/format-money";

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

  // Chart range: 7 days unless the page asks for 30.
  const days = new URL(req.url).searchParams.get("days") === "30" ? 30 : 7;

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
            .select("total, currency, payment_status, created_at, email")
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
              "id, order_number, user_id, email, created_at, total, currency, status, shipping_address, payment_status"
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
  // Cedis and dollars are kept apart: an order's total is in the order's own currency.
  const revenueByCurrency = sumByCurrency(
    paidOrders,
    (o: any) => o.total,
    (o: any) => o.currency
  );
  const paidCountByCurrency = { GHS: 0, USD: 0 };
  for (const order of paidOrders) paidCountByCurrency[normalizeCurrency(order.currency)] += 1;
  const avgOrderValueByCurrency = {
    GHS: paidCountByCurrency.GHS > 0 ? revenueByCurrency.GHS / paidCountByCurrency.GHS : 0,
    USD: paidCountByCurrency.USD > 0 ? revenueByCurrency.USD / paidCountByCurrency.USD : 0,
  };
  const totalOrders = allOrders.length;
  const paidOrderCount = paidOrders.length;
  const uniqueCustomers = new Set(
    allOrders.map((o: any) => String(o.email || "").trim().toLowerCase()).filter(Boolean)
  ).size;

  const chartDays = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().split("T")[0];
  });
  const chartMap: Record<string, { GHS: number; USD: number }> = {};
  for (const date of chartDays) chartMap[date] = { GHS: 0, USD: 0 };
  for (const order of paidOrders) {
    const date = new Date(order.created_at).toISOString().split("T")[0];
    if (chartMap[date] !== undefined) {
      chartMap[date][normalizeCurrency(order.currency)] += Number(order.total) || 0;
    }
  }
  // `revenue` is cedis only (the chart axis is in GH₵); dollars travel beside it, never added in.
  const chartData = chartDays.map((date) => ({
    date: new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    revenue: chartMap[date].GHS,
    revenueGHS: chartMap[date].GHS,
    revenueUSD: chartMap[date].USD,
  }));
  const chartTotals = {
    GHS: chartDays.reduce((sum, date) => sum + chartMap[date].GHS, 0),
    USD: chartDays.reduce((sum, date) => sum + chartMap[date].USD, 0),
  };

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
        revenueByCurrency,
        avgOrderValueByCurrency,
        paidCountByCurrency,
        totalOrders,
        uniqueCustomers: customersSection.ok
          ? Math.max(customersSection.data, uniqueCustomers)
          : uniqueCustomers,
        paidOrderCount,
      },
      days,
      chartData,
      chartTotals,
      recentOrders: recentSection.data,
      lowStockProducts: lowStockSection.data,
      topProducts: productsSection.data,
    },
  });
}
