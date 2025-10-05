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

interface CashfreeOrderResponse {
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_session_id?: string;
  cf_payment_id?: string;
  created_at?: string;
  customer_details?: {
    customer_id?: string;
    customer_email?: string;
    customer_phone?: string;
  };
  payment_details?: Array<{
    cf_payment_id: string;
    payment_method: string;
    payment_status: string;
    payment_amount: number;
    bank_reference?: string;
  }>;
}

interface CashfreeRefundResponse {
  refund_id: string;
  cf_payment_id?: string;
  order_id?: string;
  refund_amount: number;
  refund_status: string;
  refund_note?: string;
  initiated_at?: string;
}

export class CashfreeAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider = "cashfree";
  public readonly environment: Environment;

  private readonly appId: string;
  private readonly secretKey: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ResolvedConfig) {
    this.environment = config.environment;

    this.appId = config.appId || config.keyId || "";
    this.secretKey = config.secrets.keySecret || "";
    this.webhookSecret = config.secrets.webhookSecret;

    this.baseUrl = this.environment === "live"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

    if (!this.appId || !this.secretKey) {
      throw new PaymentError(
        "Missing Cashfree credentials",
        "MISSING_CREDENTIALS",
        "cashfree"
      );
    }
  }

  public async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      // Sanitize customer_id to be alphanumeric with underscores/hyphens only
      const sanitizeCustomerId = (id: string | undefined): string => {
        if (!id) return `cust_${Date.now()}`;
        // Replace @ and other special characters with underscore, keep only alphanumeric, hyphens, underscores
        return id.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
      };

      const customerId = params.customer.id 
        ? sanitizeCustomerId(params.customer.id)
        : params.customer.email 
          ? sanitizeCustomerId(params.customer.email)
          : params.customer.phone 
            ? sanitizeCustomerId(params.customer.phone)
            : `cust_${Date.now()}`;

      // Validate required fields for Cashfree
      if (!params.customer.phone) {
        throw new PaymentError(
          "Customer phone number is required for Cashfree payments",
          "MISSING_CUSTOMER_PHONE",
          "cashfree"
        );
      }

      const customerDetails: {
        customer_id: string;
        customer_phone: string;
        customer_email?: string;
        customer_name?: string;
      } = {
        customer_id: customerId,
        customer_phone: params.customer.phone,
      };

      if (params.customer.email) {
        customerDetails.customer_email = params.customer.email;
      }

      if (params.customer.name) {
        customerDetails.customer_name = params.customer.name;
      }

      const orderMeta: {
        return_url?: string;
        notify_url?: string;
      } = {};

      if (params.successUrl) {
        orderMeta.return_url = params.successUrl;
      }

      if (params.providerOptions?.notifyUrl) {
        orderMeta.notify_url = params.providerOptions.notifyUrl;
      }

      const request: any = {
        order_id: params.orderId,
        order_amount: params.orderAmount / 100,
        order_currency: params.currency,
        customer_details: customerDetails,
      };

      if (Object.keys(orderMeta).length > 0) {
        request.order_meta = orderMeta;
      }

      const response = await this.makeApiCall<CashfreeOrderResponse>("/orders", "POST", request);

      const checkoutBaseUrl = this.environment === "live"
        ? "https://payments.cashfree.com/order"
        : "https://sandbox.cashfree.com/pg/view/order";

      const redirectUrl = response.payment_session_id
        ? `${checkoutBaseUrl}/${response.order_id}/${response.payment_session_id}`
        : undefined;

      const result: PaymentResult = {
        paymentId: crypto.randomUUID(),
        providerPaymentId: response.order_id,
        providerOrderId: response.order_id,
        status: this.mapPaymentStatus(response.order_status),
        amount: Math.round(response.order_amount * 100),
        currency: response.order_currency as Currency,
        provider: "cashfree",
        environment: this.environment,
        redirectUrl,
        providerData: {
          paymentSessionId: response.payment_session_id,
          cfPaymentId: response.cf_payment_id,
        },
        createdAt: response.created_at ? new Date(response.created_at) : new Date(),
      };

      return result;
    } catch (error) {
      console.error("Cashfree payment creation failed:", error);
      throw new PaymentError(
        `Cashfree payment creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CREATION_FAILED",
        "cashfree",
        error
      );
    }
  }

  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      const providerOrderId = params.providerPaymentId || params.paymentId;

      if (!providerOrderId) {
        throw new PaymentError("Missing Cashfree order identifier", "MISSING_VERIFICATION_DATA", "cashfree");
      }

      const response = await this.makeApiCall<CashfreeOrderResponse>(
        `/orders/${providerOrderId}`,
        "GET"
      );

      const payment = response.payment_details?.[0];

      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: payment?.cf_payment_id || response.order_id,
        providerOrderId: response.order_id,
        status: this.mapPaymentStatus(payment?.payment_status || response.order_status),
        amount: Math.round((payment?.payment_amount || response.order_amount) * 100),
        currency: response.order_currency as Currency,
        provider: "cashfree",
        environment: this.environment,
        method: payment?.payment_method
          ? { type: this.detectMethod(payment.payment_method) }
          : undefined,
        providerData: {
          payment,
          order: response,
        },
        createdAt: response.created_at ? new Date(response.created_at) : new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("Cashfree payment verification failed:", error);
      throw new PaymentError(
        `Payment verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_VERIFICATION_FAILED",
        "cashfree",
        error
      );
    }
  }

  public async capturePayment(params: CapturePaymentParams): Promise<PaymentResult> {
    try {
      const providerOrderId = params.providerPaymentId || params.paymentId;

      if (!providerOrderId) {
        throw new PaymentError("Missing Cashfree order identifier", "MISSING_PROVIDER_PAYMENT_ID", "cashfree");
      }

      await this.makeApiCall(
        `/orders/${providerOrderId}/capture`,
        "POST",
        params.amount ? { amount: params.amount / 100 } : undefined
      );

      return this.verifyPayment({
        paymentId: params.paymentId,
        providerPaymentId: providerOrderId,
      });
    } catch (error) {
      console.error("Cashfree capture failed:", error);
      throw new PaymentError(
        `Payment capture failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CAPTURE_FAILED",
        "cashfree",
        error
      );
    }
  }

  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    try {
      const providerOrderId = params.providerPaymentId;

      if (!providerOrderId) {
        throw new RefundError("Missing Cashfree order identifier", "MISSING_PROVIDER_PAYMENT_ID", "cashfree");
      }

      const request = {
        refund_amount: params.amount ? params.amount / 100 : undefined,
        refund_note: params.reason,
      };

      const response = await this.makeApiCall<CashfreeRefundResponse>(
        `/orders/${providerOrderId}/refunds`,
        "POST",
        request
      );

      const result: RefundResult = {
        refundId: response.refund_id,
        paymentId: params.paymentId,
        providerRefundId: response.refund_id,
        amount: Math.round(response.refund_amount * 100),
        status: this.mapRefundStatus(response.refund_status),
        provider: "cashfree",
        environment: this.environment,
        reason: params.reason,
        notes: params.notes,
        providerData: response,
        createdAt: response.initiated_at ? new Date(response.initiated_at) : new Date(),
      };

      return result;
    } catch (error) {
      console.error("Cashfree refund creation failed:", error);
      throw new RefundError(
        `Refund creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_CREATION_FAILED",
        "cashfree",
        error
      );
    }
  }

  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      const response = await this.makeApiCall<CashfreeRefundResponse>(
        `/refunds/${refundId}`,
        "GET"
      );

      const result: RefundResult = {
        refundId: response.refund_id || refundId,
        paymentId: response.order_id || "",
        providerRefundId: response.refund_id || refundId,
        amount: Math.round(response.refund_amount * 100),
        status: this.mapRefundStatus(response.refund_status),
        provider: "cashfree",
        environment: this.environment,
        providerData: response,
        createdAt: response.initiated_at ? new Date(response.initiated_at) : new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("Cashfree refund status check failed:", error);
      throw new RefundError(
        `Refund status check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_STATUS_CHECK_FAILED",
        "cashfree",
        error
      );
    }
  }

  public async verifyWebhook(params: WebhookVerifyParams): Promise<WebhookVerifyResult> {
    try {
      // Cashfree uses the secret key (not a separate webhook secret) for verification
      if (!this.secretKey) {
        throw new WebhookError("Secret key not configured", "SECRET_KEY_MISSING", "cashfree");
      }

      const signature = params.headers["x-webhook-signature"];
      const timestamp = params.headers["x-webhook-timestamp"];
      
      if (!signature) {
        return { verified: false, error: { code: "MISSING_SIGNATURE", message: "Missing Cashfree signature" } };
      }

      if (!timestamp) {
        return { verified: false, error: { code: "MISSING_TIMESTAMP", message: "Missing Cashfree timestamp" } };
      }

      // Cashfree signature is HMAC-SHA256(timestamp + rawBody) encoded as base64
      const message = timestamp + params.body.toString();
      const expected = crypto
        .createHmac("sha256", this.secretKey)
        .update(message, "utf8")
        .digest("base64");

      if (signature !== expected) {
        return { verified: false, error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" } };
      }

      const payload = JSON.parse(params.body.toString());
      const eventType = payload.type || payload.event || "payment.update";

      return {
        verified: true,
        event: {
          type: eventType,
          paymentId: payload.data?.cf_payment_id || payload.data?.order_id,
          refundId: payload.data?.refund_id,
          status: payload.data?.status,
          data: payload.data || payload,
        },
        providerData: payload,
      };
    } catch (error) {
      console.error("Cashfree webhook verification failed:", error);
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
      await this.makeApiCall("/orders?limit=1", "GET");

      const responseTime = Date.now() - start;

      return {
        provider: "cashfree",
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
        provider: "cashfree",
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

  public async initiateUPIPayment(params: {
    paymentSessionId: string;
    upiId: string;
    orderId: string;
  }): Promise<{
    cfPaymentId: string;
    status: string;
    data?: {
      url?: string;
      payload?: Record<string, any>;
    };
  }> {
    try {
      const request = {
        payment_session_id: params.paymentSessionId,
        payment_method: {
          upi: {
            channel: "collect",
            upi_id: params.upiId,
          },
        },
      };

      const response = await this.makeApiCall<{
        cf_payment_id: string;
        payment_method: string;
        channel: string;
        action: string;
        payment_amount: number;
        data?: {
          url?: string;
          payload?: Record<string, any>;
          content_type?: string;
          method?: string;
        };
      }>("/orders/sessions", "POST", request);

      return {
        cfPaymentId: response.cf_payment_id,
        status: "processing",
        data: response.data,
      };
    } catch (error) {
      console.error("Cashfree UPI payment initiation failed:", error);
      throw new PaymentError(
        `UPI payment initiation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_INITIATION_FAILED",
        "cashfree",
        error
      );
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

    if (!this.appId) {
      errors.push("Missing Cashfree App ID");
    }

    if (!this.secretKey) {
      errors.push("Missing Cashfree Secret Key");
    }

    return { valid: errors.length === 0, errors };
  }

  private async makeApiCall<T>(endpoint: string, method: "GET" | "POST" | "PUT" | "DELETE", data?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-client-id": this.appId,
      "x-client-secret": this.secretKey,
      "x-api-version": "2025-01-01",
      "User-Agent": "PaymentApp/1.0",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cashfree API error: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private mapPaymentStatus(status?: string): PaymentStatus {
    switch ((status || "").toUpperCase()) {
      case "ACTIVE":
      case "PAYMENT_PENDING":
      case "PENDING":
        return "processing";
      case "AUTHORIZED":
        return "authorized";
      case "SUCCESS":
      case "COMPLETED":
      case "CAPTURED":
        return "captured";
      case "FAILED":
      case "CANCELLED":
        return "failed";
      case "REFUNDED":
        return "refunded";
      default:
        return "failed";
    }
  }

  private mapRefundStatus(status?: string): RefundStatus {
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
      case "wallet":
        return "wallet";
      case "card":
      case "credit_card":
      case "debit_card":
        return "card";
      default:
        return "card";
    }
  }
}
