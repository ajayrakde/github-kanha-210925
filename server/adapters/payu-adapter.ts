import crypto from "crypto";
import type {
  PaymentsAdapter,
  CreatePaymentParams,
  PaymentResult,
  VerifyPaymentParams,
  CapturePaymentParams,
  CreateRefundParams,
  RefundResult,
  WebhookVerifyParams,
  WebhookVerifyResult,
  HealthCheckResult,
  HealthCheckParams,
  PaymentMethod,
  Currency,
  PaymentStatus,
  RefundStatus,
} from "../../shared/payment-types";
import type { PaymentProvider, Environment } from "../../shared/payment-providers";
import type { ResolvedConfig } from "../services/config-resolver";
import { PaymentError, RefundError } from "../../shared/payment-types";

interface PayUOrderResponse {
  status: string;
  message?: string;
  result?: {
    orderId?: string;
    txnId?: string;
    mihpayid?: string;
    status?: string;
    amount?: string;
    currency?: string;
    created_at?: string;
  };
  error?: string;
  data?: Record<string, any>;
}

interface PayUPaymentStatusResponse {
  status: string;
  message?: string;
  result?: {
    orderId?: string;
    txnId?: string;
    mihpayid?: string;
    amount?: string;
    currency?: string;
    status?: string;
    addedon?: string;
    paymentSource?: string;
    cardType?: string;
    bankRefNum?: string;
  };
  error?: string;
}

interface PayURefundResponse {
  status: string;
  message?: string;
  result?: {
    requestId?: string;
    refundId?: string;
    status?: string;
    amount?: string;
    createdAt?: string;
  };
  error?: string;
}

