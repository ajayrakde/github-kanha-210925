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
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const APP_TILES = [
  {
    id: "google-pay" as const,
    label: "Google Pay",
    shortLabel: "GPay",
    accentClass: "bg-[#1a73e8]",
  },
  {
    id: "phonepe" as const,
    label: "PhonePe",
    shortLabel: "PhonePe",
    accentClass: "bg-[#5f259f]",
  },
  {
    id: "paytm" as const,
    label: "Paytm",
    shortLabel: "Paytm",
    accentClass: "bg-[#00baf2]",
  },
]

export type UpiPaymentMode = "intent" | "qr"
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
    accentClass?: string
  }[]
  ctaTestId?: string
  onCollectTriggered?: () => void
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
  onCtaClick,
  onIntentAppSelect,
  onModeChange,
  onCopyVpa,
  onCopyUpiUrl,
  onCopyTransactionReference,
  copyFeedbackDuration = COPY_FEEDBACK_DURATION,
  apps = APP_TILES,
  ctaTestId,
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
    if (value !== "intent" && value !== "qr") return
    if (!isControlled) {
      setInternalMode(value)
    }
    onModeChange?.(value)
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

  return (
    <Card
      role="region"
      aria-label="UPI payment options"
      className="w-full"
      data-current-mode={currentMode}
    >
      <CardContent className="space-y-6 pt-6">
        <Tabs value={currentMode} onValueChange={handleModeChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="intent" aria-label="Pay using UPI intent">
              Pay via app
            </TabsTrigger>
            <TabsTrigger value="qr" aria-label="Pay using QR code">
              Scan QR
            </TabsTrigger>
          </TabsList>
          <TabsContent value="intent" className="mt-4">
            <section aria-label="UPI apps" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {apps.map((app) => (
                <Button
                  key={app.id}
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-3 rounded-lg border bg-background p-4 text-left"
                  onClick={() => onIntentAppSelect?.(app.id)}
                  aria-label={`Pay with ${app.label}`}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white",
                      app.accentClass ?? "bg-primary",
                    )}
                  >
                    {app.shortLabel}
                  </span>
                  <span className="text-sm font-medium text-foreground">{app.label}</span>
                  <span className="text-xs text-muted-foreground">
                    Opens the {app.label} app with your payment request.
                  </span>
                </Button>
              ))}
            </section>
          </TabsContent>
          <TabsContent value="qr" className="mt-4">
            <section className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="flex w-full flex-col items-center gap-3 rounded-lg border bg-muted/40 p-6 md:w-1/2">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR code for completing the UPI payment"
                    className="h-48 w-48 rounded-md border bg-white object-cover"
                  />
                ) : (
                  <div
                    className="flex h-48 w-48 items-center justify-center rounded-md border border-dashed text-center text-sm text-muted-foreground"
                    role="img"
                    aria-label="QR code placeholder"
                  >
                    QR code will appear after we generate your payment request.
                  </div>
                )}
                <span className="text-xs text-muted-foreground">Scan using any UPI-enabled app.</span>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default UpiPaymentWidget
