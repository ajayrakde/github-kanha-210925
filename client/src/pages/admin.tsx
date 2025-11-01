import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import ProductTable from "@/components/admin/product-table";
import OrderTable from "@/components/admin/order-table";
import OfferTable from "@/components/admin/offer-table";
import UserManagement from "@/components/admin/user-management";
import ProductForm from "@/components/forms/product-form";
import OfferForm from "@/components/forms/offer-form";
import HybridLogin from "@/components/auth/hybrid-login";
import { useAdminAuth } from "@/hooks/use-auth";
import SettingsManagement from "@/components/admin/settings-management";
import ShippingRulesManagement from "@/components/admin/shipping-rules-management";
import PaymentProvidersManagement from "@/components/admin/payment-providers-management";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import type { Product, Offer } from "@shared/schema";
import type { PopularProduct, SalesTrend, ConversionMetrics } from "@/lib/types";

function toNumeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "").trim();
    if (!cleaned) {
      return null;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatCurrency(value: unknown): string {
  const numeric = toNumeric(value);
  return numeric !== null ? numeric.toFixed(2) : "0.00";
}

function toRoundedInteger(value: unknown): number {
  const numeric = toNumeric(value);
  if (numeric === null) {
    return 0;
  }

  return Math.trunc(numeric);
}

function formatInteger(value: unknown): string {
  return toRoundedInteger(value).toLocaleString("en-US");
}

function formatCurrencyInteger(value: unknown): string {
  return formatInteger(value);
}

function formatPercentage(value: unknown): string {
  return `${toRoundedInteger(value)}%`;
}

interface TileProps {
  title: string;
  big: string;
  sub: string;
  bg: string;
}

function Tile({ title, big, sub, bg }: TileProps) {
  const testId = `tile-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div className={cn("rounded-xl border p-4 shadow-sm", bg)} data-testid={testId}>
      <div className="text-sm font-medium text-gray-600">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-current">{big}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

type TabValue = 'products' | 'orders' | 'offers' | 'users' | 'analytics' | 'shipping' | 'payments' | 'settings';

interface OrderStats {
  totalOrders: number;
  revenue: number;
  pendingOrders: number;
  cancelledOrders: number;
}

type Aggregation = "day" | "week" | "month" | "quarter";

interface TimeRangeOption {
  id: string;
  label: string;
  days: number;
}

const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { id: "last_week", label: "Last week", days: 7 },
  { id: "last_month", label: "Last month", days: 30 },
  { id: "last_3_months", label: "Last 3 months", days: 90 },
  { id: "last_6_months", label: "Last 6 months", days: 180 },
  { id: "last_year", label: "Last year", days: 365 },
];

const AGGREGATION_OPTIONS: Array<{ id: Aggregation; label: string }> = [
  { id: "day", label: "D" },
  { id: "week", label: "W" },
  { id: "month", label: "M" },
  { id: "quarter", label: "Q" },
];

type SeriesKey = "revenue" | "orders" | "averageOrderValue";

const SERIES_OPTIONS: Array<{ id: SeriesKey; label: string }> = [
  { id: "revenue", label: "Total sales" },
  { id: "orders", label: "Orders" },
  { id: "averageOrderValue", label: "Average Order Value" },
];

function parseDateLike(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function startOfAggregation(date: Date, aggregation: Aggregation): Date {
  const bucketStart = new Date(date);
  bucketStart.setHours(0, 0, 0, 0);

  if (aggregation === "week") {
    const day = bucketStart.getDay();
    const mondayOffset = (day + 6) % 7;
    bucketStart.setDate(bucketStart.getDate() - mondayOffset);
  }

  if (aggregation === "month") {
    bucketStart.setDate(1);
  }

  if (aggregation === "quarter") {
    const month = bucketStart.getMonth();
    const quarterStartMonth = Math.floor(month / 3) * 3;
    bucketStart.setMonth(quarterStartMonth, 1);
  }

  return bucketStart;
}

function formatAggregationLabel(date: Date, aggregation: Aggregation): string {
  if (aggregation === "week") {
    const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `Wk ${formatted}`;
  }

  if (aggregation === "month") {
    return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }

  if (aggregation === "quarter") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${date.getFullYear()}`;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function AnalyticsTab() {
  const [timeRange, setTimeRange] = useState<TimeRangeOption["id"]>("last_month");
  const [aggregation, setAggregation] = useState<Aggregation>("day");
  const [activeSeries, setActiveSeries] = useState<Record<SeriesKey, boolean>>({
    revenue: true,
    orders: false,
    averageOrderValue: false,
  });
  const [selectedProducts, setSelectedProducts] = useState<string[]>(["all"]);

  const { data: popularProducts = [] } = useQuery<PopularProduct[]>({
    queryKey: ['/api/analytics/popular-products'],
  });

  const { data: salesTrends = [] } = useQuery<SalesTrend[]>({
    queryKey: ['/api/analytics/sales-trends', '?days=365'],
  });

  const { data: conversionMetricsData } = useQuery<ConversionMetrics>({
    queryKey: ['/api/analytics/conversion-metrics'],
  });

  const conversionMetrics = conversionMetricsData ?? {
    registeredUsers: 0,
    monthlyActiveUsers: 0,
    ordersCompleted: 0,
    conversionRate: 0,
    averageOrderValue: 0,
  };

  const registeredUsers = formatInteger(conversionMetrics.registeredUsers);
  const monthlyActiveUsers = formatInteger(conversionMetrics.monthlyActiveUsers);
  const ordersCompleted = formatInteger(conversionMetrics.ordersCompleted);
  const conversionRate = formatPercentage(conversionMetrics.conversionRate);
  const averageOrderValue = `₹${formatCurrencyInteger(conversionMetrics.averageOrderValue)}`;

  const selectedRange =
    TIME_RANGE_OPTIONS.find(option => option.id === timeRange) ?? TIME_RANGE_OPTIONS[0];

  const productOptions = useMemo(() => {
    const seen = new Set<string>();
    return popularProducts
      .map((product, index) => {
        const detailedProduct = product as PopularProduct & {
          name?: string;
          productId?: string;
        };

        const productId =
          detailedProduct.product?.id || detailedProduct.productId || `popular-${index}`;
        if (!productId || seen.has(productId)) {
          return null;
        }

        seen.add(productId);
        const label = detailedProduct.product?.name || detailedProduct.name || "Unknown";
        return { id: productId, label };
      })
      .filter(Boolean) as Array<{ id: string; label: string }>;
  }, [popularProducts]);

  const productShare = useMemo(() => {
    if (selectedProducts.includes("all")) {
      return 1;
    }

    let totalRevenue = 0;
    let selectedRevenue = 0;

    popularProducts.forEach((product, index) => {
      const detailedProduct = product as PopularProduct & {
        totalRevenue?: unknown;
        orderCount?: unknown;
        productId?: string;
      };

      const revenue = toNumeric(detailedProduct.totalRevenue ?? 0) ?? 0;
      const productId =
        detailedProduct.product?.id || detailedProduct.productId || `popular-${index}`;

      totalRevenue += revenue;
      if (productId && selectedProducts.includes(productId)) {
        selectedRevenue += revenue;
      }
    });

    if (totalRevenue <= 0) {
      return 1;
    }

    const share = selectedRevenue / totalRevenue;
    return Math.min(Math.max(share, 0), 1);
  }, [popularProducts, selectedProducts]);

  const chartData = useMemo(() => {
    if (!salesTrends || salesTrends.length === 0) {
      return [] as Array<{ period: string } & Record<SeriesKey, number>>;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (selectedRange.days - 1));

    const buckets = new Map<
      string,
      { date: Date; orders: number; revenue: number }
    >();

    (salesTrends as Array<SalesTrend & { orderCount?: unknown; total?: unknown }>).forEach(
      trend => {
        const rawDate = (trend as any).date ?? (trend as any).day ?? (trend as any).period;
        const parsedDate = parseDateLike(rawDate);
        if (!parsedDate || parsedDate < startDate) {
          return;
        }

        const ordersValue = toNumeric((trend as any).orders ?? trend.orderCount ?? 0) ?? 0;
        const revenueValue = toNumeric((trend as any).revenue ?? (trend as any).total ?? 0) ?? 0;

        const bucketDate = startOfAggregation(parsedDate, aggregation);
        const bucketKey = bucketDate.toISOString();
        const bucket = buckets.get(bucketKey) ?? { date: bucketDate, orders: 0, revenue: 0 };

        bucket.orders += ordersValue;
        bucket.revenue += revenueValue;
        buckets.set(bucketKey, bucket);
      },
    );

    return Array.from(buckets.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(bucket => {
        const scaledOrders = bucket.orders * productShare;
        const scaledRevenue = bucket.revenue * productShare;
        const averageOrderValue = scaledOrders > 0 ? scaledRevenue / scaledOrders : 0;

        return {
          period: formatAggregationLabel(bucket.date, aggregation),
          orders: scaledOrders,
          revenue: scaledRevenue,
          averageOrderValue,
        };
      });
  }, [aggregation, productShare, salesTrends, selectedRange.days]);

  const toggleSeries = useCallback(
    (seriesId: SeriesKey, nextValue: boolean) => {
      setActiveSeries(current => {
        const next = { ...current, [seriesId]: nextValue };
        if (!Object.values(next).some(Boolean)) {
          return current;
        }
        return next;
      });
    },
    [],
  );

  const toggleProduct = useCallback(
    (productId: string) => {
      setSelectedProducts(current => {
        if (productId === "all") {
          return ["all"];
        }

        const withoutAll = current.filter(id => id !== "all");
        const isSelected = withoutAll.includes(productId);

        if (isSelected) {
          const remaining = withoutAll.filter(id => id !== productId);
          return remaining.length > 0 ? remaining : ["all"];
        }

        return [...withoutAll, productId];
      });
    },
    [],
  );

  const salesTrendConfig: ChartConfig = {
    orders: {
      label: 'Orders',
      color: 'hsl(221 83% 53%)',
    },
    revenue: {
      label: 'Total sales',
      color: 'hsl(142 76% 36%)',
    },
    averageOrderValue: {
      label: 'Average Order Value',
      color: 'hsl(32 95% 44%)',
    },
  };

  const showOrdersAxis = activeSeries.orders;
  const showValueAxis = activeSeries.revenue || activeSeries.averageOrderValue;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Analytics Dashboard</h3>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile
          title="Registered Users"
          big={registeredUsers}
          sub={`MAU last month · ${monthlyActiveUsers}`}
          bg="bg-blue-50 border-blue-200 text-blue-700"
        />
        <Tile
          title="Orders Completed"
          big={ordersCompleted}
          sub="Last month"
          bg="bg-green-50 border-green-200 text-green-700"
        />
        <Tile
          title="Conversion Rate"
          big={conversionRate}
          sub="Abandoned carts last month"
          bg="bg-purple-50 border-purple-200 text-purple-700"
        />
        <Tile
          title="Avg Order Value"
          big={averageOrderValue}
          sub=""
          bg="bg-amber-50 border-amber-200 text-amber-700"
        />
      </div>

      {/* Sales Trends Card */}
      <div className="bg-white border rounded-xl shadow-sm">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <div className="border-b border-gray-100 p-4 md:border-b-0 md:border-r">
            <div className="space-y-4" data-testid="analytics-filters">
              <div className="space-y-1">
                <label htmlFor="time-range" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Time range
                </label>
                <select
                  id="time-range"
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={timeRange}
                  onChange={event => setTimeRange(event.target.value)}
                >
                  {TIME_RANGE_OPTIONS.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Aggregate by</div>
                <div className="flex flex-wrap gap-2">
                  {AGGREGATION_OPTIONS.map(option => (
                    <Button
                      key={option.id}
                      type="button"
                      size="sm"
                      variant={aggregation === option.id ? "default" : "outline"}
                      className={cn(
                        "h-8 w-8 p-0 text-xs font-semibold",
                        aggregation === option.id ? "bg-blue-600 text-white" : "text-gray-600"
                      )}
                      aria-pressed={aggregation === option.id}
                      onClick={() => setAggregation(option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Series to plot</div>
                <div className="space-y-2">
                  {SERIES_OPTIONS.map(option => {
                    const checkboxId = `series-${option.id}`;
                    const isChecked = activeSeries[option.id];
                    return (
                      <label
                        key={option.id}
                        htmlFor={checkboxId}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={isChecked}
                          onCheckedChange={value => toggleSeries(option.id, value === true)}
                          aria-checked={isChecked}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Products</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedProducts.includes("all") ? "default" : "outline"}
                    className={cn(
                      "rounded-full px-3 text-xs font-semibold",
                      selectedProducts.includes("all") ? "bg-blue-600 text-white" : "text-gray-600"
                    )}
                    aria-pressed={selectedProducts.includes("all")}
                    onClick={() => toggleProduct("all")}
                  >
                    All products
                  </Button>
                  {productOptions.map(option => {
                    const isActive = selectedProducts.includes(option.id);
                    return (
                      <Button
                        key={option.id}
                        type="button"
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className={cn(
                          "rounded-full px-3 text-xs font-semibold",
                          isActive ? "bg-blue-100 text-blue-700 border-blue-200" : "text-gray-600"
                        )}
                        aria-pressed={isActive}
                        onClick={() => toggleProduct(option.id)}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <p className="text-xs text-gray-500">Default is <strong>Total sales</strong> with <strong>All products</strong>.</p>
            </div>
          </div>

          <div className="p-4">
            <div className="flex items-center justify-between pb-2">
              <h4 className="text-md font-semibold text-gray-800">Sales trend</h4>
              <div className="text-xs text-gray-500">{selectedRange.label}</div>
            </div>
            {chartData.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                  <i className="fas fa-chart-line text-gray-400 text-xl"></i>
                </div>
                <div className="text-gray-600 font-medium">No Sales Data Available</div>
                <div className="text-sm text-gray-500 mt-1">Adjust filters or start collecting orders to see trends.</div>
              </div>
            ) : (
              <ChartContainer
                config={salesTrendConfig}
                className="h-80 w-full"
                data-testid="sales-trend-chart"
              >
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" stroke="#9ca3af" tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="orders"
                    stroke="#9ca3af"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={value => formatInteger(value)}
                    width={40}
                    hide={!showOrdersAxis}
                  />
                  <YAxis
                    yAxisId="value"
                    orientation="right"
                    stroke="#9ca3af"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={value => `₹${formatCurrencyInteger(value)}`}
                    width={60}
                    hide={!showValueAxis}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        formatter={(value, name) => {
                          if (name === 'orders') {
                            return [formatInteger(value), 'Orders'];
                          }
                          if (name === 'revenue') {
                            return [`₹${formatCurrencyInteger(value)}`, 'Total sales'];
                          }
                          if (name === 'averageOrderValue') {
                            return [`₹${formatCurrencyInteger(value)}`, 'Average Order Value'];
                          }
                          return [String(value ?? ''), name];
                        }}
                      />
                    }
                  />
                  <Legend verticalAlign="top" align="right" iconType="line" />
                  {activeSeries.orders ? (
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="var(--color-orders)"
                      strokeWidth={2}
                      yAxisId="orders"
                      activeDot={{ r: 5 }}
                      dot={false}
                    />
                  ) : null}
                  {activeSeries.revenue ? (
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-revenue)"
                      strokeWidth={2}
                      yAxisId="value"
                      activeDot={{ r: 5 }}
                      dot={false}
                    />
                  ) : null}
                  {activeSeries.averageOrderValue ? (
                    <Line
                      type="monotone"
                      dataKey="averageOrderValue"
                      stroke="var(--color-averageOrderValue)"
                      strokeWidth={2}
                      yAxisId="value"
                      activeDot={{ r: 5 }}
                      dot={false}
                    />
                  ) : null}
                </LineChart>
              </ChartContainer>
            )}
          </div>
        </div>
      </div>

      {/* Popular Products */}
      <div className="bg-white p-4 rounded-lg border">
        <h4 className="text-md font-semibold text-gray-800 mb-3">Popular Products</h4>
        {popularProducts.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
              <i className="fas fa-chart-line text-gray-400 text-xl"></i>
            </div>
            <div className="text-gray-600 font-medium">No Product Data Available</div>
            <div className="text-sm text-gray-500 mt-1">Start getting orders to see popular products here</div>
          </div>
        ) : (
          <div className="space-y-2">
            {popularProducts.slice(0, 3).map((product, index) => {
              const popularProduct = product as PopularProduct & {
                name?: string;
                orderCount?: unknown;
                totalRevenue?: unknown;
              };

              const name = popularProduct.product?.name ?? popularProduct.name ?? 'Unknown Product';
              const orderCount = formatInteger(popularProduct.orderCount ?? 0);
              const revenue = formatCurrencyInteger(popularProduct.totalRevenue ?? 0);

              return (
                <div
                  key={(popularProduct as any).productId || popularProduct.product?.id || index}
                  className="flex justify-between items-center bg-gray-50 p-2 rounded border"
                  data-testid={`popular-product-${index}`}
                >
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm mr-3">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{name}</div>
                      <div className="text-xs text-gray-600">{orderCount} orders</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-green-600 text-sm">₹{revenue}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const { isAuthenticated, isLoading, logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<TabValue>('products');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  // Order statistics
  const { data: stats = { totalOrders: 0, revenue: 0, pendingOrders: 0, cancelledOrders: 0 } } = useQuery<OrderStats>({
    queryKey: ['/api/admin/stats'],
    enabled: isAuthenticated,
  });

  const handleProductEdit = (product: any) => {
    setEditingProduct(product as Product);
    setShowProductForm(true);
  };

  const handleOfferEdit = (offer: any) => {
    setEditingOffer(offer as Offer);
    setShowOfferForm(true);
  };

  const handleFormClose = () => {
    setShowProductForm(false);
    setShowOfferForm(false);
    setEditingProduct(null);
    setEditingOffer(null);
  };

  const exportOrders = () => {
    window.open('/api/admin/orders/export', '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="text-lg text-gray-600">Loading admin portal...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HybridLogin 
          userType="admin"
          title="Admin Portal"
          onSuccess={() => {
            // No need to reload, auth hooks will automatically update
          }}
        />
      </div>
    );
  }

  const sidebarItems = [
    { id: 'products', label: 'Products', icon: 'fas fa-box' },
    { id: 'orders', label: 'Orders', icon: 'fas fa-shopping-cart' },
    { id: 'offers', label: 'Offers', icon: 'fas fa-tags' },
    { id: 'users', label: 'Users', icon: 'fas fa-users' },
    { id: 'analytics', label: 'Analytics', icon: 'fas fa-chart-bar' },
    { id: 'shipping', label: 'Shipping', icon: 'fas fa-truck' },
    { id: 'payments', label: 'Payments', icon: 'fas fa-credit-card' },
    { id: 'settings', label: 'Settings', icon: 'fas fa-cog' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={cn(
        "bg-white shadow-lg transition-all duration-300 ease-in-out flex-shrink-0",
        sidebarCollapsed ? "w-16" : "w-64"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200">
            {!sidebarCollapsed && (
              <h1 className="text-xl font-semibold text-gray-900 flex-1">Admin Panel</h1>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              data-testid="toggle-sidebar"
              className={cn(
                "p-2 hover:bg-gray-100 rounded-md border border-gray-300 font-bold text-lg",
                sidebarCollapsed && "mx-auto"
              )}
            >
              <span className="text-gray-600">
                {sidebarCollapsed ? "›" : "‹"}
              </span>
            </Button>
          </div>
          
          {/* Navigation */}
          <nav className={cn("flex-1 py-4 space-y-1", sidebarCollapsed ? "px-2" : "px-4")}>
            {sidebarItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as TabValue)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const nextIndex = (index + 1) % sidebarItems.length;
                    setActiveTab(sidebarItems[nextIndex].id as TabValue);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prevIndex = index === 0 ? sidebarItems.length - 1 : index - 1;
                    setActiveTab(sidebarItems[prevIndex].id as TabValue);
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTab(item.id as TabValue);
                  }
                }}
                className={cn(
                  "w-full flex items-center text-sm font-medium rounded-lg transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
                  sidebarCollapsed ? "px-2 py-3 justify-center" : "px-4 py-3",
                  activeTab === item.id
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 hover:shadow-sm"
                )}
                data-testid={`nav-${item.id}`}
                tabIndex={0}
                role="tab"
                aria-selected={activeTab === item.id}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <i className={cn(item.icon, "text-lg flex-shrink-0", !sidebarCollapsed && "mr-3")}></i>
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {activeTab === item.id && !sidebarCollapsed && (
                  <div className="absolute right-2 w-2 h-2 bg-white rounded-full"></div>
                )}
              </button>
            ))}
          </nav>
          
          {/* Logout */}
          <div className={cn("border-t border-gray-200", sidebarCollapsed ? "p-2" : "p-4")}>
            <Button 
              variant="outline" 
              className={cn("w-full", sidebarCollapsed && "px-2")}
              onClick={() => logout()}
              data-testid="button-admin-logout"
              title={sidebarCollapsed ? "Logout" : undefined}
            >
              <i className={cn("fas fa-sign-out-alt flex-shrink-0", !sidebarCollapsed && "mr-2")}></i>
              {!sidebarCollapsed && <span>Logout</span>}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center h-16 px-4 sm:px-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {sidebarItems.find(item => item.id === activeTab)?.label || 'Dashboard'}
              </h2>
              <p className="text-sm text-gray-600">Manage your store and track performance</p>
            </div>
          </div>
        </header>
        
        {/* Page content */}
        <main>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
            <TabsContent value="products">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 p-4 border-b border-gray-200 bg-white">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Product Management</h3>
                  <p className="text-sm text-gray-600 mt-1">Manage your product catalog and inventory</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setShowProductForm(true)}
                    data-testid="button-add-product"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <i className="fas fa-plus mr-2"></i>Add Product
                  </Button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <ProductTable onEdit={handleProductEdit} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="orders">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 p-4 border-b border-gray-200 bg-white">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Order Management</h3>
                  <p className="text-sm text-gray-600 mt-1">Track and manage customer orders</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={exportOrders}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="button-export-csv"
                  >
                    <i className="fas fa-download mr-2"></i>Export CSV
                  </Button>
                </div>
              </div>
              
              <div className="p-3 bg-white border-b border-gray-200">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xl lg:text-2xl font-bold text-blue-600" data-testid="stat-total-orders">{stats.totalOrders}</div>
                    <div className="text-xs lg:text-sm text-gray-600">Total Orders</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xl lg:text-2xl font-bold text-green-600" data-testid="stat-revenue">₹{formatCurrency(stats.revenue)}</div>
                    <div className="text-xs lg:text-sm text-gray-600">Total Revenue</div>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                    <div className="text-xl lg:text-2xl font-bold text-yellow-600" data-testid="stat-pending-orders">{stats.pendingOrders}</div>
                    <div className="text-xs lg:text-sm text-gray-600">Pending Orders</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xl lg:text-2xl font-bold text-red-600" data-testid="stat-cancelled-orders">{stats.cancelledOrders}</div>
                    <div className="text-xs lg:text-sm text-gray-600">Cancelled Orders</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <OrderTable />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="offers" className="h-full">
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-center mb-4 p-4 border-b border-gray-200 bg-white">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Offer Management</h3>
                    <p className="text-sm text-gray-600 mt-1">Create and manage discount codes and promotions</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setShowOfferForm(true)}
                      data-testid="button-create-offer"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <i className="fas fa-plus mr-2"></i>Create Offer
                    </Button>
                  </div>
                </div>
                <div className="flex-1 bg-gray-50 p-4 overflow-hidden">
                  <div className="w-full overflow-x-auto">
                    <OfferTable onEdit={handleOfferEdit} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="users" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <UserManagement />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <AnalyticsTab />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="shipping" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <ShippingRulesManagement />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="payments" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <PaymentProvidersManagement />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <SettingsManagement />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Product Form Dialog */}
      <Dialog open={showProductForm} onOpenChange={setShowProductForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="product-form-description">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-product">
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
          </DialogHeader>
          <div id="product-form-description" className="sr-only">
            {editingProduct ? 'Form to edit existing product details' : 'Form to add a new product to the store'}
          </div>
          <ProductForm 
            product={editingProduct as any}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      {/* Offer Form Dialog */}
      <Dialog open={showOfferForm} onOpenChange={setShowOfferForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="offer-form-description">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-offer">
              {editingOffer ? 'Edit Offer' : 'Create New Offer'}
            </DialogTitle>
          </DialogHeader>
          <div id="offer-form-description" className="sr-only">
            {editingOffer ? 'Form to edit existing offer details' : 'Form to create a new discount offer'}
          </div>
          <OfferForm 
            offer={editingOffer as any}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}