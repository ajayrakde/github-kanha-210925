import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useInfluencerAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function InfluencerLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, loginLoading, loginError } = useInfluencerAuth();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({
        title: "Error",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }

    login({ username, password }, {
      onError: () => {
        toast({
          title: "Login Failed",
          description: "Invalid username or password",
          variant: "destructive",
        });
      },
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Logged in successfully",
        });
      },
    });
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Influencer Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loginLoading}
                data-testid="input-influencer-username"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loginLoading}
                data-testid="input-influencer-password"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={loginLoading}
              data-testid="button-influencer-login"
            >
              {loginLoading ? "Logging in..." : "Login"}
            </Button>
            {loginError && (
              <p className="text-sm text-red-600 text-center">
                Login failed. Please try again.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}