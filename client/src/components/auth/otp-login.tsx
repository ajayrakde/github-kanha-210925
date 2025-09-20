import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";

interface OtpLoginProps {
  userType: 'admin' | 'influencer' | 'buyer';
  title: string;
  onSuccess?: () => void;
}

export default function OtpLogin({ userType, title, onSuccess }: OtpLoginProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpId, setOtpId] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch OTP length setting
  const { data: otpLengthSetting } = useQuery({
    queryKey: ["/api/settings/otp_length"],
    queryFn: () => fetch("/api/settings/otp_length").then(res => res.json()),
  });
  
  const otpLength = otpLengthSetting?.value ? parseInt(otpLengthSetting.value) : 6;

  const sendOtpMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber, userType })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send OTP');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setOtpId(data.otpId);
      setStep('otp');
      toast({
        title: "OTP Sent",
        description: `Verification code sent to ${phone}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (otpCode: string) => {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: otpCode, userType })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to verify OTP');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Login Successful",
        description: `Welcome ${data.user.name || 'User'}!`,
      });
      
      // Invalidate auth queries based on user type
      const authKey = userType === 'admin' ? '/api/admin/me' : 
                     userType === 'influencer' ? '/api/influencer/me' : 
                     '/api/auth/user';
      
      queryClient.invalidateQueries({ queryKey: [authKey] });
      
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast({
        title: "Error",
        description: "Please enter your phone number",
        variant: "destructive",
      });
      return;
    }
    sendOtpMutation.mutate(phone);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      toast({
        title: "Error",
        description: "Please enter the verification code",
        variant: "destructive",
      });
      return;
    }
    verifyOtpMutation.mutate(otp);
  };

  const handleResendOtp = () => {
    sendOtpMutation.mutate(phone);
  };

  const handleBackToPhone = () => {
    setStep('phone');
    setOtp('');
    setOtpId('');
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <Input
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={sendOtpMutation.isPending}
                  data-testid={`input-${userType}-phone`}
                />
                <p className="text-sm text-gray-600 mt-2">
                  We'll send a verification code to this number
                </p>
              </div>
              <Button 
                type="submit" 
                className="w-full"
                disabled={sendOtpMutation.isPending}
                data-testid={`button-send-otp-${userType}`}
              >
                {sendOtpMutation.isPending ? "Sending..." : "Send Verification Code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  Enter the {otpLength}-digit code sent to {phone}
                </p>
                <Input
                  type="text"
                  placeholder={`Enter ${otpLength}-digit code`}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, otpLength))}
                  disabled={verifyOtpMutation.isPending}
                  data-testid={`input-${userType}-otp`}
                  maxLength={otpLength}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full"
                disabled={verifyOtpMutation.isPending}
                data-testid={`button-verify-otp-${userType}`}
              >
                {verifyOtpMutation.isPending ? "Verifying..." : "Verify Code"}
              </Button>
              
              <div className="flex flex-col space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendOtp}
                  disabled={sendOtpMutation.isPending}
                  data-testid={`button-resend-otp-${userType}`}
                >
                  {sendOtpMutation.isPending ? "Sending..." : "Resend Code"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToPhone}
                  data-testid={`button-back-phone-${userType}`}
                >
                  Change Phone Number
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}