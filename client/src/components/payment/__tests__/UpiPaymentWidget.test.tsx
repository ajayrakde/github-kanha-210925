import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import { UpiPaymentWidget, type UpiPaymentStatus } from "../UpiPaymentWidget"

const baseProps = {
  status: "idle" as UpiPaymentStatus,
  upiUrl: "upi://pay?pa=test@upi&pn=Test",
  qrDataUrl: null,
  merchant: {
    name: "Test Store",
    vpa: "test@upi",
    amount: "₹1,499.00",
    orderLabel: "Order #123",
  },
  metadata: [
    {
      label: "Order date",
      value: "4 Oct 2024",
    },
  ],
  transactionReference: "TXN123",
  note: "Use the same UPI app account that matches your billing name.",
  helperNotes: [
    {
      id: "note-1",
      text: "Payments expire after 15 minutes.",
    },
  ],
}

describe("UpiPaymentWidget", () => {
  let originalInnerWidth: number

  beforeEach(() => {
    vi.useFakeTimers()
    originalInnerWidth = window.innerWidth
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 480 })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
  })

  it("defaults to intent on narrow viewports and respects a controlled QR mode", () => {
    const { rerender } = render(<UpiPaymentWidget {...baseProps} />)

    const widget = screen.getByRole("region", { name: /upi payment options/i })
    expect(widget).toHaveAttribute("data-current-mode", "intent")

    rerender(<UpiPaymentWidget {...baseProps} mode="qr" />)
    const updatedWidget = screen.getByRole("region", { name: /upi payment options/i })
    expect(updatedWidget).toHaveAttribute("data-current-mode", "qr")
  })

  it("shows copy feedback for VPA and restores after the timeout", async () => {
    const onCopyVpa = vi.fn()
    render(<UpiPaymentWidget {...baseProps} onCopyVpa={onCopyVpa} />)

    const copyButtons = screen.getAllByRole("button", { name: /copy test@upi vpa/i })
    for (const button of copyButtons) {
      act(() => {
        fireEvent.click(button)
      })
      if (onCopyVpa.mock.calls.length) {
        break
      }
    }

    expect(onCopyVpa).toHaveBeenCalledTimes(1)
    const activeCopyButton = screen.getAllByRole("button", { name: /copy test@upi vpa/i })[0]
    expect(activeCopyButton).toHaveTextContent(/copied/i)

    await vi.advanceTimersByTimeAsync(1999)
    expect(activeCopyButton).toHaveTextContent(/copied/i)

    await vi.advanceTimersByTimeAsync(2)
    expect(activeCopyButton).toHaveTextContent(/copy/i)
  })

  it("renders a placeholder when the QR code is not available", () => {
    render(<UpiPaymentWidget {...baseProps} mode="qr" />)

    const placeholders = screen.getAllByRole("img", { name: /qr code placeholder/i })
    expect(placeholders.length).toBeGreaterThan(0)
    expect(placeholders[0]).toBeInTheDocument()
  })

  it("emits selection and CTA events", () => {
    const onIntentAppSelect = vi.fn()
    const onCtaClick = vi.fn()
    render(
      <UpiPaymentWidget
        {...baseProps}
        onIntentAppSelect={onIntentAppSelect}
        onCtaClick={onCtaClick}
      />,
    )

    const gpayButtons = screen.getAllByRole("button", { name: /pay with google pay/i })
    for (const button of gpayButtons) {
      act(() => {
        fireEvent.click(button)
      })
      if (onIntentAppSelect.mock.calls.length) {
        break
      }
    }
    expect(onIntentAppSelect).toHaveBeenCalledWith("google-pay")

    const ctaButtons = screen.getAllByRole("button", { name: /i've completed the payment/i })
    for (const button of ctaButtons) {
      act(() => {
        fireEvent.click(button)
      })
      if (onCtaClick.mock.calls.length) {
        break
      }
    }
    expect(onCtaClick).toHaveBeenCalledWith("intent")
  })

  it("maps the status to the correct badge styling", () => {
    const { rerender } = render(
      <UpiPaymentWidget
        {...baseProps}
        status="success"
        qrDataUrl="data:image/png;base64,placeholder"
        mode="qr"
      />,
    )

    const successBadge = screen.getByText(/payment captured/i)
    expect(successBadge).toHaveClass("bg-emerald-600", { exact: false })

    rerender(<UpiPaymentWidget {...baseProps} status="failure" />)
    expect(screen.getByText(/payment failed/i)).toHaveClass("bg-destructive", { exact: false })
  })
})
