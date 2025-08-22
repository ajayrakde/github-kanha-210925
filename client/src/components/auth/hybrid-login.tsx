import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface HybridLoginProps {
  userType: 'admin' | 'influencer' | 'buyer';
  title: string;
  onSuccess?: () => void;
}

export default function HybridLogin({ userType, title, onSuccess }: HybridLoginProps) {
  // OTP Login State
  const [otpStep, setOtpStep] = useState<'phone' | 'otp'>('phone');
  const [otpPhone, setOtpPhone] = useState('');
  const [otp, setOtp] = useState('');
  
  // Password Login State
  const [passwordPhone, setPasswordPhone] = useState('');
  const [password, setPassword] = useState('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Format phone number with +91 prefix
  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 10) {
      return digits;
    }
    return digits.slice(0, 10);
  };

  // Send OTP Mutation
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
    onSuccess: () => {
      setOtpStep('otp');
      toast({
        title: "OTP Sent",
        description: `4-digit verification code sent to +91${otpPhone}`,
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

  // Verify OTP Mutation
  const verifyOtpMutation = useMutation({
    mutationFn: async (otpCode: string) => {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: otpPhone, otp: otpCode, userType })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to verify OTP');
      }
      return response.json();
    },
    onSuccess: (data) => {
      handleLoginSuccess(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Password Login Mutation
  const passwordLoginMutation = useMutation({
    mutationFn: async ({ phone, pwd }: { phone: string; pwd: string }) => {
      const response = await fetch('/api/auth/login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: pwd, userType })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      handleLoginSuccess(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLoginSuccess = (data: any) => {
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
  };

  const handleOtpSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpPhone.trim()) {
      toast({
        title: "Error",
        description: "Please enter your phone number",
        variant: "destructive",
      });
      return;
    }
    sendOtpMutation.mutate(otpPhone);
  };

  const handleOtpVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 4) {
      toast({
        title: "Error",
        description: "Please enter the 4-digit verification code",
        variant: "destructive",
      });
      return;
    }
    verifyOtpMutation.mutate(otp);
  };

  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPhone.trim() || !password.trim()) {
      toast({
        title: "Error",
        description: "Please enter both phone number and password",
        variant: "destructive",
      });
      return;
    }
    passwordLoginMutation.mutate({ phone: passwordPhone, pwd: password });
  };

  const handleResendOtp = () => {
    sendOtpMutation.mutate(otpPhone);
  };

  const handleBackToOtpPhone = () => {
    setOtpStep('phone');
    setOtp('');
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="otp" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="otp">Login with OTP</TabsTrigger>
              <TabsTrigger value="password">Login with Password</TabsTrigger>
            </TabsList>
            
            <TabsContent value="otp" className="space-y-4">
              {otpStep === 'phone' ? (
                <form onSubmit={handleOtpSend} className="space-y-4">
                  <div>
                    <div className="flex">
                      <div className="flex items-center bg-gray-100 px-3 border border-r-0 rounded-l-md">
                        <span className="text-sm font-medium">+91</span>
                      </div>
                      <Input
                        type="tel"
                        placeholder="Enter phone number"
                        value={otpPhone}
                        onChange={(e) => setOtpPhone(formatPhoneNumber(e.target.value))}
                        disabled={sendOtpMutation.isPending}
                        className="rounded-l-none"
                        data-testid={`input-${userType}-otp-phone`}
                        maxLength={10}
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      We'll send a 4-digit verification code to your number
                    </p>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={sendOtpMutation.isPending}
                    data-testid={`button-send-otp-${userType}`}
                  >
                    {sendOtpMutation.isPending ? "Sending..." : "Send OTP"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleOtpVerify} className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-2">
                      Enter the 4-digit code sent to +91{otpPhone}
                    </p>
                    <Input
                      type="text"
                      placeholder="Enter 4-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      disabled={verifyOtpMutation.isPending}
                      data-testid={`input-${userType}-otp-code`}
                      maxLength={4}
                      className="text-center text-xl tracking-widest"
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
                      onClick={handleBackToOtpPhone}
                      data-testid={`button-back-phone-${userType}`}
                    >
                      Change Phone Number
                    </Button>
                  </div>
                </form>
              )}
            </TabsContent>
            
            <TabsContent value="password" className="space-y-4">
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <div className="flex">
                    <div className="flex items-center bg-gray-100 px-3 border border-r-0 rounded-l-md">
                      <span className="text-sm font-medium">+91</span>
                    </div>
                    <Input
                      type="tel"
                      placeholder="Enter phone number"
                      value={passwordPhone}
                      onChange={(e) => setPasswordPhone(formatPhoneNumber(e.target.value))}
                      disabled={passwordLoginMutation.isPending}
                      className="rounded-l-none"
                      data-testid={`input-${userType}-password-phone`}
                      maxLength={10}
                    />
                  </div>
                </div>
                <div>
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={passwordLoginMutation.isPending}
                    data-testid={`input-${userType}-password`}
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={passwordLoginMutation.isPending}
                  data-testid={`button-password-login-${userType}`}
                >
                  {passwordLoginMutation.isPending ? "Logging in..." : "Login"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}