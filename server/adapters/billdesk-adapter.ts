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
  HealthCheckParams,
  HealthCheckResult,
  PaymentMethod,
  Currency,
  PaymentStatus,
  RefundStatus,
} from "../../shared/payment-types";
import type { PaymentProvider, Environment } from "../../shared/payment-providers";
import type { ResolvedConfig } from "../services/config-resolver";
import { PaymentError, RefundError, WebhookError } from "../../shared/payment-types";

interface BillDeskOrderResponse {
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_amount?: number;
  payment_id?: string;
  payment_mode?: string;
  payment_time?: string;
}

interface BillDeskRefundResponse {
  refund_id: string;
  order_id: string;
  refund_amount: number;
  refund_status: string;
  initiated_at?: string;
}

export class BillDeskAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider = "billdesk";
  public readonly environment: Environment;

  private readonly merchantId: string;
  private readonly checksumKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ResolvedConfig) {
    this.environment = config.environment;

    this.merchantId = config.merchantId || "";
    this.checksumKey = config.secrets.checksumKey || "";

    this.baseUrl = this.environment === "live"
      ? "https://api.billdesk.com/payments"
      : "https://pguat.billdesk.io/payments";

    if (!this.merchantId || !this.checksumKey) {
      throw new PaymentError(
        "Missing BillDesk credentials",
        "MISSING_CREDENTIALS",
        "billdesk"
      );
    }
  }

  public async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const payload = {
        merchantId: this.merchantId,
        orderId: params.orderId,
        amount: params.orderAmount / 100,
        currency: params.currency,
        returnUrl: params.successUrl,
        notifyUrl: params.providerOptions?.notifyUrl,
        customer: {
          id: params.customer.id,
          email: params.customer.email,
          mobile: params.customer.phone,
          name: params.customer.name,
        },
        metadata: params.metadata,
      };

      const checksum = this.generateChecksum(payload);

      const result: PaymentResult = {
        paymentId: crypto.randomUUID(),
        providerPaymentId: params.orderId,
        providerOrderId: params.orderId,
        status: "initiated",
        amount: params.orderAmount,
        currency: params.currency,
        provider: "billdesk",
        environment: this.environment,
        redirectUrl: `${this.baseUrl}/v1.2/pg/orders/${encodeURIComponent(params.orderId)}`,
        providerData: {
          payload,
          checksum,
        },
        createdAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("BillDesk payment creation failed:", error);
      throw new PaymentError(
        `BillDesk payment creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CREATION_FAILED",
        "billdesk",
        error
      );
    }
  }

  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      const orderId = params.providerPaymentId || params.paymentId;

      if (!orderId) {
        throw new PaymentError("Missing BillDesk order identifier", "MISSING_VERIFICATION_DATA", "billdesk");
      }

      const response = await this.makeApiCall<BillDeskOrderResponse>(
        `/v1.2/pg/orders/${orderId}`,
        "GET"
      );

      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: response.payment_id || orderId,
        providerOrderId: response.order_id,
        status: this.mapPaymentStatus(response.order_status),
        amount: Math.round((response.payment_amount || response.order_amount) * 100),
        currency: response.order_currency as Currency,
        provider: "billdesk",
        environment: this.environment,
        method: response.payment_mode ? { type: this.detectMethod(response.payment_mode) } : undefined,
        providerData: response,
        createdAt: response.payment_time ? new Date(response.payment_time) : new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("BillDesk payment verification failed:", error);
      throw new PaymentError(
        `Payment verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_VERIFICATION_FAILED",
        "billdesk",
        error
      );
    }
  }

  public async capturePayment(params: CapturePaymentParams): Promise<PaymentResult> {
    try {
      // BillDesk processes payments synchronously; return verification result.
      return this.verifyPayment({
        paymentId: params.paymentId,
        providerPaymentId: params.providerPaymentId,
      });
    } catch (error) {
      console.error("BillDesk capture failed:", error);
      throw new PaymentError(
        `Payment capture failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CAPTURE_FAILED",
        "billdesk",
        error
      );
    }
  }

  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    try {
      const orderId = params.providerPaymentId;

      if (!orderId) {
        throw new RefundError("Missing BillDesk order identifier", "MISSING_PROVIDER_PAYMENT_ID", "billdesk");
      }

      const request = {
        refund_amount: params.amount ? params.amount / 100 : undefined,
        refund_ref_no: `REF_${Date.now()}`,
        reason: params.reason,
      };

      const response = await this.makeApiCall<BillDeskRefundResponse>(
        `/v1.2/pg/orders/${orderId}/refunds`,
        "POST",
        request
      );

      const result: RefundResult = {
        refundId: response.refund_id,
        paymentId: params.paymentId,
        providerRefundId: response.refund_id,
        amount: Math.round(response.refund_amount * 100),
        status: this.mapRefundStatus(response.refund_status),
        provider: "billdesk",
        environment: this.environment,
        reason: params.reason,
        notes: params.notes,
        providerData: response,
        createdAt: response.initiated_at ? new Date(response.initiated_at) : new Date(),
      };

      return result;
    } catch (error) {
      console.error("BillDesk refund creation failed:", error);
      throw new RefundError(
        `Refund creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_CREATION_FAILED",
        "billdesk",
        error
      );
    }
  }

  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      const response = await this.makeApiCall<BillDeskRefundResponse>(
        `/v1.2/pg/refunds/${refundId}`,
        "GET"
      );

      const result: RefundResult = {
        refundId: response.refund_id || refundId,
        paymentId: response.order_id || "",
        providerRefundId: response.refund_id || refundId,
        amount: Math.round(response.refund_amount * 100),
        status: this.mapRefundStatus(response.refund_status),
        provider: "billdesk",
        environment: this.environment,
        providerData: response,
        createdAt: response.initiated_at ? new Date(response.initiated_at) : new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("BillDesk refund status check failed:", error);
      throw new RefundError(
        `Refund status check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_STATUS_CHECK_FAILED",
        "billdesk",
        error
      );
    }
  }

  public async verifyWebhook(params: WebhookVerifyParams): Promise<WebhookVerifyResult> {
    try {
      const signature = params.headers["bd-signature"] || params.signature;

      if (!signature) {
        return { verified: false, error: { code: "MISSING_SIGNATURE", message: "Missing BillDesk signature" } };
      }

      const expected = this.generateChecksum(params.body.toString());

      if (signature !== expected) {
        return { verified: false, error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" } };
      }

      const payload = JSON.parse(params.body.toString());

      return {
        verified: true,
        event: {
          type: payload.event || "payment.update",
          paymentId: payload.data?.payment_id || payload.data?.order_id,
          refundId: payload.data?.refund_id,
          status: payload.data?.status,
          data: payload.data || payload,
        },
        providerData: payload,
      };
    } catch (error) {
      console.error("BillDesk webhook verification failed:", error);
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
      await this.makeApiCall("/v1.2/pg/orders?limit=1", "GET");

      const responseTime = Date.now() - start;

      return {
        provider: "billdesk",
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
        provider: "billdesk",
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
    return ["card", "upi", "netbanking"];
  }

  public getSupportedCurrencies(): Currency[] {
    return ["INR"];
  }

  public async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.merchantId) {
      errors.push("Missing BillDesk Merchant ID");
    }

    if (!this.checksumKey) {
      errors.push("Missing BillDesk Checksum Key");
    }

    return { valid: errors.length === 0, errors };
  }

  private async makeApiCall<T>(endpoint: string, method: "GET" | "POST", data?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "PaymentApp/1.0",
      "merchantId": this.merchantId,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BillDesk API error: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private generateChecksum(payload: any): string {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    return crypto.createHmac("sha256", this.checksumKey).update(data, "utf8").digest("base64");
  }

  private mapPaymentStatus(status: string): PaymentStatus {
    switch ((status || "").toUpperCase()) {
      case "INITIATED":
        return "initiated";
      case "PENDING":
      case "IN_PROGRESS":
        return "processing";
      case "SUCCESS":
      case "PAID":
      case "COMPLETED":
        return "captured";
      case "FAILED":
      case "DECLINED":
      case "CANCELLED":
        return "failed";
      case "REFUNDED":
        return "refunded";
      default:
        return "failed";
    }
  }

  private mapRefundStatus(status: string): RefundStatus {
    switch ((status || "").toUpperCase()) {
      case "SUCCESS":
      case "COMPLETED":
        return "completed";
      case "PENDING":
      case "IN_PROGRESS":
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

  private detectMethod(method: string): PaymentMethod {
    switch ((method || "").toLowerCase()) {
      case "upi":
        return "upi";
      case "netbanking":
        return "netbanking";
      case "card":
      case "credit_card":
      case "debit_card":
        return "card";
      default:
        return "card";
    }
  }
}