export class PayUAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider = "payu";
  public readonly environment: Environment;

  private readonly merchantKey: string;
  private readonly salt: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ResolvedConfig) {
    this.environment = config.environment;

    this.merchantKey = config.keyId || "";
    this.salt = config.secrets.salt || "";

    this.baseUrl = this.environment === "live"
      ? "https://secure.payu.in"
      : "https://test.payu.in";

    if (!this.merchantKey || !this.salt) {
      throw new PaymentError(
        "Missing PayU credentials",
        "MISSING_CREDENTIALS",
        "payu"
      );
    }
  }

  public async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const txnId = params.orderId || `PAYU_${Date.now()}`;

      const payload = {
        merchantKey: this.merchantKey,
        txnId,
        amount: params.orderAmount / 100,
        currency: params.currency,
        callbackUrl: params.successUrl,
        redirectUrl: params.successUrl,
        customer: {
          name: params.customer.name,
          email: params.customer.email,
          phone: params.customer.phone,
        },
        metadata: params.metadata,
      };

      const response = await this.makeApiCall<PayUOrderResponse>(
        "/api/v2_1/orders",
        "POST",
        payload
      );

      if (!response || response.status?.toUpperCase() !== "SUCCESS") {
        throw new Error(response?.message || response?.error || "Unable to create PayU order");
      }

      const result: PaymentResult = {
        paymentId: crypto.randomUUID(),
        providerPaymentId: response.result?.mihpayid || txnId,
        providerOrderId: response.result?.orderId || txnId,
        status: this.mapPaymentStatus(response.result?.status || "INITIATED"),
        amount: params.orderAmount,
        currency: params.currency,
        provider: "payu",
        environment: this.environment,
        redirectUrl: response.result?.orderId
          ? `${this.baseUrl}/_payment?orderId=${encodeURIComponent(response.result.orderId)}`
          : undefined,
        method: params.preferredMethod
          ? { type: params.preferredMethod }
          : undefined,
        providerData: {
          orderId: response.result?.orderId || txnId,
          txnId,
          mihpayid: response.result?.mihpayid,
          status: response.result?.status,
        },
        createdAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("PayU payment creation failed:", error);
      throw new PaymentError(
        `PayU payment creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CREATION_FAILED",
        "payu",
        error
      );
    }
  }

  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      const providerOrderId =
        params.providerPaymentId || (params.providerData as any)?.orderId || params.paymentId;

      if (!providerOrderId) {
        throw new PaymentError("Missing PayU transaction identifier", "MISSING_VERIFICATION_DATA", "payu");
      }

      const response = await this.makeApiCall<PayUPaymentStatusResponse>(
        `/api/v2_1/orders/${providerOrderId}`,
        "GET"
      );

      if (!response || response.status?.toUpperCase() !== "SUCCESS") {
        throw new Error(response?.message || response?.error || "Failed to fetch PayU status");
      }

      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: response.result?.mihpayid || providerOrderId,
        providerOrderId: response.result?.orderId || providerOrderId,
        status: this.mapPaymentStatus(response.result?.status || "FAILED"),
        amount: response.result?.amount ? Math.round(parseFloat(response.result.amount) * 100) : 0,
        currency: (response.result?.currency as Currency) || "INR",
        provider: "payu",
        environment: this.environment,
        method: {
          type: this.detectMethod(response.result?.paymentSource),
          brand: response.result?.cardType,
          last4: response.result?.bankRefNum?.slice(-4),
        },
        providerData: {
          orderId: response.result?.orderId || providerOrderId,
          txnId: response.result?.txnId,
          mihpayid: response.result?.mihpayid,
          status: response.result?.status,
        },
        createdAt: response.result?.addedon ? new Date(response.result.addedon) : new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("PayU payment verification failed:", error);
      throw new PaymentError(
        `Payment verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_VERIFICATION_FAILED",
        "payu",
        error
      );
    }
  }

  public async capturePayment(params: CapturePaymentParams): Promise<PaymentResult> {
    try {
      const providerPaymentId = params.providerPaymentId || params.paymentId;

      if (!providerPaymentId) {
        throw new PaymentError("Missing PayU payment identifier", "MISSING_PROVIDER_PAYMENT_ID", "payu");
      }

      const response = await this.makeApiCall<PayUPaymentStatusResponse>(
        `/api/v2_1/payments/${providerPaymentId}/capture`,
        "POST",
        params.amount ? { amount: params.amount / 100 } : undefined
      );

      if (!response || response.status?.toUpperCase() !== "SUCCESS") {
        throw new Error(response?.message || response?.error || "Failed to capture PayU payment");
      }

      const paymentStatus = await this.verifyPayment({
        paymentId: params.paymentId,
        providerPaymentId: providerPaymentId,
      });

      return paymentStatus;
    } catch (error) {
      console.error("PayU capture failed:", error);
      throw new PaymentError(
        `Payment capture failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CAPTURE_FAILED",
        "payu",
        error
      );
    }
  }

  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    try {
      const providerPaymentId = params.providerPaymentId;

      if (!providerPaymentId) {
        throw new RefundError("Missing PayU payment identifier", "MISSING_PROVIDER_PAYMENT_ID", "payu");
      }

      const requestPayload = {
        paymentId: providerPaymentId,
        amount: params.amount ? params.amount / 100 : undefined,
        reason: params.reason,
        notes: params.notes,
      };

      const response = await this.makeApiCall<PayURefundResponse>(
        "/api/v2_1/refunds",
        "POST",
        requestPayload
      );

      if (!response || response.status?.toUpperCase() !== "SUCCESS") {
        throw new Error(response?.message || response?.error || "Failed to create PayU refund");
      }

      const result: RefundResult = {
        refundId: response.result?.refundId || crypto.randomUUID(),
        paymentId: params.paymentId,
        providerRefundId: response.result?.refundId,
        amount: params.amount || (response.result?.amount ? Math.round(parseFloat(response.result.amount) * 100) : 0),
        status: this.mapRefundStatus(response.result?.status || "PENDING"),
        provider: "payu",
        environment: this.environment,
        reason: params.reason,
        notes: params.notes,
        providerData: {
          requestId: response.result?.requestId,
          refundId: response.result?.refundId,
          status: response.result?.status,
        },
        createdAt: response.result?.createdAt ? new Date(response.result.createdAt) : new Date(),
      };

      return result;
    } catch (error) {
      console.error("PayU refund creation failed:", error);
      throw new RefundError(
        `Refund creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_CREATION_FAILED",
        "payu",
        error
      );
    }
  }

  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      const response = await this.makeApiCall<PayURefundResponse>(
        `/api/v2_1/refunds/${refundId}`,
        "GET"
      );

      if (!response || response.status?.toUpperCase() !== "SUCCESS") {
        throw new Error(response?.message || response?.error || "Failed to fetch PayU refund status");
      }

      const result: RefundResult = {
        refundId: response.result?.refundId || refundId,
        paymentId: response.result?.requestId || "",
        providerRefundId: response.result?.refundId || refundId,
        amount: response.result?.amount ? Math.round(parseFloat(response.result.amount) * 100) : 0,
        status: this.mapRefundStatus(response.result?.status || "PENDING"),
        provider: "payu",
        environment: this.environment,
        providerData: {
          requestId: response.result?.requestId,
          status: response.result?.status,
        },
        createdAt: response.result?.createdAt ? new Date(response.result.createdAt) : new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("PayU refund status check failed:", error);
      throw new RefundError(
        `Refund status check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_STATUS_CHECK_FAILED",
        "payu",
        error
      );
    }
  }

  public async verifyWebhook(params: WebhookVerifyParams): Promise<WebhookVerifyResult> {
    try {
      const signature = params.headers["x-payu-signature"] || params.signature;

      if (!signature) {
        return { verified: false, error: { code: "MISSING_SIGNATURE", message: "Missing PayU signature header" } };
      }

      const bodyString = params.body.toString();
      const expected = crypto
        .createHmac("sha256", this.salt)
        .update(bodyString, "utf8")
        .digest("hex");

      const isValid = this.safeCompare(signature, expected);

      if (!isValid) {
        return { verified: false, error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" } };
      }

      const payload = JSON.parse(bodyString);
      const eventType = payload.event || payload.type || "payment.update";
      const data = payload.data || payload;

      return {
        verified: true,
        event: {
          type: eventType,
          paymentId: data?.mihpayid || data?.txnId,
          refundId: data?.refundId,
          status: data?.status,
          data,
        },
        providerData: payload,
      };
    } catch (error) {
      console.error("PayU webhook verification failed:", error);
      return {
        verified: false,
        error: {
          code: "WEBHOOK_VERIFICATION_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  public async healthCheck(_params?: HealthCheckParams): Promise<HealthCheckResult> {
    const start = Date.now();

    try {
      await this.makeApiCall<PayUPaymentStatusResponse>("/api/v2_1/orders?limit=1", "GET");

      const responseTime = Date.now() - start;

      return {
        provider: "payu",
        environment: this.environment,
        healthy: true,
        responseTime,
        tests: {
          connectivity: true,
          authentication: true,
          apiAccess: true,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        provider: "payu",
        environment: this.environment,
        healthy: false,
        responseTime: Date.now() - start,
        tests: {
          connectivity: false,
          authentication: false,
          apiAccess: false,
        },
        error: {
          code: "HEALTH_CHECK_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        timestamp: new Date(),
      };
    }
  }

  public getSupportedMethods(): PaymentMethod[] {
    return ["card", "upi", "netbanking", "wallet"];
  }

  public getSupportedCurrencies(): Currency[] {
    return ["INR"];
  }

  public async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.merchantKey) {
      errors.push("Missing PayU Merchant Key");
    }

    if (!this.salt) {
      errors.push("Missing PayU Salt");
    }

    return { valid: errors.length === 0, errors };
  }

  private async makeApiCall<T>(endpoint: string, method: "GET" | "POST" | "PUT" | "DELETE", data?: any): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Basic ${Buffer.from(`${this.merchantKey}:${this.salt}`).toString("base64")}`,
      "User-Agent": "PaymentApp/1.0",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PayU API error: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private mapPaymentStatus(status: string): PaymentStatus {
    switch (status?.toUpperCase()) {
      case "INITIATED":
      case "PENDING":
        return "processing";
      case "SUCCESS":
      case "CAPTURED":
        return "captured";
      case "AUTHORIZING":
        return "authorized";
      case "FAILED":
      case "CANCELLED":
        return "failed";
      case "REFUNDED":
        return "refunded";
      default:
        return "failed";
    }
  }

  private mapRefundStatus(status: string): RefundStatus {
    switch (status?.toUpperCase()) {
      case "SUCCESS":
      case "PROCESSED":
        return "completed";
      case "PENDING":
      case "INITIATED":
        return "processing";
      case "FAILED":
      case "DECLINED":
        return "failed";
      case "CANCELLED":
        return "cancelled";
      default:
        return "pending";
    }
  }

  private detectMethod(source?: string | null): PaymentMethod {
    switch ((source || "").toLowerCase()) {
      case "upi":
        return "upi";
      case "netbanking":
        return "netbanking";
      case "wallet":
        return "wallet";
      default:
        return "card";
    }
  }

  private safeCompare(a: string, b: string): boolean {
    try {
      return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
    } catch {
      return false;
    }
  }
}
