import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const SALES_COLOR = "#2563eb";
const ORDERS_COLOR = "#16a34a";
const BAR_COLORS = ["#7c3aed", "#f59e0b", "#0ea5e9", "#ef4444", "#10b981"];

const PRODUCT_NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const AGGREGATION_LABEL: Record<Aggregation, string> = {
  day: "D",
  week: "W",
  month: "M",
  quarter: "Q",
};

const RANGE_OPTIONS: RangeOption[] = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "last_6_months", label: "Last 6 months" },
  { id: "this_year", label: "This year" },
  { id: "last_year", label: "Last year" },
];

const DEFAULT_AGGREGATION: Record<RangeId, Aggregation> = {
  this_week: "day",
  last_week: "day",
  this_month: "day",
  last_month: "day",
  last_3_months: "week",
  last_6_months: "week",
  this_year: "month",
  last_year: "month",
};

const DISABLED_AGGREGATIONS: Partial<Record<RangeId, Aggregation[]>> = {
  this_year: ["day"],
  last_year: ["day"],
};

const METRIC_LABELS: Record<MetricKey, string> = {
  sales: "Sales",
  orders: "Orders",
};

type RangeId =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "last_year";

type Aggregation = "day" | "week" | "month" | "quarter";

type MetricKey = "sales" | "orders";

type SplitDirection = "top" | "bottom";

type RangeOption = {
  id: RangeId;
  label: string;
};

type DailyPoint = {
  date: Date;
  revenue: number;
  orders: number;
  products: Array<{
    name: string;
    revenue: number;
    orders: number;
  }>;
};

type AggregatedPoint = {
  date: Date;
  label: string;
  revenue: number;
  orders: number;
  products: Array<{
    name: string;
    revenue: number;
    orders: number;
  }>;
};

