import { otps, admins, influencers, users, type Otp, type InsertOtp } from "@shared/schema";
import { db } from "./db";
import { eq, and, gt } from "drizzle-orm";

export class OtpService {
  // Generate 6-digit OTP
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Send OTP (mock implementation - in production, integrate with SMS service)
  private async sendSms(phone: string, otp: string): Promise<boolean> {
    console.log(`[SMS] Sending OTP ${otp} to ${phone}`);
    // In production, integrate with services like Twilio, TextLocal, etc.
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
      // Clean phone number (remove spaces, dashes, etc.)
      const cleanPhone = phone.replace(/[^\d]/g, '');
      
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
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Save OTP to database
      const [otpRecord] = await db.insert(otps).values({
        phone: cleanPhone,
        otp,
        userType,
        expiresAt,
        isUsed: false
      }).returning();

      // Send SMS
      const smsSent = await this.sendSms(cleanPhone, otp);
      
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
      const cleanPhone = phone.replace(/[^\d]/g, '');

      // Find valid OTP
      const [otpRecord] = await db.select()
        .from(otps)
        .where(
          and(
            eq(otps.phone, cleanPhone),
            eq(otps.otp, otp),
            eq(otps.userType, userType),
            eq(otps.isUsed, false),
            gt(otps.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!otpRecord) {
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