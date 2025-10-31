import React from "react";
import { describe, it, expect, vi, afterAll } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Admin from "../admin";

vi.mock("@/hooks/use-auth", () => ({
  useAdminAuth: vi.fn(),
}));

vi.mock("@/components/admin/product-table", () => ({
  __esModule: true,
  default: () => <div data-testid="product-table" />,
}));

vi.mock("@/components/admin/order-table", () => ({
  __esModule: true,
  default: () => <div data-testid="order-table" />,
}));

vi.mock("@/components/admin/offer-table", () => ({
  __esModule: true,
  default: () => <div data-testid="offer-table" />,
}));

vi.mock("@/components/admin/user-management", () => ({
  __esModule: true,
  default: () => <div data-testid="user-management" />,
}));

vi.mock("@/components/forms/product-form", () => ({
  __esModule: true,
  default: (props: { onClose: () => void }) => (
    <button type="button" data-testid="product-form" onClick={props.onClose}>
      Close
    </button>
  ),
}));

vi.mock("@/components/forms/offer-form", () => ({
  __esModule: true,
  default: (props: { onClose: () => void }) => (
    <button type="button" data-testid="offer-form" onClick={props.onClose}>
      Close
    </button>
  ),
}));

vi.mock("@/components/admin/settings-management", () => ({
  __esModule: true,
  default: () => <div data-testid="settings-management" />,
}));

vi.mock("@/components/admin/shipping-rules-management", () => ({
  __esModule: true,
  default: () => <div data-testid="shipping-rules" />,
}));

vi.mock("@/components/admin/payment-providers-management", () => ({
  __esModule: true,
  default: () => <div data-testid="payment-providers" />,
}));

vi.mock("@/components/auth/hybrid-login", () => ({
  __esModule: true,
  default: () => <div data-testid="hybrid-login" />,
}));

import { useAdminAuth } from "@/hooks/use-auth";

const useAdminAuthMock = vi.mocked(useAdminAuth);

function renderAdminWithData() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  const nowIso = new Date("2024-05-01T10:00:00Z").toISOString();

  queryClient.setQueryData(["/api/admin/stats"], {
    totalOrders: 42,
    revenue: "1000.5",
    pendingOrders: 3,
    cancelledOrders: 1,
  } as any);

  queryClient.setQueryData(["/api/analytics/popular-products"], [
    {
      productId: "prod-1",
      name: "Sample Product",
      orderCount: "5",
      totalRevenue: "1234.5",
    },
  ] as any);

  queryClient.setQueryData(["/api/analytics/sales-trends"], [
    {
      date: nowIso,
      orderCount: "3",
      revenue: "4321.8",
    },
  ] as any);

  queryClient.setQueryData(["/api/analytics/conversion-metrics"], {
    totalSessions: "100",
    ordersCompleted: "25",
    conversionRate: "25%",
    averageOrderValue: "250.456",
  } as any);

  queryClient.setQueryData(["/api/abandoned-carts"], [
    {
      sessionId: "session-123",
      items: "2",
      totalValue: "98.765",
      lastActivity: nowIso,
    },
  ] as any);

  render(
    <QueryClientProvider client={queryClient}>
      <Admin />
    </QueryClientProvider>
  );
}

describe("Admin analytics tab", () => {
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders monetary metrics when API responses are numeric strings", async () => {
    useAdminAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });

    global.fetch = vi.fn();
    const user = userEvent.setup();
    renderAdminWithData();

    const analyticsTab = await screen.findByTestId("nav-analytics");
    await user.click(analyticsTab);

    const popularProductRow = await screen.findByTestId("popular-product-0");
    expect(popularProductRow).toHaveTextContent("₹1234.50");

    const salesTrendRow = await screen.findByTestId("sales-trend-0");
    expect(salesTrendRow).toHaveTextContent("₹4321.80");

    const abandonedCartRow = await screen.findByTestId("abandoned-cart-0");
    expect(abandonedCartRow).toHaveTextContent("₹98.77");

    expect(screen.getByTestId("stat-avg-order-value")).toHaveTextContent("₹250.46");
  });
});

