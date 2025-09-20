import { otps, admins, influencers, users, type Otp, type InsertOtp } from "@shared/schema";
import { db } from "./db";
import { eq, and, gt, lt } from "drizzle-orm";
import { createHash } from "crypto";
import { storage } from "./storage";

export class OtpService {
  // Generate configurable-length OTP
  private async generateOtp(): Promise<string> {
    // Get OTP length from settings, default to 6
    const otpLengthSetting = await storage.getAppSetting('otp_length');
    const otpLength = otpLengthSetting?.value ? parseInt(otpLengthSetting.value) : 6;
    
    const min = Math.pow(10, otpLength - 1);
    const max = Math.pow(10, otpLength) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }

  // Hash OTP for secure storage
  private hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  // Verify OTP using configured SMS service provider
  private async verifyOtpWithProvider(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
    // Check SMS service provider setting
    const smsProviderSetting = await storage.getAppSetting('sms_service_provider');
    const smsProvider = smsProviderSetting?.value || '2Factor';
    
    if (smsProvider === 'Test') {
      // Mock verification - check if OTP is a valid number
      if (/^\d{4,8}$/.test(otp)) {
        console.log(`🧪 TEST MODE - Mock OTP verification successful for +91${phone}: ${otp}`);
        return { success: true };
      } else {
        return { success: false, error: 'Invalid OTP format (must be 4-8 digits)' };
      }
    }
    
    // Real 2Factor API verification
    const apiKey = process.env.TWOFACTOR_API_KEY;
    
    if (!apiKey) {
      return { success: false, error: 'SMS service not configured' };
    }

    try {
      // Use 2Factor VERIFY3 endpoint for phone + OTP verification
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY3/91${phone}/${otp}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.Status === 'Success' && data.Details === 'OTP Matched') {
        return { success: true };
      } else {
        return { success: false, error: data.Details || 'OTP verification failed' };
      }
    } catch (error) {
      console.error('[SMS] Error verifying OTP via 2Factor:', error);
      return { success: false, error: 'Verification service temporarily unavailable' };
    }
  }

  // Validate Indian phone number
  private validateIndianPhone(phone: string): { isValid: boolean; cleanPhone: string } {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Check if it's a valid Indian number
    if (digits.length === 10 && digits.match(/^[6-9]\d{9}$/)) {
      return { isValid: true, cleanPhone: digits };
    } else if (digits.length === 12 && digits.startsWith('91') && digits.substring(2).match(/^[6-9]\d{9}$/)) {
      return { isValid: true, cleanPhone: digits.substring(2) };
    } else if (digits.length === 13 && digits.startsWith('091') && digits.substring(3).match(/^[6-9]\d{9}$/)) {
      return { isValid: true, cleanPhone: digits.substring(3) };
    }
    
    return { isValid: false, cleanPhone: '' };
  }

  // Send OTP using configured SMS service provider
  private async sendSms(phone: string, otp: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    // Check SMS service provider setting
    const smsProviderSetting = await storage.getAppSetting('sms_service_provider');
    const smsProvider = smsProviderSetting?.value || '2Factor';
    
    if (smsProvider === 'Test') {
      // Mock SMS flow for testing
      console.log(`\n========================================`);
      console.log(`🧪 TEST MODE - MOCK SMS`);
      console.log(`📱 Phone: +91${phone}`);
      console.log(`🔢 OTP: ${otp}`);
      console.log(`⚠️  Use this OTP to login (TEST MODE)`);
      console.log(`========================================\n`);
      return { 
        success: true, 
        sessionId: `mock_${phone}_${Date.now()}` 
      };
    }
    
    // Real 2Factor API flow
    const apiKey = process.env.TWOFACTOR_API_KEY;
    
    if (!apiKey) {
      console.error('[SMS] 2Factor API key not configured');
      return { success: false, error: 'SMS service not configured' };
    }

    try {
      // Use 2Factor AUTOGEN endpoint to send system-generated OTP
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/+91${phone}/AUTOGEN`;
      
      console.log(`[SMS] Sending OTP to +91${phone} via 2Factor`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.Status === 'Success') {
        console.log(`[SMS] OTP sent successfully to +91${phone}`);
        return { 
          success: true, 
          sessionId: data.Details 
        };
      } else {
        console.error(`[SMS] Failed to send OTP: ${data.Details || 'Unknown error'}`);
        return { 
          success: false, 
          error: data.Details || 'Failed to send SMS' 
        };
      }
    } catch (error) {
      console.error('[SMS] Error calling 2Factor API:', error);
      return { 
        success: false, 
        error: 'SMS service temporarily unavailable' 
      };
    }
  }

  // Check if user exists based on phone and user type
  private async userExists(phone: string, userType: string): Promise<boolean> {
    switch (userType) {
      case 'admin':
        const admin = await db.select().from(admins).where(eq(admins.phone, phone)).limit(1);
        return admin.length > 0;
      case 'influencer':
        const influencer = await db.select().from(influencers).where(eq(influencers.phone, phone)).limit(1);
        return influencer.length > 0;
      case 'buyer':
        // For buyers, we allow new registrations
        return true;
      default:
        return false;
    }
  }

  // Send OTP to phone number
  async sendOtp(phone: string, userType: 'admin' | 'influencer' | 'buyer'): Promise<{ success: boolean; message: string; otpId?: string }> {
    try {
      // Check if OTP login is enabled for buyers
      if (userType === 'buyer') {
        const otpSetting = await storage.getAppSetting('otp_login_enabled');
        if (otpSetting?.value !== 'true') {
          return {
            success: false,
            message: 'OTP login is currently disabled. Please contact support.'
          };
        }
      }

      // Validate Indian phone number
      const phoneValidation = this.validateIndianPhone(phone);
      if (!phoneValidation.isValid) {
        return {
          success: false,
          message: 'Please enter a valid Indian phone number'
        };
      }
      
      const cleanPhone = phoneValidation.cleanPhone;
      
      // Rate limiting: Check if OTP was sent in last 60 seconds
      const recentOtp = await db.select()
        .from(otps)
        .where(
          and(
            eq(otps.phone, cleanPhone),
            eq(otps.userType, userType),
            gt(otps.expiresAt, new Date())
          )
        )
        .orderBy(otps.createdAt)
        .limit(1);

      if (recentOtp.length > 0) {
        const timeDiff = Date.now() - new Date(recentOtp[0].createdAt!).getTime();
        if (timeDiff < 60000) { // 60 seconds
          return {
            success: false,
            message: `Please wait ${Math.ceil((60000 - timeDiff) / 1000)} seconds before requesting another OTP`
          };
        }
      }

      // Check if user exists (except for buyers who can register)
      if (userType !== 'buyer') {
        const exists = await this.userExists(cleanPhone, userType);
        if (!exists) {
          return {
            success: false,
            message: `No ${userType} account found with this phone number`
          };
        }
      }

      // Generate OTP for mock mode or use 2Factor autogen
      const smsProviderSetting = await storage.getAppSetting('sms_service_provider');
      const smsProvider = smsProviderSetting?.value || '2Factor';
      
      let otpToSend = '';
      if (smsProvider === 'Test') {
        // Generate OTP for mock flow
        otpToSend = await this.generateOtp();
      }
      
      const smsResult = await this.sendSms(cleanPhone, otpToSend);
      
      if (!smsResult.success) {
        return {
          success: false,
          message: smsResult.error || 'Failed to send SMS. Please try again.'
        };
      }

      // Save session info to database for tracking (no OTP hash needed since 2Factor handles it)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      const [otpRecord] = await db.insert(otps).values({
        phone: cleanPhone,
        otp: smsResult.sessionId || 'twofactor-session', // Store session ID from 2Factor
        userType,
        expiresAt,
        isUsed: false
      }).returning();

      return {
        success: true,
        message: 'OTP sent successfully',
        otpId: otpRecord.id
      };

    } catch (error) {
      console.error('Error sending OTP:', error);
      return {
        success: false,
        message: 'Failed to send OTP. Please try again.'
      };
    }
  }

  // Verify OTP and return user information
  async verifyOtp(phone: string, otp: string, userType: 'admin' | 'influencer' | 'buyer'): Promise<{ 
    success: boolean; 
    message: string; 
    user?: any;
    isNewUser?: boolean;
  }> {
    try {
      // Validate phone number format
      const phoneValidation = this.validateIndianPhone(phone);
      if (!phoneValidation.isValid) {
        return {
          success: false,
          message: 'Invalid phone number format'
        };
      }
      
      const cleanPhone = phoneValidation.cleanPhone;

      // First verify with configured SMS service provider
      const verificationResult = await this.verifyOtpWithProvider(cleanPhone, otp);
      
      if (!verificationResult.success) {
        console.log(`[OTP] Verification failed for +91${cleanPhone}: ${verificationResult.error}`);
        return {
          success: false,
          message: verificationResult.error || 'Invalid or expired OTP'
        };
      }

      // Find valid OTP record in our database (for session tracking)
      const [otpRecord] = await db.select()
        .from(otps)
        .where(
          and(
            eq(otps.phone, cleanPhone),
            eq(otps.userType, userType),
            eq(otps.isUsed, false),
            gt(otps.expiresAt, new Date())
          )
        )
        .orderBy(otps.createdAt)
        .limit(1);

      if (!otpRecord) {
        console.log(`[OTP] No valid session found for +91${cleanPhone}`);
        return {
          success: false,
          message: 'OTP session expired or invalid'
        };
      }

      // Mark OTP as used
      await db.update(otps)
        .set({ isUsed: true })
        .where(eq(otps.id, otpRecord.id));

      // Get or create user based on type
      let user;
      let isNewUser = false;

      switch (userType) {
        case 'admin':
          const [admin] = await db.select().from(admins).where(eq(admins.phone, cleanPhone));
          user = admin;
          break;
        
        case 'influencer':
          const [influencer] = await db.select().from(influencers).where(eq(influencers.phone, cleanPhone));
          user = influencer;
          break;
        
        case 'buyer':
          let [buyer] = await db.select().from(users).where(eq(users.phone, cleanPhone));
          if (!buyer) {
            // Create new user
            [buyer] = await db.insert(users).values({
              phone: cleanPhone
            }).returning();
            isNewUser = true;
          }
          user = buyer;
          break;
      }

      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      console.log(`[OTP] Successful verification for ${userType} +91${cleanPhone}`);
      return {
        success: true,
        message: 'OTP verified successfully',
        user,
        isNewUser
      };

    } catch (error) {
      console.error('Error verifying OTP:', error);
      return {
        success: false,
        message: 'Failed to verify OTP. Please try again.'
      };
    }
  }

  // Clean up expired OTPs (can be called periodically)
  async cleanupExpiredOtps(): Promise<void> {
    try {
      await db.delete(otps).where(lt(otps.expiresAt, new Date()));
    } catch (error) {
      console.error('Error cleaning up expired OTPs:', error);
    }
  }
}

export const otpService = new OtpService();