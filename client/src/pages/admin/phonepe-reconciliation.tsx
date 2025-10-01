import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface PhonePeInstrumentDetails {
  type: string | null;
  utr: string | null;
  utrMasked: string | null;
  payerHandle: string | null;
  payerHandleMasked: string | null;
  payerVpa: string | null;
  payerAddress: string | null;
  variant: string | null;
  variantLabel: string | null;
}

interface PhonePeReconciliationMarker {
  status: string;
  attempt: number;
  nextPollAt?: string;
  expiresAt?: string;
  lastStatus?: string | null;
  lastResponseCode?: string | null;
  lastError?: string | null;
  completedAt?: string | null;
  lastPolledAt?: string | null;
}

interface PhonePeRecordedPayment {
  status: string;
  providerPaymentId?: string;
  providerReferenceId?: string;
  upiPayerHandle?: string;
  upiUtr?: string;
  updatedAt?: string | null;
}

interface PhonePeAdminOrderData {
  orderId: string;
  tenantId: string;
  paymentId: string;
  merchantTransactionId: string;
  providerStatus: string;
  phonePeState: string | null;
  responseCode: string | null;
  amountMinor: number;
  amount: number;
  currency: string;
  verifiedAt?: string;
  instrument: PhonePeInstrumentDetails;
  rawInstrument: Record<string, unknown> | null;
  recordedPayment: PhonePeRecordedPayment;
  reconciliation: PhonePeReconciliationMarker | null;
}

interface PhonePeAdminResponse {
  success: boolean;
  data: PhonePeAdminOrderData;
}

function formatDate(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "–";
  }
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function resolveOrderIdFromSearch(search: string): string {
  if (!search) {
    return "";
  }
  const query = new URLSearchParams(search);
  return query.get("orderId") ?? "";
}

