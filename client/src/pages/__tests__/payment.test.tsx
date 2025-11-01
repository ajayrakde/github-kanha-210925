import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Payment from "../payment";
import { apiRequest } from "@/lib/queryClient";

const setLocationMock = vi.fn();
const originalLocation = window.location;
const originalCheckout = window.PhonePeCheckout;
const clearCartMutateMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["", setLocationMock],
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/hooks/use-cart", () => ({
  useCart: () => ({
    clearCart: { mutate: clearCartMutateMock },
  }),
}));

const apiRequestMock = vi.mocked(apiRequest);

describe("Payment page", () => {
  beforeEach(() => {
    setLocationMock.mockReset();
    apiRequestMock.mockReset();
    clearCartMutateMock.mockReset();
    sessionStorage.clear();
    global.fetch = vi.fn();
    window.PhonePeCheckout = { transact: vi.fn() } as any;
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
      paymentMethod: "phonepe",
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
    window.PhonePeCheckout = originalCheckout;
  });

  it("surfaces UPI intent metadata and launch control after initiation", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockResolvedValue({
      json: async () => ({
        data: {
          tokenUrl: "https://phonepe.example/pay",
          merchantTransactionId: "merchant-1",
          paymentId: "pay_intent",
          upi: {
            url: "upi://pay?pa=merchant@upi&pn=Demo%20Store&am=499.00",
            merchantName: "Demo Store",
            amount: "499.00",
          },
        },
      }),
    } as any);

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>
    );

    const [payButton] = await screen.findAllByTestId("button-initiate-payment");
    await user.click(payButton);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "POST",
        "/api/payments/token-url",
        expect.objectContaining({
          orderId: "order-1",
          instrumentPreference: "UPI_INTENT",
          payPageType: "IFRAME",
        })
      );
    });

    expect(window.PhonePeCheckout?.transact).not.toHaveBeenCalled();

    expect(await screen.findByTestId("upi-merchant-name")).toHaveTextContent("Demo Store");

    const launchIntentButton = await screen.findByTestId("button-launch-upi-intent");
    await user.click(launchIntentButton);

    expect(window.location.href).toBe("upi://pay?pa=merchant@upi&pn=Demo%20Store&am=499.00");
  });

  it("uses the shopper's selected UPI instrument when initiating payment", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockResolvedValue({
      json: async () => ({
        data: {
          tokenUrl: "https://phonepe.example/pay",
          merchantTransactionId: "merchant-1",
          paymentId: "pay_qr",
          upi: {
            qrData: "QUJDRA==",
            amount: "499.00",
          },
        },
      }),
    } as any);

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>
    );

    const qrButton = await screen.findByTestId("button-select-upi_qr");
    await user.click(qrButton);

    const [payButton] = await screen.findAllByTestId("button-initiate-payment");
    await user.click(payButton);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "POST",
        "/api/payments/token-url",
        expect.objectContaining({
          instrumentPreference: "UPI_QR",
          payPageType: "IFRAME",
        })
      );
    });

    expect(window.PhonePeCheckout?.transact).not.toHaveBeenCalled();
    const [amountDisplay] = await screen.findAllByTestId("upi-amount");
    expect(amountDisplay).toHaveTextContent("₹499.00");
    expect(screen.getByTestId("upi-qr-image")).toBeInTheDocument();
  });

  it("records cancellation when the PhonePe iframe reports USER_CANCEL", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockResolvedValueOnce({
      json: async () => ({
        data: {
          tokenUrl: "https://phonepe.example/pay",
          merchantTransactionId: "merchant-1",
          paymentId: "pay_123",
        },
      }),
    } as any);
    apiRequestMock.mockResolvedValueOnce({ ok: true } as any);

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>
    );

    const [payButton] = await screen.findAllByTestId("button-initiate-payment");
    await user.click(payButton);

    await waitFor(() => {
      expect(window.PhonePeCheckout?.transact).toHaveBeenCalled();
    });

    const transactMock = window.PhonePeCheckout?.transact as ReturnType<typeof vi.fn>;
    const callback = transactMock.mock.calls[0]?.[0]?.callback as ((event: any) => void) | undefined;
    expect(callback).toBeTypeOf("function");

    callback?.({ status: "USER_CANCEL" });

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "POST",
        "/api/payments/cancel",
        expect.objectContaining({
          paymentId: "pay_123",
          orderId: "order-1",
          reason: "USER_CANCEL",
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("button-retry-payment")).toBeInTheDocument();
    });
  });

  it("navigates to Thank You once the status API reports completion", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockImplementation((method, url) => {
      if (method === "POST" && url === "/api/payments/token-url") {
        return Promise.resolve({
          json: async () => ({
            data: {
              tokenUrl: "https://phonepe.example/pay",
              merchantTransactionId: "merchant-1",
              paymentId: "pay_success",
            },
          }),
        } as any);
      }
      if (method === "GET" && url === "/api/payments/status/pay_success") {
        return Promise.resolve({ json: async () => ({ data: { status: "COMPLETED" } }) } as any);
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>
    );

    const [payButton] = await screen.findAllByTestId("button-initiate-payment");
    await user.click(payButton);

    const transactMock = window.PhonePeCheckout?.transact as ReturnType<typeof vi.fn>;
    const callback = transactMock.mock.calls[0]?.[0]?.callback as ((event: any) => void) | undefined;
    expect(callback).toBeTypeOf("function");

    callback?.({ status: "CONCLUDED" });

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/payments/status/pay_success");
    });

    await waitFor(() => {
      expect(setLocationMock).toHaveBeenCalledWith("/thank-you?orderId=order-1");
    });

    await waitFor(() => {
      expect(clearCartMutateMock).toHaveBeenCalled();
    });
  });

  it("continues polling while the payment is pending", async () => {
    const queryClient = new QueryClient();
    let statusCalls = 0;
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
      if (typeof handler === "function" && timeout === 5000) {
        handler(...args);
        return 0 as unknown as number;
      }
      return originalSetTimeout(handler as any, timeout as any, ...args) as unknown as number;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((timeoutId: number) => originalClearTimeout(timeoutId)) as typeof window.clearTimeout;
    try {
      apiRequestMock.mockImplementation((method, url) => {
        if (method === "POST" && url === "/api/payments/token-url") {
          return Promise.resolve({
            json: async () => ({
              data: {
                tokenUrl: "https://phonepe.example/pay",
                merchantTransactionId: "merchant-1",
                paymentId: "pay_pending",
              },
            }),
          } as any);
        }
        if (method === "GET" && url === "/api/payments/status/pay_pending") {
          statusCalls += 1;
          if (statusCalls === 1) {
            return Promise.resolve({ json: async () => ({ data: { status: "PENDING" } }) } as any);
          }
          return Promise.resolve({ json: async () => ({ data: { status: "COMPLETED" } }) } as any);
        }
        throw new Error(`Unexpected request ${method} ${url}`);
      });

      const user = userEvent.setup();
      render(
        <QueryClientProvider client={queryClient}>
          <Payment />
        </QueryClientProvider>
      );

      const [payButton] = await screen.findAllByTestId("button-initiate-payment");
      await user.click(payButton);

      const transactMock = window.PhonePeCheckout?.transact as ReturnType<typeof vi.fn>;
      const callback = transactMock.mock.calls[0]?.[0]?.callback as ((event: any) => void) | undefined;
      callback?.({ status: "CONCLUDED" });

      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/payments/status/pay_pending");
      });

      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalledTimes(3); // token + two status calls
      });
    } finally {
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
    }
  });

  it("shows the retry UI when the status API reports failure", async () => {
    const queryClient = new QueryClient();
    apiRequestMock.mockImplementation((method, url) => {
      if (method === "POST" && url === "/api/payments/token-url") {
        return Promise.resolve({
          json: async () => ({
            data: {
              tokenUrl: "https://phonepe.example/pay",
              merchantTransactionId: "merchant-1",
              paymentId: "pay_failed",
            },
          }),
        } as any);
      }
      if (method === "GET" && url === "/api/payments/status/pay_failed") {
        return Promise.resolve({
          json: async () => ({ data: { status: "FAILED", error: { message: "DECLINED" } } }),
        } as any);
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>
    );

    const [payButton] = await screen.findAllByTestId("button-initiate-payment");
    await user.click(payButton);

    const transactMock = window.PhonePeCheckout?.transact as ReturnType<typeof vi.fn>;
    const callback = transactMock.mock.calls[0]?.[0]?.callback as ((event: any) => void) | undefined;
    callback?.({ status: "CONCLUDED" });

    await waitFor(() => {
      expect(screen.getByTestId("button-retry-payment")).toBeInTheDocument();
    });

    expect(setLocationMock).not.toHaveBeenCalledWith("/thank-you?orderId=order-1");
    expect(clearCartMutateMock).not.toHaveBeenCalled();
  });
});
