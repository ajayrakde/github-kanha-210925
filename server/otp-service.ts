import { otps, admins, influencers, users, type Otp, type InsertOtp } from "@shared/schema";
import { db } from "./db";
import { eq, and, gt } from "drizzle-orm";
import { createHash } from "crypto";

export class OtpService {
  // Generate 4-digit OTP
  private generateOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Hash OTP for secure storage
  private hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
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

  // Send OTP (mock implementation - in production, integrate with SMS service)
  private async sendSms(phone: string, otp: string): Promise<boolean> {
    console.log(`[SMS] Sending OTP ${otp} to ${phone}`);
    
    // IMPORTANT: This is a mock implementation for development
    // In production, integrate with SMS services like:
    // - Twilio: https://www.twilio.com/docs/sms
    // - TextLocal: https://www.textlocal.in/
    // - AWS SNS: https://aws.amazon.com/sns/
    // - Fast2SMS: https://www.fast2sms.com/
    
    // Example Twilio integration:
    // const accountSid = process.env.TWILIO_ACCOUNT_SID;
    // const authToken = process.env.TWILIO_AUTH_TOKEN;
    // const client = require('twilio')(accountSid, authToken);
    // await client.messages.create({
    //   body: `Your OTP is: ${otp}. Valid for 5 minutes.`,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: `+91${phone}`
    // });
    
    return true;
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

      // Generate OTP and set expiry (5 minutes)
      const otp = this.generateOtp();
      const hashedOtp = this.hashOtp(otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Save hashed OTP to database
      const [otpRecord] = await db.insert(otps).values({
        phone: cleanPhone,
        otp: hashedOtp,
        userType,
        expiresAt,
        isUsed: false
      }).returning();

      // Send SMS (log only first 2 digits for security)
      const smsSent = await this.sendSms(cleanPhone, otp);
      console.log(`[OTP] Sent OTP ${otp.substring(0, 2)}** to +91${cleanPhone}`);
      
      if (!smsSent) {
        return {
          success: false,
          message: 'Failed to send SMS. Please try again.'
        };
      }

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
      const hashedInputOtp = this.hashOtp(otp);

      // Find valid OTP
      const [otpRecord] = await db.select()
        .from(otps)
        .where(
          and(
            eq(otps.phone, cleanPhone),
            eq(otps.otp, hashedInputOtp),
            eq(otps.userType, userType),
            eq(otps.isUsed, false),
            gt(otps.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!otpRecord) {
        console.log(`[OTP] Failed verification for ${otp.substring(0, 2)}** on +91${cleanPhone}`);
        return {
          success: false,
          message: 'Invalid or expired OTP'
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
      await db.delete(otps).where(gt(otps.expiresAt, new Date()));
    } catch (error) {
      console.error('Error cleaning up expired OTPs:', error);
    }
  }
}

export const otpService = new OtpService();