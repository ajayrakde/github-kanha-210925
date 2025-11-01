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
  PaymentProviderData,
} from "../../shared/payment-types";
import type { PaymentProvider, Environment } from "../../shared/payment-providers";
import type { ResolvedConfig } from "../services/config-resolver";
import { PaymentError, RefundError, WebhookError } from "../../shared/payment-types";

interface CCAvenueResponse {
  status: string;
  message?: string;
  order_status?: string;
  reference_no?: string;
  order_no?: string;
  tracking_id?: string;
  amount?: string;
  currency?: string;
  status_code?: string;
  status_message?: string;
  error_code?: string;
  error_desc?: string;
  refund_status?: string;
  refund_reference_no?: string;
  refund_amount?: string;
  payment_mode?: string;
  data?: Record<string, any>;
}

export class CCAvenueAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider = "ccavenue";
  public readonly environment: Environment;

  private readonly merchantId: string;
  private readonly accessCode: string;
  private readonly workingKey: string;
  private readonly baseUrl: string;
  private readonly redirectBaseUrl: string;

  constructor(private readonly config: ResolvedConfig) {
    this.environment = config.environment;

    this.merchantId = config.merchantId || "";
    this.accessCode = config.accessCode || "";
    this.workingKey = config.secrets.workingKey || "";

    const isLive = this.environment === "live";
    this.baseUrl = isLive
      ? "https://api.ccavenue.com/apis/servlet/DoWebTrans"
      : "https://apitest.ccavenue.com/apis/servlet/DoWebTrans";
    this.redirectBaseUrl = isLive
      ? "https://secure.ccavenue.com/transaction/transaction.do"
      : "https://apitest.ccavenue.com/transaction/transaction.do";

    if (!this.merchantId || !this.accessCode || !this.workingKey) {
      throw new PaymentError(
        "Missing CCAvenue credentials",
        "MISSING_CREDENTIALS",
        "ccavenue"
      );
    }
  }

  public async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const requestParams = new URLSearchParams({
        merchant_id: this.merchantId,
        order_id: params.orderId,
        currency: params.currency,
        amount: (params.orderAmount / 100).toFixed(2),
        redirect_url: params.successUrl || "",
        cancel_url: params.failureUrl || params.cancelUrl || "",
        language: "EN",
        billing_name: params.customer.name || "",
        billing_tel: params.customer.phone || "",
        billing_email: params.customer.email || "",
      });

      if (params.metadata) {
        let index = 1;
        for (const value of Object.values(params.metadata)) {
          if (index > 5) break; // CCAvenue supports up to 5 merchant params
          requestParams.append(`merchant_param${index}`, String(value));
          index += 1;
        }
      }

      const encRequest = this.encrypt(requestParams.toString());

      const result: PaymentResult = {
        paymentId: crypto.randomUUID(),
        providerPaymentId: params.orderId,
        providerOrderId: params.orderId,
        status: "initiated",
        amount: params.orderAmount,
        currency: params.currency,
        provider: "ccavenue",
        environment: this.environment,
        redirectUrl: `${this.redirectBaseUrl}?command=initiateTransaction&encRequest=${encodeURIComponent(encRequest)}&access_code=${encodeURIComponent(this.accessCode)}`,
        providerData: {
          encRequest,
          accessCode: this.accessCode,
          merchantId: this.merchantId,
        },
        createdAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("CCAvenue payment creation failed:", error);
      throw new PaymentError(
        `CCAvenue payment creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CREATION_FAILED",
        "ccavenue",
        error
      );
    }
  }

  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      const orderId = params.providerPaymentId || params.paymentId;

      if (!orderId) {
        throw new PaymentError("Missing CCAvenue order identifier", "MISSING_VERIFICATION_DATA", "ccavenue");
      }

      const encRequest = this.encrypt(
        JSON.stringify({
          order_no: orderId,
        })
      );

      const response = await this.invokeCommand(encRequest, "orderStatusTracker");
      const parsed = this.parseResponse(response);

      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: parsed?.tracking_id || orderId,
        providerOrderId: parsed?.order_no || orderId,
        status: this.mapPaymentStatus(parsed?.order_status || "FAILED"),
        amount: parsed?.amount ? Math.round(parseFloat(parsed.amount) * 100) : 0,
        currency: (parsed?.currency as Currency) || "INR",
        provider: "ccavenue",
        environment: this.environment,
        method: {
          type: "card",
          brand: parsed?.payment_mode,
        },
        providerData: parsed as Record<string, any>,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("CCAvenue payment verification failed:", error);
      throw new PaymentError(
        `Payment verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_VERIFICATION_FAILED",
        "ccavenue",
        error
      );
    }
  }

  public async capturePayment(params: CapturePaymentParams): Promise<PaymentResult> {
    try {
      // CCAvenue payments are typically auto-captured. We call verify to reflect status.
      return this.verifyPayment({
        paymentId: params.paymentId,
        providerPaymentId: params.providerPaymentId,
      });
    } catch (error) {
      console.error("CCAvenue capture failed:", error);
      throw new PaymentError(
        `Payment capture failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "PAYMENT_CAPTURE_FAILED",
        "ccavenue",
        error
      );
    }
  }

  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    try {
      const orderId = params.providerPaymentId;

      if (!orderId) {
        throw new RefundError("Missing CCAvenue order identifier", "MISSING_PROVIDER_PAYMENT_ID", "ccavenue");
      }

      const refundAmount = params.amount ? (params.amount / 100).toFixed(2) : undefined;

      const encRequest = this.encrypt(
        JSON.stringify({
          order_no: orderId,
          refund_amount: refundAmount,
          refund_ref_no: `REF_${Date.now()}`,
          refund_reason: params.reason,
        })
      );

      const response = await this.invokeCommand(encRequest, "refundOrder");
      const parsed = this.parseResponse(response);

      const result: RefundResult = {
        refundId: parsed?.refund_reference_no || crypto.randomUUID(),
        paymentId: params.paymentId,
        providerRefundId: parsed?.refund_reference_no,
        amount: parsed?.refund_amount ? Math.round(parseFloat(parsed.refund_amount) * 100) : params.amount || 0,
        status: this.mapRefundStatus(parsed?.refund_status || "PENDING"),
        provider: "ccavenue",
        environment: this.environment,
        reason: params.reason,
        notes: params.notes,
        providerData: parsed as Record<string, any>,
        createdAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("CCAvenue refund creation failed:", error);
      throw new RefundError(
        `Refund creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_CREATION_FAILED",
        "ccavenue",
        error
      );
    }
  }

  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      const encRequest = this.encrypt(
        JSON.stringify({
          refund_ref_no: refundId,
        })
      );

      const response = await this.invokeCommand(encRequest, "refundStatus");
      const parsed = this.parseResponse(response);

      const result: RefundResult = {
        refundId: parsed?.refund_reference_no || refundId,
        paymentId: parsed?.order_no || "",
        providerRefundId: parsed?.refund_reference_no || refundId,
        amount: parsed?.refund_amount ? Math.round(parseFloat(parsed.refund_amount) * 100) : 0,
        status: this.mapRefundStatus(parsed?.refund_status || "PENDING"),
        provider: "ccavenue",
        environment: this.environment,
        providerData: parsed as Record<string, any>,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error("CCAvenue refund status check failed:", error);
      throw new RefundError(
        `Refund status check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "REFUND_STATUS_CHECK_FAILED",
        "ccavenue",
        error
      );
    }
  }

  public async verifyWebhook(params: WebhookVerifyParams): Promise<WebhookVerifyResult> {
    try {
      const payload = typeof params.body === "string" ? params.body : params.body.toString();
      const search = new URLSearchParams(payload);
      const encResp = search.get("encResp");

      if (!encResp) {
        throw new WebhookError("Missing encResp parameter", "MISSING_ENC_RESP", "ccavenue");
      }

      const decrypted = this.decrypt(encResp);
      const parsed = this.parseResponseString(decrypted);

      return {
        verified: true,
        event: {
          type: "payment.update",
          paymentId: parsed?.tracking_id || parsed?.order_no,
          status: this.mapPaymentStatus(parsed?.order_status || ''),
          data: parsed,
        },
        providerData: parsed as unknown as PaymentProviderData,
      };
    } catch (error) {
      console.error("CCAvenue webhook verification failed:", error);
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
      const encRequest = this.encrypt(JSON.stringify({ order_no: "PING" }));
      await this.invokeCommand(encRequest, "orderStatusTracker");

      const responseTime = Date.now() - start;

      return {
        provider: "ccavenue",
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
        provider: "ccavenue",
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
    return ["INR", "USD"]; // CCAvenue supports multi-currency
  }

  public async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.merchantId) {
      errors.push("Missing CCAvenue Merchant ID");
    }

    if (!this.accessCode) {
      errors.push("Missing CCAvenue Access Code");
    }

    if (!this.workingKey) {
      errors.push("Missing CCAvenue Working Key");
    }

    return { valid: errors.length === 0, errors };
  }

  private async invokeCommand(encRequest: string, command: string): Promise<string> {
    const form = new URLSearchParams({
      command,
      enc_request: encRequest,
      access_code: this.accessCode,
      request_type: "JSON",
      response_type: "JSON",
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "PaymentApp/1.0",
      },
      body: form.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CCAvenue API error: ${response.status} ${text}`);
    }

    return response.text();
  }

  private parseResponse(response: string): CCAvenueResponse {
    const search = new URLSearchParams(response);
    const encResponse = search.get("enc_response") || search.get("encResponse");
    if (!encResponse) {
      return {} as CCAvenueResponse;
    }

    const decrypted = this.decrypt(encResponse);
    return this.parseResponseString(decrypted);
  }

  private parseResponseString(text: string): CCAvenueResponse {
    try {
      return JSON.parse(text);
    } catch {
      const params = new URLSearchParams(text);
      const obj: Record<string, any> = {};
      params.forEach((value, key) => {
        obj[key] = value;
      });
      return obj as CCAvenueResponse;
    }
  }

  private mapPaymentStatus(status: string): PaymentStatus {
    switch ((status || "").toUpperCase()) {
      case "INITIATED":
        return "initiated";
      case "IN PROGRESS":
      case "PENDING":
        return "processing";
      case "SUCCESS":
      case "CAPTURED":
        return "captured";
      case "AUTHORIZATION":
        return "authorized";
      case "REFUND":
      case "REFUNDED":
        return "refunded";
      case "FAILURE":
      case "FAILED":
      case "CANCELLED":
        return "failed";
      default:
        return "failed";
    }
  }

  private mapRefundStatus(status: string): RefundStatus {
    switch ((status || "").toUpperCase()) {
      case "SUCCESS":
      case "PROCESSED":
        return "completed";
      case "PENDING":
      case "IN PROGRESS":
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

  private encrypt(plainText: string): string {
    const key = crypto.createHash("md5").update(this.workingKey).digest();
    const iv = crypto.createHash("md5").update(key).digest();
    const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
    return cipher.update(plainText, "utf8", "hex") + cipher.final("hex");
  }

  private decrypt(cipherText: string): string {
    const key = crypto.createHash("md5").update(this.workingKey).digest();
    const iv = crypto.createHash("md5").update(key).digest();
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    return decipher.update(cipherText, "hex", "utf8") + decipher.final("utf8");
  }
}
