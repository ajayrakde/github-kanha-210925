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

  it("moves from pending to processing when a PhonePe payment is initiated", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockResolvedValue({
      json: async () => ({ data: { redirectUrl: "https://phonepe.example/pay" } }),
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
      expect(screen.getByText(/Processing Payment/i)).toBeInTheDocument();
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/payments/create",
      expect.objectContaining({ orderId: "order-1" })
    );
  });
});
