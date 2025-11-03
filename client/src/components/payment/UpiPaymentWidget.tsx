import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { TabAccordion } from "@/components/ui/tab-accordion"
import { Smartphone, QrCode, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

import gpayLogo from "@assets/google-pay-icon_1762008468355.png"
import phonepeLogo from "@assets/phonepe-icon_1762008468355.png"
import paytmLogo from "@assets/paytm-icon_1762008468354.png"
import upiLogo from "@assets/upi-payment-icon_1762008468354.png"

const APP_TILES = [
  {
    id: "google-pay" as const,
    label: "Google Pay",
    shortLabel: "GPay",
    logoUrl: gpayLogo,
  },
  {
    id: "phonepe" as const,
    label: "PhonePe",
    shortLabel: "PhonePe",
    logoUrl: phonepeLogo,
  },
  {
    id: "other" as const,
    label: "Other Apps",
    shortLabel: "UPI",
    logoUrl: upiLogo,
  },
]

export type UpiPaymentMode = "intent" | "qr" | "collect"
export type UpiPaymentStatus =
  | "idle"
  | "initiated"
  | "pending"
  | "processing"
  | "success"
  | "failure"
  | "expired"

export interface MerchantMetadataItem {
  label: string
  value: string
  /** Optional icon to render alongside the value. */
  icon?: ReactNode
  /** When provided, shows a copy action for the item. */
  onCopy?: () => void
  copyAriaLabel?: string
}

export interface HelperNote {
  id: string
  text: string
}

export interface UpiPaymentTimer {
  label: string
  /** Initial seconds remaining for the countdown. */
  remainingSeconds: number
  /** Optional callback fired once the timer reaches zero. */
  onExpire?: () => void
}

type AppTileId = (typeof APP_TILES)[number]["id"]

type CopyKey = "vpa" | "upiUrl" | "transactionReference" | `meta-${string}`

const STATUS_STYLES: Record<UpiPaymentStatus, { label: string; badgeClasses: string }> = {
  idle: {
    label: "Ready to start",
    badgeClasses: "bg-muted text-muted-foreground border-muted-foreground/20",
  },
  initiated: {
    label: "Waiting for confirmation",
    badgeClasses: "bg-blue-600 text-white",
  },
  pending: {
    label: "Pending at provider",
    badgeClasses: "bg-amber-500 text-black",
  },
  processing: {
    label: "Processing",
    badgeClasses: "bg-sky-600 text-white",
  },
  success: {
    label: "Payment captured",
    badgeClasses: "bg-emerald-600 text-white",
  },
  failure: {
    label: "Payment failed",
    badgeClasses: "bg-destructive text-destructive-foreground",
  },
  expired: {
    label: "Payment expired",
    badgeClasses: "bg-slate-700 text-white",
  },
}

const COPY_FEEDBACK_DURATION = 2000

export interface UpiPaymentWidgetProps {
  /** Current tab selection. When omitted the component manages the responsive default internally. */
  mode?: UpiPaymentMode
  status: UpiPaymentStatus
  upiUrl: string
  qrDataUrl?: string | null
  merchant: {
    name: string
    vpa: string
    amount: string
    orderLabel?: string
    logoUrl?: string
    logoAlt?: string
  }
  metadata?: MerchantMetadataItem[]
  transactionReference: string
  note?: ReactNode
  helperNotes?: HelperNote[]
  timer?: UpiPaymentTimer
  /** Optional custom label for the call-to-action button. */
  ctaLabel?: string
  /** Disables the call-to-action button. */
  ctaDisabled?: boolean
  /** Disables all payment actions (app buttons, QR, etc) to prevent multiple payment initiations. */
  disabled?: boolean
  /** Callback triggered when the CTA is activated. */
  onCtaClick?: (mode: UpiPaymentMode) => void
  /** Callback triggered when a UPI intent app tile is clicked. */
  onIntentAppSelect?: (appId: AppTileId) => void
  /** Callback triggered when the tab is changed. */
  onModeChange?: (mode: UpiPaymentMode) => void
  /**
   * Handler invoked when the VPA copy chip is clicked. The component provides
   * visual feedback for a short duration.
   */
  onCopyVpa?: () => void
  /** Handler for copying the UPI deep-link. */
  onCopyUpiUrl?: () => void
  /** Handler for copying the transaction reference. */
  onCopyTransactionReference?: () => void
  /** Custom duration for copy feedback (ms). */
  copyFeedbackDuration?: number
  /**
   * Allows overriding the set of UPI apps rendered. If omitted, the default
   * GPay, PhonePe, and Paytm tiles are used.
   */
  apps?: {
    id: AppTileId
    label: string
    shortLabel: string
    logoUrl?: string
  }[]
  ctaTestId?: string
  onCollectTriggered?: () => void
  /** Show UPI ID/VPA tab for Cashfree payments. */
  showUpiIdTab?: boolean
  /** Current UPI ID value for Cashfree payments. */
  upiId?: string
  /** Handler for UPI ID input changes. */
  onUpiIdChange?: (value: string) => void
  /** Handler for UPI ID payment button click. */
  onUpiIdPayment?: () => void
  /** Loading state for UPI ID payment mutation. */
  isUpiIdPaymentPending?: boolean
}

function formatSeconds(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remaining = safeSeconds % 60
  return `${minutes}:${remaining.toString().padStart(2, "0")}`
}

export function UpiPaymentWidget({
  mode,
  status,
  upiUrl,
  qrDataUrl,
  merchant,
  metadata = [],
  transactionReference,
  note,
  helperNotes,
  timer,
  ctaLabel = "I've completed the payment",
  ctaDisabled,
  disabled = false,
  onCtaClick,
  onIntentAppSelect,
  onModeChange,
  onCopyVpa,
  onCopyUpiUrl,
  onCopyTransactionReference,
  copyFeedbackDuration = COPY_FEEDBACK_DURATION,
  apps = APP_TILES,
  ctaTestId,
  showUpiIdTab = false,
  upiId = '',
  onUpiIdChange,
  onUpiIdPayment,
  isUpiIdPaymentPending = false,
}: UpiPaymentWidgetProps) {
  const isControlled = mode !== undefined
  const getResponsiveDefault = () => {
    if (mode) return mode
    if (typeof window === "undefined") {
      return "intent"
    }
    return window.innerWidth >= 1024 ? "qr" : "intent"
  }

  const [internalMode, setInternalMode] = useState<UpiPaymentMode>(getResponsiveDefault)
  const currentMode = isControlled ? mode! : internalMode

  useEffect(() => {
    if (isControlled && mode) {
      setInternalMode(mode)
    }
  }, [isControlled, mode])

  useEffect(() => {
    if (isControlled) {
      return
    }
    const handleResize = () => {
      setInternalMode(window.innerWidth >= 1024 ? "qr" : "intent")
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [isControlled])

  const handleModeChange = (value: string) => {
    if (value !== "intent" && value !== "qr" && value !== "collect") return
    if (!isControlled) {
      setInternalMode(value as UpiPaymentMode)
    }
    onModeChange?.(value as UpiPaymentMode)
  }

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    timer?.remainingSeconds ?? null,
  )
  const timerExpiredRef = useRef(false)

  useEffect(() => {
    setRemainingSeconds(timer?.remainingSeconds ?? null)
    timerExpiredRef.current = false
  }, [timer?.remainingSeconds])

  useEffect(() => {
    if (!timer || remainingSeconds === null) {
      return
    }
    if (remainingSeconds <= 0 && !timerExpiredRef.current) {
      timerExpiredRef.current = true
      timer.onExpire?.()
      return
    }
    if (remainingSeconds <= 0) {
      return
    }
    const id = window.setTimeout(() => {
      setRemainingSeconds((prev) => (prev === null ? prev : Math.max(prev - 1, 0)))
    }, 1000)
    return () => window.clearTimeout(id)
  }, [timer, remainingSeconds])

  const copyTimeouts = useRef<Map<CopyKey, number>>(new Map())
  const [copyFeedback, setCopyFeedback] = useState<Partial<Record<CopyKey, boolean>>>({})

  useEffect(() => {
    return () => {
      copyTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [])

  const triggerCopyFeedback = (key: CopyKey, callback?: () => void) => {
    callback?.()
    setCopyFeedback((prev) => ({ ...prev, [key]: true }))
    const timeoutId = window.setTimeout(() => {
      setCopyFeedback((prev) => ({ ...prev, [key]: false }))
    }, copyFeedbackDuration)
    const existing = copyTimeouts.current.get(key)
    if (existing) {
      window.clearTimeout(existing)
    }
    copyTimeouts.current.set(key, timeoutId)
  }

  const activeStatus = useMemo(() => STATUS_STYLES[status], [status])

  const renderCopyButton = (label: string, key: CopyKey, handler?: () => void) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-xs"
      onClick={() => triggerCopyFeedback(key, handler)}
      aria-label={label}
    >
      {copyFeedback[key] ? "Copied" : "Copy"}
    </Button>
  )

  const tabItems = [
    {
      value: "intent",
      label: "Pay via app",
      icon: <Smartphone size={16} />,
      content: (
        <section aria-label="UPI apps" className="grid grid-cols-4 gap-2 p-4">
          {apps.map((app) => (
            <Button
              key={app.id}
              type="button"
              variant="ghost"
              className="h-auto flex-col items-center gap-1 p-2 hover:bg-accent rounded"
              onClick={() => onIntentAppSelect?.(app.id)}
              disabled={disabled}
              aria-label={`Pay with ${app.label}`}
            >
              {app.logoUrl && (
                <img
                  src={app.logoUrl}
                  alt={app.label}
                  className="h-14 w-14 rounded object-contain"
                />
              )}
              <span className="text-xs font-medium text-foreground">{app.shortLabel}</span>
            </Button>
          ))}
        </section>
      ),
    },
    {
      value: "qr",
      label: "Scan QR",
      icon: <QrCode size={16} />,
      content: (
        <section className="flex flex-col items-center p-4">
          <div className="flex w-full flex-col items-center gap-2 rounded border bg-muted/40 p-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code for completing the UPI payment"
                className="h-32 w-32 rounded border bg-white object-cover"
              />
            ) : (
              <div
                className="flex h-32 w-32 items-center justify-center rounded border border-dashed text-center text-xs text-muted-foreground"
                role="img"
                aria-label="QR code placeholder"
              >
                QR code will appear here
              </div>
            )}
            <span className="text-xs text-muted-foreground">Scan using any UPI app</span>
          </div>
        </section>
      ),
    },
  ];

  if (showUpiIdTab) {
    tabItems.push({
      value: "collect",
      label: "UPI ID / VPA",
      icon: <Wallet size={16} />,
      content: (
        <section className="space-y-4 p-4">
          <div className="space-y-2">
            <label htmlFor="upi-id" className="text-sm font-medium text-gray-900">
              Enter your UPI ID
            </label>
            <Input
              id="upi-id"
              type="text"
              placeholder="yourname@upi (e.g., success@upi)"
              value={upiId}
              onChange={(e) => onUpiIdChange?.(e.target.value)}
              disabled={disabled || isUpiIdPaymentPending}
              data-testid="input-upi-id"
              className="w-full"
            />
            <p className="text-xs text-gray-500">Use success@upi for testing</p>
          </div>
          <Button
            onClick={onUpiIdPayment}
            disabled={disabled || !upiId.trim() || isUpiIdPaymentPending}
            size="lg"
            className="w-full"
            data-testid="button-pay-with-upi"
          >
            {isUpiIdPaymentPending ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Initiating Payment...
              </>
            ) : (
              <>
                <Wallet className="mr-2 h-4 w-4" />
                Pay {merchant.amount}
              </>
            )}
          </Button>
        </section>
      ),
    } as any);
  }

  return (
    <div
      role="region"
      aria-label="UPI payment options"
      className="w-full"
      data-current-mode={currentMode}
    >
      <TabAccordion
        value={currentMode}
        onValueChange={handleModeChange}
        items={tabItems}
      />
    </div>
  )
}

export default UpiPaymentWidget
