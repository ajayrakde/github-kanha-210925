import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { LegendProps } from "recharts"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { SalesTrend } from "@/lib/types"

const chartConfig = {
  orders: {
    label: "Orders",
    color: "var(--chart-1)",
  },
  revenue: {
    label: "Revenue",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const METRICS = Object.keys(chartConfig) as Array<keyof typeof chartConfig>

type MetricKey = (typeof METRICS)[number]
type LegendEntry = NonNullable<LegendProps["payload"]>[number]

type SalesTrendsCardProps = {
  data: SalesTrend[]
  isLoading?: boolean
  emptyState?: ReactNode
}

type NormalizedTrend = {
  date: Date
  label: string
  orders: number | null
  revenue: number | null
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) {
    return false
  }

  let matches = true
  a.forEach(value => {
    if (!b.has(value)) {
      matches = false
    }
  })

  return matches
}

function toNumeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string") {
    const cleaned = value.trim()
    if (!cleaned) {
      return null
    }

    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeTrends(data: SalesTrend[]): NormalizedTrend[] {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  })

  return data.map(trend => {
    const date = new Date(trend.date)

    return {
      date,
      label: Number.isNaN(date.getTime()) ? trend.date : dateFormatter.format(date),
      orders:
        toNumeric((trend as unknown as { orders?: unknown; orderCount?: unknown }).orders) ??
        toNumeric((trend as unknown as { orderCount?: unknown }).orderCount) ??
        null,
      revenue: toNumeric((trend as unknown as { revenue?: unknown }).revenue) ?? null,
    }
  })
}

function hasRenderableData(metrics: Set<MetricKey>, data: NormalizedTrend[]): boolean {
  if (metrics.size === 0) {
    return false
  }

  return data.some(entry =>
    Array.from(metrics).some(metric => {
      const value = entry[metric]
      return typeof value === "number" && Number.isFinite(value)
    })
  )
}

export default function SalesTrendsCard({
  data,
  isLoading = false,
  emptyState = (
    <div className="flex h-48 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
      <span>No sales data available yet.</span>
      <span>Recent orders will appear here automatically.</span>
    </div>
  ),
}: SalesTrendsCardProps) {
  const normalizedData = useMemo(() => normalizeTrends(data), [data])
  const [visibleMetrics, setVisibleMetrics] = useState<Set<MetricKey>>(
    () => new Set(METRICS)
  )

  const ensureRenderableData = useCallback(
    (candidate: Set<MetricKey>) => hasRenderableData(candidate, normalizedData),
    [normalizedData]
  )

  useEffect(() => {
    setVisibleMetrics(prevVisible => {
      if (ensureRenderableData(prevVisible)) {
        return prevVisible
      }

      for (const metric of METRICS) {
        const candidate = new Set<MetricKey>([metric])
        if (ensureRenderableData(candidate)) {
          return setsEqual(prevVisible, candidate) ? prevVisible : candidate
        }
      }

      const defaultSet = new Set<MetricKey>(METRICS)
      return setsEqual(prevVisible, defaultSet) ? prevVisible : defaultSet
    })
  }, [ensureRenderableData])

  const handleLegendClick = useCallback(
    (payload: LegendEntry) => {
      const metric = (payload?.dataKey ?? payload?.value) as MetricKey | undefined
      if (!metric || !METRICS.includes(metric)) {
        return
      }

      setVisibleMetrics(previous => {
        const next = new Set(previous)

        if (next.has(metric)) {
          next.delete(metric)
        } else {
          next.add(metric)
        }

        if (!ensureRenderableData(next)) {
          return previous
        }

        return next
      })
    },
    [ensureRenderableData]
  )

  const activeMetrics = useMemo(() => Array.from(visibleMetrics), [visibleMetrics])
  const hasData = ensureRenderableData(visibleMetrics)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Sales Trends</CardTitle>
        <CardDescription>Track daily orders and revenue changes.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading trends…
          </div>
        ) : normalizedData.length === 0 ? (
          emptyState
        ) : (
          <div className="space-y-4">
            <ChartContainer
              config={chartConfig}
              className="h-[300px] w-full"
            >
              <LineChart data={normalizedData} margin={{ top: 10, right: 18, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  yAxisId="orders"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  hide
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  hide
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        if (typeof value !== "number") {
                          return value
                        }

                        if (name === chartConfig.revenue.label) {
                          return `₹${value.toLocaleString()}`
                        }

                        return value.toLocaleString()
                      }}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  name={chartConfig.orders.label}
                  yAxisId="orders"
                  stroke="var(--color-orders)"
                  strokeWidth={2}
                  dot={false}
                  hide={!visibleMetrics.has("orders")}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name={chartConfig.revenue.label}
                  yAxisId="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  dot={false}
                  hide={!visibleMetrics.has("revenue")}
                />
              </LineChart>
            </ChartContainer>

            <div className="flex flex-wrap items-center gap-2" data-testid="sales-legend">
              {METRICS.map(metric => {
                const isActive = visibleMetrics.has(metric)
                const label = chartConfig[metric].label

                return (
                  <button
                    key={metric}
                    type="button"
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      isActive
                        ? "border-transparent bg-muted text-foreground"
                        : "border-dashed border-muted-foreground/40 text-muted-foreground"
                    }`}
                    aria-pressed={isActive}
                    onClick={() => handleLegendClick({ dataKey: metric, value: label } as LegendEntry)}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: `var(--color-${metric})` }}
                    />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!hasData && normalizedData.length > 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            No chartable metrics available for the selected data. Showing default metrics.
          </p>
        ) : null}

        <div className="sr-only" aria-live="polite" data-testid="active-metrics">
          {activeMetrics.join(", ")}
        </div>
      </CardContent>
    </Card>
  )
}
