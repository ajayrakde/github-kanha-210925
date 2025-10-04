import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Payment from "../payment";
import { apiRequest } from "@/lib/queryClient";

const setLocationMock = vi.fn();
const originalLocation = window.location;

vi.mock("wouter", () => ({
  useLocation: () => ["", setLocationMock],
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

describe("Payment page", () => {
  beforeEach(() => {
    setLocationMock.mockReset();
    apiRequestMock.mockReset();
    sessionStorage.clear();
    global.fetch = vi.fn();

    const locationStub = {
      href: "/payment?orderId=order-1",
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
      origin: "http://localhost",
      pathname: "/payment",
      search: "?orderId=order-1",
      hash: "",
      host: "localhost",
      hostname: "localhost",
      protocol: "http:",
      port: "",
      ancestorOrigins: {
        length: 0,
        item: () => null,
      },
      toString() {
        return this.href;
      },
    } as unknown as Location;

    Object.defineProperty(window, "location", {
      value: locationStub,
      writable: true,
    });

    const order = {
      orderId: "order-1",
      total: "499.00",
      subtotal: "475.00",
      discountAmount: "-24.00",
      paymentMethod: "upi",
      deliveryAddress: "Line 1",
      userInfo: {
        name: "Test User",
        email: "test@example.com",
      },
    };
    sessionStorage.setItem("lastOrder", JSON.stringify(order));
    window.history.replaceState({}, "", "/payment?orderId=order-1");
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  it("redirects to PhonePe's hosted checkout with pay-page defaults", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockResolvedValue({
      json: async () => ({ data: { tokenUrl: "https://phonepe.example/pay" } }),
    } as any);

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>
    );

    const payButton = await screen.findByTestId("button-initiate-payment");
    await user.click(payButton);

    await waitFor(() => {
      expect(screen.getByText(/Redirecting to PhonePe/i)).toBeInTheDocument();
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/payments/token-url",
      expect.objectContaining({
        orderId: "order-1",
        instrumentPreference: "PAY_PAGE",
        payPageType: "REDIRECT",
      })
    );

    expect(window.location.assign).toHaveBeenCalledWith("https://phonepe.example/pay");
  });

  it("surfaces a failure state when no token URL is returned", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockResolvedValue({
      json: async () => ({ data: { tokenUrl: undefined } }),
    } as any);

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>
    );

    const payButton = await screen.findByTestId("button-initiate-payment");
    await user.click(payButton);

    await waitFor(() => {
      expect(screen.getAllByText(/Payment Failed/i).length).toBeGreaterThan(0);
    });

    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("allows the shopper to retry after a failure", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockRejectedValueOnce(new Error("boom"));
    apiRequestMock.mockResolvedValueOnce({
      json: async () => ({ data: { tokenUrl: "https://phonepe.example/pay" } }),
    } as any);

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>
    );

    const payButton = await screen.findByTestId("button-initiate-payment");
    await user.click(payButton);

    await waitFor(() => {
      expect(screen.getAllByText(/Payment Failed/i).length).toBeGreaterThan(0);
    });

    const retryButtons = await screen.findAllByTestId("button-retry-payment");
    await user.click(retryButtons[0]!);

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith("https://phonepe.example/pay");
    });
  });
});
