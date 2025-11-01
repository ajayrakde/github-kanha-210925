import { beforeAll, describe, expect, it } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import SalesTrendsCard from "@/components/admin/sales-trends-card"
import type { SalesTrend } from "@/lib/types"

const sampleData: SalesTrend[] = [
  {
    date: "2024-05-01T00:00:00.000Z",
    orders: 12,
    revenue: 3200,
  },
  {
    date: "2024-05-02T00:00:00.000Z",
    orders: 18,
    revenue: 5400,
  },
]

beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === "undefined") {
    ;(globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

describe("SalesTrendsCard legend safeguards", () => {
  it("prevents hiding every metric so the chart never goes blank", async () => {
    const user = userEvent.setup()
    const { container } = render(<SalesTrendsCard data={sampleData} />)

    const legend = within(container).getByTestId("sales-legend")
    const ordersToggle = within(legend).getByRole("button", { name: /orders/i })
    const revenueToggle = within(legend).getByRole("button", { name: /revenue/i })

    await user.click(ordersToggle)
    expect(ordersToggle).toHaveAttribute("aria-pressed", "false")

    await user.click(revenueToggle)
    expect(revenueToggle).toHaveAttribute("aria-pressed", "true")

    const activeButtons = within(legend).getAllByRole("button", { pressed: true })
    expect(activeButtons).toHaveLength(1)
    expect(activeButtons[0]).toHaveTextContent(/revenue/i)
  })

  it("re-activates a metric with available data when current selections become empty", async () => {
    const user = userEvent.setup()
    const { container, rerender } = render(<SalesTrendsCard data={sampleData} />)

    const legend = within(container).getByTestId("sales-legend")
    const ordersToggle = within(legend).getByRole("button", { name: /orders/i })
    const revenueToggle = within(legend).getByRole("button", { name: /revenue/i })

    await user.click(revenueToggle)
    await waitFor(() => expect(revenueToggle).toHaveAttribute("aria-pressed", "false"))
    expect(ordersToggle).toHaveAttribute("aria-pressed", "true")

    const updatedData: SalesTrend[] = [
      {
        date: "2024-05-03T00:00:00.000Z",
        orders: null as unknown as number,
        revenue: 4200,
      },
    ]

    rerender(<SalesTrendsCard data={updatedData} />)

    const updatedLegend = within(container).getByTestId("sales-legend")
    await waitFor(() =>
      expect(within(updatedLegend).getByRole("button", { name: /revenue/i })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    )
    await waitFor(() =>
      expect(within(updatedLegend).getByRole("button", { name: /orders/i })).toHaveAttribute(
        "aria-pressed",
        "false"
      )
    )
  })
})