export default function PhonePeReconciliationAdminPage() {
  const { isAuthenticated, isLoading } = useAdminAuth();
  const [location, setLocation] = useLocation();

  const initialOrderId = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return resolveOrderIdFromSearch(window.location.search);
  }, []);

  const [inputOrderId, setInputOrderId] = useState(initialOrderId);
  const [orderId, setOrderId] = useState(initialOrderId);

  const {
    data,
    isFetching,
    error,
    refetch,
  } = useQuery<PhonePeAdminResponse, Error, PhonePeAdminOrderData>({
    queryKey: ["/api/payments/admin/phonepe/orders", orderId],
    enabled: isAuthenticated && orderId.trim().length > 0,
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(`/api/payments/admin/phonepe/orders/${encodeURIComponent(orderId)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = (body as { error?: string; message?: string }).error
          || (body as { error?: string; message?: string }).message
          || "Failed to fetch PhonePe order status";
        throw new Error(message);
      }
      const payload = (await response.json()) as PhonePeAdminResponse;
      if (!payload.success) {
        throw new Error("PhonePe order status lookup failed");
      }
      return payload;
    },
    select: (result) => result.data,
  });

  const handleLookup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = inputOrderId.trim();
    setOrderId(trimmed);
    if (typeof window !== "undefined") {
      const query = new URLSearchParams(window.location.search);
      if (trimmed) {
        query.set("orderId", trimmed);
      } else {
        query.delete("orderId");
      }
      const next = `${window.location.pathname}${query.toString() ? `?${query.toString()}` : ""}`;
      if (next !== location) {
        setLocation(next, { replace: true });
      }
    }
    if (trimmed) {
      void refetch();
    }
  };

  if (isLoading) {
    return (
      <div className="py-20">
        <LoadingSpinner text="Checking admin session…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              Sign in to the admin console to review PhonePe reconciliation status.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>PhonePe reconciliation lookup</CardTitle>
          <CardDescription>
            Inspect the live order status returned by PhonePe and compare it with the stored payment snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col sm:flex-row gap-3" onSubmit={handleLookup}>
            <Input
              value={inputOrderId}
              onChange={(event) => setInputOrderId(event.target.value)}
              placeholder="Enter order ID"
              data-testid="input-order-id"
            />
            <Button type="submit" disabled={inputOrderId.trim().length === 0}>
              Lookup order
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (orderId.trim().length === 0) return;
                void refetch();
              }}
              disabled={orderId.trim().length === 0 || isFetching}
            >
              Refresh status
            </Button>
          </form>
          {orderId.trim().length === 0 && (
            <p className="text-sm text-muted-foreground mt-4">
              Provide an order ID to retrieve reconciliation signals from PhonePe.
            </p>
          )}
        </CardContent>
      </Card>

      {isFetching && (
        <Card>
          <CardContent className="py-10">
            <LoadingSpinner text="Fetching latest PhonePe status…" />
          </CardContent>
        </Card>
      )}

      {error && !isFetching && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Lookup failed</CardTitle>
            <CardDescription className="text-red-600">{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {data && !isFetching && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Gateway status</CardTitle>
              <CardDescription>
                PhonePe reports the following state for merchant transaction <strong>{data.merchantTransactionId}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <Badge variant="outline" data-testid="badge-provider-status">
                  {data.providerStatus.toUpperCase()}
                </Badge>
                {data.phonePeState && (
                  <Badge data-testid="text-phonepe-state">State: {data.phonePeState}</Badge>
                )}
                {data.responseCode && (
                  <Badge variant="secondary" data-testid="text-response-code">
                    Code: {data.responseCode}
                  </Badge>
                )}
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="font-medium">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: data.currency }).format(
                      data.amount,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last verified</dt>
                  <dd className="font-medium">{formatDate(data.verifiedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Payment ID</dt>
                  <dd className="font-mono break-all">{data.paymentId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Stored payment status</dt>
                  <dd className="font-medium">{data.recordedPayment.status}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>UPI instrument details</CardTitle>
              <CardDescription>
                Review the UPI metadata returned by PhonePe alongside the masked identifiers stored in the order record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Masked / stored</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Variant</TableCell>
                    <TableCell>{data.instrument.variantLabel ?? data.instrument.variant ?? "–"}</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>UTR</TableCell>
                    <TableCell data-testid="text-upi-utr">{data.instrument.utr ?? "–"}</TableCell>
                    <TableCell>{data.instrument.utrMasked ?? data.recordedPayment.upiUtr ?? "–"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Payer handle</TableCell>
                    <TableCell data-testid="text-upi-handle">{data.instrument.payerHandle ?? "–"}</TableCell>
                    <TableCell>{data.instrument.payerHandleMasked ?? data.recordedPayment.upiPayerHandle ?? "–"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Payer VPA</TableCell>
                    <TableCell>{data.instrument.payerVpa ?? "–"}</TableCell>
                    <TableCell>{data.recordedPayment.upiPayerHandle ?? "–"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Payer address</TableCell>
                    <TableCell>{data.instrument.payerAddress ?? "–"}</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reconciliation markers</CardTitle>
              <CardDescription>
                Status from the PhonePe polling registry used to drive automated follow-ups.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.reconciliation ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" data-testid="badge-reconciliation-status">
                      {data.reconciliation.status.toUpperCase()}
                    </Badge>
                    <span>Attempt {data.reconciliation.attempt}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Next poll</span>
                    <div className="font-medium">{formatDate(data.reconciliation.nextPollAt)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expires at</span>
                    <div className="font-medium">{formatDate(data.reconciliation.expiresAt)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last polled</span>
                    <div className="font-medium">{formatDate(data.reconciliation.lastPolledAt)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last state</span>
                    <div className="font-medium">{data.reconciliation.lastStatus ?? "–"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Response code</span>
                    <div className="font-medium">{data.reconciliation.lastResponseCode ?? "–"}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Last error</span>
                    <div className="font-medium whitespace-pre-wrap">{data.reconciliation.lastError ?? "–"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Completed at</span>
                    <div className="font-medium">{formatDate(data.reconciliation.completedAt)}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No reconciliation job recorded for this order.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
