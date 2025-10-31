import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const { toast } = useToast();

  const sendOtpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/send-otp", { phone, userType: "buyer" });
      return await response.json();
    },
    onSuccess: () => {
      setStep("otp");
      toast({
        title: "OTP Sent",
        description: "Please check your phone for the verification code",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send OTP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/login", { phone, otp, userType: "buyer" });
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Invalidate user query to refetch user data
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        toast({
          title: "Login Successful",
          description: `Welcome back${data.user?.name ? ', ' + data.user.name : ''}!`,
        });
        onSuccess();
        handleClose();
      } else {
        toast({
          title: "Invalid OTP",
          description: "Please check your OTP and try again.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to verify OTP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setStep("phone");
    setPhone("");
    setOtp("");
    onClose();
  };

  const handleSendOtp = () => {
    if (phone.length === 10) {
      sendOtpMutation.mutate();
    }
  };

  const handleVerifyOtp = () => {
    if (otp.length === 6) {
      verifyOtpMutation.mutate();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Login to Your Account</DialogTitle>
        </DialogHeader>
        
        {step === "phone" ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <div className="flex mt-2">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                  +91
                </span>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 10))}
                  className="rounded-l-none"
                  data-testid="input-login-phone"
                />
              </div>
            </div>
            <Button
              onClick={handleSendOtp}
              disabled={phone.length !== 10 || sendOtpMutation.isPending}
              className="w-full"
              data-testid="button-login-send-otp"
            >
              {sendOtpMutation.isPending ? "Sending..." : "Send OTP"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="otp">Enter 6-Digit OTP</Label>
              <Input
                id="otp"
                type="text"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.slice(0, 6))}
                className="mt-2 text-center text-lg tracking-widest"
                maxLength={6}
                data-testid="input-login-otp"
              />
              <p className="text-sm text-gray-500 mt-2">
                OTP sent to +91{phone}
              </p>
            </div>
            <div className="space-y-2">
              <Button
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6 || verifyOtpMutation.isPending}
                className="w-full"
                data-testid="button-login-verify"
              >
                {verifyOtpMutation.isPending ? "Verifying..." : "Login"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("phone")}
                className="w-full"
                data-testid="button-change-number"
              >
                Change Number
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}