type LegendItem = {
  dataKey: string;
  value: string;
  color: string;
  inactive?: boolean;
  key: string;
  variant: "line" | "bar";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfWeek(date: Date) {
  const result = startOfWeek(date);
  result.setDate(result.getDate() + 6);
  return result;
}

function startOfMonth(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfMonth(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfQuarter(date: Date) {
  const startMonth = Math.floor(date.getMonth() / 3) * 3;
  const result = new Date(date.getFullYear(), startMonth, 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function pseudoRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getRangeBounds(rangeId: RangeId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (rangeId) {
    case "this_week": {
      const start = startOfWeek(today);
      const end = new Date(today);
      return { start, end };
    }
    case "last_week": {
      const end = new Date(startOfWeek(today));
      end.setDate(end.getDate() - 1);
      const start = startOfWeek(end);
      return { start, end };
    }
    case "this_month": {
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      return { start, end };
    }
    case "last_month": {
      const end = new Date(startOfMonth(today));
      end.setDate(end.getDate() - 1);
      const start = startOfMonth(end);
      return { start, end };
    }
    case "last_3_months": {
      const start = startOfMonth(new Date(today.getFullYear(), today.getMonth() - 3, 1));
      const end = endOfMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      return { start, end };
    }
    case "last_6_months": {
      const start = startOfMonth(new Date(today.getFullYear(), today.getMonth() - 6, 1));
      const end = endOfMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      return { start, end };
    }
    case "this_year": {
      const start = new Date(today.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(today);
      return { start, end };
    }
    case "last_year": {
      const start = new Date(today.getFullYear() - 1, 0, 1);
      const end = new Date(today.getFullYear() - 1, 11, 31);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      return { start, end };
    }
    default: {
      const start = new Date(today);
      return { start, end: new Date(today) };
    }
  }
}

function formatDailyLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getWeekNumber(date: Date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * MS_IN_DAY));
}

function formatAggregationLabel(date: Date, aggregation: Aggregation) {
  switch (aggregation) {
    case "day":
      return formatDailyLabel(date);
    case "week": {
      const weekNumber = getWeekNumber(date);
      return `Wk ${weekNumber}`;
    }
    case "month":
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
      }).format(date);
    case "quarter": {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      return `Q${quarter} ${date.getFullYear()}`;
    }
    default:
      return formatDailyLabel(date);
  }
}

function aggregateData(data: DailyPoint[], aggregation: Aggregation): AggregatedPoint[] {
  const buckets = new Map<string, AggregatedPoint>();

  data.forEach(point => {
    const bucketStart = getBucketStart(point.date, aggregation);
    const bucketKey = bucketStart.toISOString();
    const existing = buckets.get(bucketKey);

    if (!existing) {
      buckets.set(bucketKey, {
        date: bucketStart,
        label: formatAggregationLabel(bucketStart, aggregation),
        revenue: point.revenue,
        orders: point.orders,
        products: point.products.map(product => ({
          name: product.name,
          revenue: product.revenue,
          orders: product.orders,
        })),
      });
      return;
    }

    existing.revenue += point.revenue;
    existing.orders += point.orders;
    existing.products = existing.products.map((product, index) => ({
      name: product.name,
      revenue: product.revenue + point.products[index].revenue,
      orders: product.orders + point.products[index].orders,
    }));
  });

  return Array.from(buckets.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getBucketStart(date: Date, aggregation: Aggregation) {
  const bucket = new Date(date);
  bucket.setHours(0, 0, 0, 0);

  if (aggregation === "week") {
    return startOfWeek(bucket);
  }
  if (aggregation === "month") {
    return startOfMonth(bucket);
  }
  if (aggregation === "quarter") {
    return startOfQuarter(bucket);
  }
  return bucket;
}

function formatCurrency(value: number) {
  return `₹${Math.trunc(value).toLocaleString("en-IN")}`;
}

function formatInteger(value: number) {
  return Math.trunc(value).toLocaleString("en-IN");
}

function generateDailyData(rangeId: RangeId): DailyPoint[] {
  const { start, end } = getRangeBounds(rangeId);
  const points: DailyPoint[] = [];

  for (
    let time = start.getTime(), index = 0;
    time <= end.getTime();
    time += MS_IN_DAY, index += 1
  ) {
    const date = new Date(time);
    const products = PRODUCT_NAMES.map((name, productIndex) => {
      const revenueBase = 4000 + productIndex * 650;
      const revenueSeasonality = Math.sin(index / 5 + productIndex) * 1200;
      const revenueNoise = pseudoRandom(index * 17 + productIndex * 13) * 900;
      const revenue = Math.max(250, revenueBase + revenueSeasonality + revenueNoise);

      const ordersBase = 18 + productIndex * 2.5;
      const ordersSeasonality = Math.sin(index / 3 + productIndex) * 4;
      const ordersNoise = pseudoRandom(index * 19 + productIndex * 11) * 6;
      const orders = Math.max(4, ordersBase + ordersSeasonality + ordersNoise);

      return {
        name,
        revenue,
        orders,
      };
    });

    const revenueTotal = products.reduce((sum, product) => sum + product.revenue, 0);
    const ordersTotal = products.reduce((sum, product) => sum + product.orders, 0);

    points.push({
      date,
      revenue: revenueTotal,
      orders: ordersTotal,
      products,
    });
  }

  return points;
}

function legendItemClassName(active: boolean, muted: boolean) {
  const base = "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition";
  if (!active) {
    return `${base} border-gray-200 bg-gray-100 text-gray-400`;
  }
  if (muted) {
    return `${base} border-gray-200 bg-gray-100 text-gray-400`;
  }
  return `${base} border-gray-200 bg-white text-gray-600`;
}

export function SalesTrendsCard() {
  const [rangeId, setRangeId] = useState<RangeId>("this_month");
  const [aggregation, setAggregation] = useState<Aggregation>(DEFAULT_AGGREGATION.this_month);
  const [metrics, setMetrics] = useState<Record<MetricKey, boolean>>({ sales: true, orders: false });
  const [splittingEnabled, setSplittingEnabled] = useState(false);
  const [splitCount, setSplitCount] = useState(3);
  const [splitDirection, setSplitDirection] = useState<SplitDirection>("top");
  const [splitTipVisible, setSplitTipVisible] = useState(false);
  const [mutedLines, setMutedLines] = useState<Record<string, boolean>>({});
  const [hiddenSplits, setHiddenSplits] = useState<Record<string, boolean>>({});
  const previousRangeRef = useRef<RangeId>(rangeId);

  const allowedAggregations = useMemo(() => {
    const disabled = new Set(DISABLED_AGGREGATIONS[rangeId] ?? []);
    return (Object.keys(AGGREGATION_LABEL) as Aggregation[]).filter(key => !disabled.has(key));
  }, [rangeId]);

  useEffect(() => {
    if (previousRangeRef.current !== rangeId) {
      previousRangeRef.current = rangeId;
      setAggregation(DEFAULT_AGGREGATION[rangeId]);
    }
  }, [rangeId]);

  useEffect(() => {
    const allowed = allowedAggregations;
    if (!allowed.includes(aggregation)) {
      setAggregation(DEFAULT_AGGREGATION[rangeId]);
    }
  }, [aggregation, allowedAggregations, rangeId]);

  const dailyData = useMemo(() => generateDailyData(rangeId), [rangeId]);

  const aggregatedData = useMemo(
    () => aggregateData(dailyData, aggregation),
    [dailyData, aggregation],
  );

  const activeMetricCount = Number(metrics.sales) + Number(metrics.orders);
  const splittingMetric: MetricKey | null = splittingEnabled && activeMetricCount === 1
    ? (metrics.sales ? "sales" : "orders")
    : null;

  const productTotals = useMemo(() => {
    const totals = PRODUCT_NAMES.map(name => ({
      name,
      revenue: 0,
      orders: 0,
    }));

    aggregatedData.forEach(point => {
      point.products.forEach((product, index) => {
        totals[index].revenue += product.revenue;
        totals[index].orders += product.orders;
      });
    });

    return totals;
  }, [aggregatedData]);

  const splitSeries = useMemo(() => {
    if (!splittingMetric) {
      return [] as SplitSeries[];
    }

    const seriesMetric = splittingMetric === "sales" ? "revenue" : "orders";
    const sorted = productTotals
      .map((product, index) => ({
        index,
        total: product[seriesMetric],
      }))
      .sort((a, b) => (splitDirection === "top" ? b.total - a.total : a.total - b.total));

    const count = clamp(splitCount, 1, 5);

    return sorted.slice(0, count).map((item, slot) => ({
      slot,
      key: `${splittingMetric === "sales" ? "rev" : "ord"}_${slot}`,
      productIndex: item.index,
      name: PRODUCT_NAMES[item.index],
      color: BAR_COLORS[slot % BAR_COLORS.length],
      metric: splittingMetric,
    }));
  }, [productTotals, splitCount, splitDirection, splittingMetric]);

  useEffect(() => {
    setHiddenSplits(previous => {
      const next: Record<string, boolean> = {};
      splitSeries.forEach(series => {
        next[series.key] = previous[series.key] ?? false;
      });
      return next;
    });
  }, [splitSeries]);

  const chartData = useMemo(() => {
    return aggregatedData.map(point => {
      const entry: Record<string, string | number> = {
        bucket: point.label,
      };

      entry.revenue = Math.trunc(point.revenue);
      entry.orders = Math.trunc(point.orders);

      splitSeries.forEach(series => {
        const product = point.products[series.productIndex];
        if (!product) {
          return;
        }
        const value = series.metric === "sales" ? product.revenue : product.orders;
        entry[series.key] = Math.trunc(value);
      });

      return entry;
    });
  }, [aggregatedData, splitSeries]);

  const legendPayload = useMemo(() => {
    const payload: LegendItem[] = [];
    const linesSuppressed = Boolean(splittingMetric);

    (Object.keys(metrics) as MetricKey[]).forEach(metricKey => {
      payload.push({
        key: metricKey,
        dataKey: metricKey === "sales" ? "revenue" : "orders",
        value: METRIC_LABELS[metricKey],
        color: metricKey === "sales" ? SALES_COLOR : ORDERS_COLOR,
        inactive: !metrics[metricKey] || linesSuppressed,
        variant: "line",
      });
    });

    splitSeries.forEach(series => {
      payload.push({
        key: series.key,
        dataKey: series.key,
        value: series.name,
        color: series.color,
        inactive: false,
        variant: "bar",
      });
    });

    return payload;
  }, [metrics, splitSeries, splittingMetric]);

  const handleMetricToggle = useCallback(
    (metric: MetricKey, checked: boolean) => {
      setMetrics(current => {
        if (!checked && current[metric] && Number(current.sales) + Number(current.orders) === 1) {
          return current;
        }

        const next = { ...current, [metric]: checked };
        const activeAfter = Number(next.sales) + Number(next.orders);

        if (splittingEnabled && activeAfter > 1) {
          if (metric === "sales") {
            next.orders = false;
          } else {
            next.sales = false;
          }
        }

        return next;
      });
    },
    [splittingEnabled],
  );

  const handleSplitToggle = useCallback(
    (checked: boolean) => {
      setSplittingEnabled(checked);
      if (checked) {
        setSplitTipVisible(false);
        setMutedLines({});
        setHiddenSplits({});
        setSplitCount(previous => clamp(previous, 1, 5));
        setSplitDirection("top");
        setMetrics(current => {
          if (current.sales && current.orders) {
            setSplitTipVisible(true);
            return { sales: false, orders: true };
          }
          return current;
        });
      } else {
        setSplitTipVisible(false);
      }
    },
    [],
  );

  const handleSplitCountChange = useCallback((nextCount: number) => {
    setSplitCount(clamp(nextCount, 1, 5));
  }, []);

  const handleDirectionToggle = useCallback((direction: SplitDirection) => {
    setSplitDirection(direction);
  }, []);

  const handleLegendClick = useCallback(
    (item: LegendItem) => {
      if (item.variant === "line") {
        if (splittingMetric) {
          return;
        }
        setMutedLines(current => ({ ...current, [item.dataKey as string]: !current[item.dataKey as string] }));
        return;
      }

      setHiddenSplits(current => ({ ...current, [item.dataKey as string]: !current[item.dataKey as string] }));
    },
    [splittingMetric],
  );

  const tooltipContent = useCallback(
    ({ active, payload, label }: any) => {
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      const visiblePayload = (payload as any[]).filter(item => {
        const key = String(item.dataKey ?? "");
        if (key.startsWith("rev") || key.startsWith("ord")) {
          return !hiddenSplits[key];
        }
        return true;
      });

      if (visiblePayload.length === 0) {
        return null;
      }

      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-gray-800">{label}</div>
          <div className="space-y-1 text-sm text-gray-700">
            {visiblePayload.map(item => {
              const key = String(item.dataKey ?? "");
              const rawValue = Number(item.value ?? 0);
              let valueLabel = key;
              let displayValue = String(rawValue);

              if (key === "revenue") {
                valueLabel = METRIC_LABELS.sales;
                displayValue = formatCurrency(rawValue);
              } else if (key === "orders") {
                valueLabel = METRIC_LABELS.orders;
                displayValue = formatInteger(rawValue);
              } else if (key.startsWith("rev") || key.startsWith("ord")) {
                const series = splitSeries.find(entry => entry.key === key);
                if (series) {
                  valueLabel = `${series.name} ${series.metric === "sales" ? "Sales" : "Orders"}`;
                }
                displayValue = key.startsWith("rev") ? formatCurrency(rawValue) : formatInteger(rawValue);
              }

              return (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span>{valueLabel}</span>
                  <span className="font-semibold">{displayValue}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    },
    [hiddenSplits, splitSeries],
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="grid gap-6 p-4 md:grid-cols-4">
        <div className="space-y-5 md:col-span-1" data-testid="sales-trends-controls">
          <div className="space-y-2">
            <label
              htmlFor="sales-trends-range"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Time range
            </label>
            <select
              id="sales-trends-range"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={rangeId}
              onChange={event => setRangeId(event.target.value as RangeId)}
            >
              {RANGE_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Data</div>
            {(Object.keys(metrics) as MetricKey[]).map(metricKey => {
              const checkboxId = `metric-${metricKey}`;
              return (
                <label key={metricKey} htmlFor={checkboxId} className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox
                    id={checkboxId}
                    checked={metrics[metricKey]}
                    onCheckedChange={value => handleMetricToggle(metricKey, value === true)}
                    aria-checked={metrics[metricKey]}
                  />
                  <span>{METRIC_LABELS[metricKey]}</span>
                </label>
              );
            })}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                id="apply-splitting"
                checked={splittingEnabled}
                onCheckedChange={value => handleSplitToggle(value === true)}
                aria-checked={splittingEnabled}
              />
              <span className={splittingEnabled ? "text-gray-700" : "text-gray-400"}>Apply splitting</span>
            </label>

            {splittingEnabled ? (
              <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Number of products</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => handleSplitCountChange(splitCount - 1)}
                    >
                      −
                    </Button>
                    <input
                      id="split-count"
                      type="number"
                      min={1}
                      max={5}
                      value={splitCount}
                      onChange={event => handleSplitCountChange(Number(event.target.value))}
                      className="h-8 w-16 rounded-md border border-gray-200 bg-white text-center text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => handleSplitCountChange(splitCount + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order direction</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={splitDirection === "top" ? "default" : "outline"}
                      className="h-8 px-3 text-xs font-semibold"
                      onClick={() => handleDirectionToggle("top")}
                    >
                      ▼ Descending
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={splitDirection === "bottom" ? "default" : "outline"}
                      className="h-8 px-3 text-xs font-semibold"
                      onClick={() => handleDirectionToggle("bottom")}
                    >
                      ▲ Ascending
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {splitTipVisible ? (
              <p className="text-xs text-blue-600">Splitting needs a single metric, so Orders stays active.</p>
            ) : null}
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="space-y-1">
              <h4 className="text-base font-semibold text-gray-800">Sales trends</h4>
              <p className="text-xs text-gray-500">Interactive revenue and order performance overview.</p>
            </div>
            <div className="flex items-center gap-2 self-end md:self-start" role="group" aria-label="Aggregation">
              {(Object.keys(AGGREGATION_LABEL) as Aggregation[]).map(option => {
                const disabled = !allowedAggregations.includes(option);
                return (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={aggregation === option ? "default" : "outline"}
                    className="h-8 w-8 p-0 text-xs font-semibold"
                    aria-pressed={aggregation === option}
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) {
                        setAggregation(option);
                      }
                    }}
                  >
                    {AGGREGATION_LABEL[option]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d1d5db" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
                <YAxis
                  yAxisId="orders"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                  tickFormatter={value => formatInteger(value as number)}
                  width={40}
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                  tickFormatter={value => formatCurrency(value as number)}
                  width={60}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "#9ca3af" }} content={tooltipContent} />
                <Legend
                  verticalAlign="top"
                  align="left"
                  iconType="circle"
                  payload={legendPayload}
                  content={({ payload }) => (
                    <div className="flex flex-wrap gap-2 pt-2" data-testid="sales-trends-legend">
                      {(payload as LegendItem[] | undefined)?.map(item => {
                        const isMuted = Boolean(mutedLines[item.dataKey as string]);
                        const isHidden = Boolean(hiddenSplits[item.dataKey as string]);
                        const active = !item.inactive && !(item.variant === "bar" && isHidden);
                        const showIndicator = item.variant === "bar" ? !isHidden : true;

                        return (
                          <button
                            key={item.dataKey}
                            type="button"
                            onClick={() => handleLegendClick(item)}
                            className={legendItemClassName(active, isMuted)}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor: showIndicator ? item.color : "#d1d5db",
                                opacity: item.variant === "line" && isMuted ? 0.4 : 1,
                              }}
                            />
                            <span>{item.value}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                />

                {splitSeries.map(series => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    yAxisId={series.metric === "sales" ? "revenue" : "orders"}
                    barSize={14}
                    radius={[3, 3, 0, 0]}
                    fill={series.color}
                    opacity={hiddenSplits[series.key] ? 0 : 1}
                    isAnimationActive={false}
                  />
                ))}

                {metrics.sales && !splittingMetric ? (
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    yAxisId="revenue"
                    stroke={SALES_COLOR}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    strokeOpacity={mutedLines.revenue ? 0.4 : 1}
                  />
                ) : null}

                {metrics.orders && !splittingMetric ? (
                  <Line
                    type="monotone"
                    dataKey="orders"
                    yAxisId="orders"
                    stroke={ORDERS_COLOR}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    strokeOpacity={mutedLines.orders ? 0.4 : 1}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}

interface SplitSeries {
  slot: number;
  key: string;
  productIndex: number;
  name: string;
  color: string;
  metric: MetricKey;
}

export default SalesTrendsCard;
