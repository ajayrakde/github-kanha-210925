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

interface PaytmInitiateTransactionResponse {
  body: {
    resultInfo: {
      resultStatus: string;
      resultCode: string;
      resultMsg: string;
    };
    txnToken?: string;
    bankForm?: Record<string, any>;
  };
  head?: Record<string, any>;
}

interface PaytmOrderStatusResponse {
  body: {
    resultInfo: {
      resultStatus: string;
      resultCode: string;
      resultMsg: string;
    };
    orderId: string;
    txnId?: string;
    bankTxnId?: string;
    txnAmount?: string;
    txnDate?: string;
    paymentMode?: string;
    currency?: string;
    gatewayName?: string;
    bankName?: string;
    mid?: string;
  };
}

interface PaytmRefundResponse {
  body: {
    resultInfo: {
      resultStatus: string;
      resultCode: string;
      resultMsg: string;
    };
    refundId: string;
    txnId?: string;
    orderId?: string;
    refundAmount?: string;
  };
}

export class PaytmAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider = "paytm";
  public readonly environment: Environment;

  private readonly merchantId: string;
  private readonly merchantKey: string;
  private readonly websiteName: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ResolvedConfig) {
    this.environment = config.environment;

    this.merchantId = config.merchantId || "";
    this.merchantKey = config.secrets.merchantKey || "";
    this.websiteName = config.metadata?.websiteName || (this.environment === "live" ? "DEFAULT" : "WEBSTAGING");

    this.baseUrl = this.environment === "live"
      ? "https://securegw.paytm.in"
      : "https://securegw-stage.paytm.in";

    if (!this.merchantId || !this.merchantKey) {
      throw new PaymentError(
        "Missing Paytm credentials",
        "MISSING_CREDENTIALS",
        "paytm"
      );
    }
  }

  public async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const body = {
        requestType: "Payment",
        mid: this.merchantId,
        websiteName: this.websiteName,
        orderId: params.orderId,
        callbackUrl: params.successUrl,
        txnAmount: {
          value: (params.orderAmount / 100).toFixed(2),
          currency: params.currency,
        },
        userInfo: {
          custId: params.customer.id || params.customer.email || params.customer.phone || `CUST_${Date.now()}`,
          email: params.customer.email,
          mobile: params.customer.phone,
        },
      };

      const head = {
        signature: this.generateSignature(body),
      };

      const payload = { body, head };

      const response = await this.makeApiCall<PaytmInitiateTransactionResponse>(
        `/theia/api/v1/initiateTransaction?mid=${this.merchantId}&orderId=${params.orderId}`,
        "POST",
        payload
      );

      if (response.body.resultInfo.resultStatus !== "S") {
        throw new Error(response.body.resultInfo.resultMsg);
      }

      const result: PaymentResult = {
        paymentId: crypto.randomUUID(),
        providerPaymentId: params.orderId,
        providerOrderId: params.orderId,
        status: "initiated",
        amount: params.orderAmount,
        currency: params.currency,
        provider: "paytm",
        environment: this.environment,
        providerData: {
          txnToken: response.body.txnToken,
          orderId: params.orderId,
          mid: this.merchantId,
        },
        createdAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("Paytm payment creation failed:", error);
      throw new PaymentError(
        `Paytm payment creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CREATION_FAILED",
        "paytm",
        error
      );
    }
  }

  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      const orderId = params.providerPaymentId || params.paymentId;

      if (!orderId) {
        throw new PaymentError("Missing Paytm order identifier", "MISSING_VERIFICATION_DATA", "paytm");
      }

      const body = {
        mid: this.merchantId,
        orderId,
      };

      const payload = {
        body,
        head: {
          signature: this.generateSignature(body),
        },
      };

      const response = await this.makeApiCall<PaytmOrderStatusResponse>(
        "/v3/order/status",
        "POST",
        payload
      );

      const info = response.body;

      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: info.txnId || orderId,
        providerOrderId: info.orderId,
        status: this.mapPaymentStatus(info.resultInfo.resultStatus),
        amount: info.txnAmount ? Math.round(parseFloat(info.txnAmount) * 100) : 0,
        currency: (info.currency as Currency) || "INR",
        provider: "paytm",
        environment: this.environment,
        method: info.paymentMode ? { type: this.detectMethod(info.paymentMode), brand: info.bankName } : undefined,
        providerData: info,
        createdAt: info.txnDate ? new Date(info.txnDate) : new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("Paytm payment verification failed:", error);
      throw new PaymentError(
        `Payment verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_VERIFICATION_FAILED",
        "paytm",
        error
      );
    }
  }

  public async capturePayment(params: CapturePaymentParams): Promise<PaymentResult> {
    try {
      // Paytm auto-captures UPI/card payments. Return verification result.
      return this.verifyPayment({
        paymentId: params.paymentId,
        providerPaymentId: params.providerPaymentId,
      });
    } catch (error) {
      console.error("Paytm capture failed:", error);
      throw new PaymentError(
        `Payment capture failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CAPTURE_FAILED",
        "paytm",
        error
      );
    }
  }

  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    try {
      const orderId = params.providerPaymentId;

      if (!orderId) {
        throw new RefundError("Missing Paytm order identifier", "MISSING_PROVIDER_PAYMENT_ID", "paytm");
      }

      const body = {
        mid: this.merchantId,
        orderId,
        txnType: "REFUND",
        refId: `REF_${Date.now()}`,
        txnId: params.paymentId,
        refundAmount: params.amount ? (params.amount / 100).toFixed(2) : undefined,
      };

      const payload = {
        body,
        head: {
          signature: this.generateSignature(body),
        },
      };

      const response = await this.makeApiCall<PaytmRefundResponse>(
        "/refund/apply",
        "POST",
        payload
      );

      const info = response.body;

      const result: RefundResult = {
        refundId: info.refundId,
        paymentId: params.paymentId,
        providerRefundId: info.refundId,
        amount: info.refundAmount ? Math.round(parseFloat(info.refundAmount) * 100) : params.amount || 0,
        status: this.mapRefundStatus(info.resultInfo.resultStatus),
        provider: "paytm",
        environment: this.environment,
        reason: params.reason,
        notes: params.notes,
        providerData: info,
        createdAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("Paytm refund creation failed:", error);
      throw new RefundError(
        `Refund creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_CREATION_FAILED",
        "paytm",
        error
      );
    }
  }

  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      const body = {
        mid: this.merchantId,
        refundId,
      };

      const payload = {
        body,
        head: {
          signature: this.generateSignature(body),
        },
      };

      const response = await this.makeApiCall<PaytmRefundResponse>(
        "/v3/refund/status",
        "POST",
        payload
      );

      const info = response.body;

      const result: RefundResult = {
        refundId: info.refundId || refundId,
        paymentId: info.orderId || "",
        providerRefundId: info.refundId || refundId,
        amount: info.refundAmount ? Math.round(parseFloat(info.refundAmount) * 100) : 0,
        status: this.mapRefundStatus(info.resultInfo.resultStatus),
        provider: "paytm",
        environment: this.environment,
        providerData: info,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("Paytm refund status check failed:", error);
      throw new RefundError(
        `Refund status check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_STATUS_CHECK_FAILED",
        "paytm",
        error
      );
    }
  }

  public async verifyWebhook(params: WebhookVerifyParams): Promise<WebhookVerifyResult> {
    try {
      const signature = params.headers["x-paytm-signature"] || params.signature;

      if (!signature) {
        return { verified: false, error: { code: "MISSING_SIGNATURE", message: "Missing Paytm signature" } };
      }

      const body = params.body.toString();
      const expected = this.generateSignature(body);

      if (signature !== expected) {
        return { verified: false, error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" } };
      }

      const payload = JSON.parse(body);

      return {
        verified: true,
        event: {
          type: payload.eventType || "payment.update",
          paymentId: payload.orderId,
          refundId: payload.refundId,
          status: payload.status,
          data: payload,
        },
        providerData: payload,
      };
    } catch (error) {
      console.error("Paytm webhook verification failed:", error);
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
      const body = { mid: this.merchantId, orderId: "PING" };
      await this.makeApiCall(
        "/v3/order/status",
        "POST",
        { body, head: { signature: this.generateSignature(body) } }
      );

      const responseTime = Date.now() - start;

      return {
        provider: "paytm",
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
        provider: "paytm",
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

    if (!this.merchantId) {
      errors.push("Missing Paytm Merchant ID");
    }

    if (!this.merchantKey) {
      errors.push("Missing Paytm Merchant Key");
    }

    return { valid: errors.length === 0, errors };
  }

  private async makeApiCall<T>(endpoint: string, method: "GET" | "POST", data?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PaymentApp/1.0",
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Paytm API error: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  private generateSignature(data: any): string {
    const stringPayload = typeof data === "string" ? data : JSON.stringify(data);
    return crypto
      .createHmac("sha256", this.merchantKey)
      .update(stringPayload, "utf8")
      .digest("base64");
  }

  private mapPaymentStatus(status: string): PaymentStatus {
    switch ((status || "").toUpperCase()) {
      case "S":
      case "SUCCESS":
        return "captured";
      case "PENDING":
      case "P":
        return "processing";
      case "INITIATED":
        return "initiated";
      case "TXN_SUCCESS":
        return "captured";
      case "TXN_FAILURE":
      case "F":
      case "FAILURE":
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
      case "REFUND_SUCCESS":
        return "completed";
      case "PENDING":
      case "PROCESSING":
        return "processing";
      case "FAILURE":
      case "FAILED":
        return "failed";
      case "CANCELLED":
        return "cancelled";
      default:
        return "pending";
    }
  }

  private detectMethod(mode: string): PaymentMethod {
    switch ((mode || "").toLowerCase()) {
      case "upi":
        return "upi";
      case "netbanking":
        return "netbanking";
      case "wallet":
        return "wallet";
      case "creditcard":
      case "debitcard":
      case "card":
        return "card";
      default:
        return "card";
    }
  }
}
