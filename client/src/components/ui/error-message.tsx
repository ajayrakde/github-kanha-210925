import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ErrorMessageProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  variant?: "inline" | "card" | "full";
}

export function ErrorMessage({ 
  title = "Something went wrong",
  message = "An error occurred while loading this content. Please try again.",
  onRetry,
  className,
  variant = "inline"
}: ErrorMessageProps) {
  const ErrorContent = () => (
    <div className={cn("text-center", className)}>
      <div className="flex items-center justify-center gap-2 mb-2">
        <AlertCircle className="h-5 w-5 text-red-500" />
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      {onRetry && (
        <Button 
          onClick={onRetry}
          variant="outline" 
          size="sm"
          className="flex items-center gap-2"
          data-testid="button-retry"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );

  if (variant === "card") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <ErrorContent />
        </CardContent>
      </Card>
    );
  }

  if (variant === "full") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <ErrorContent />
      </div>
    );
  }

  return <ErrorContent />;
}

// Specific error components for common scenarios
export function ApiErrorMessage({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const is401 = error.message.includes('401');
  const is404 = error.message.includes('404');
  const is500 = error.message.includes('500');

  let title = "Something went wrong";
  let message = "Please try again later.";

  if (is401) {
    title = "Access Denied";
    message = "You don't have permission to access this content.";
  } else if (is404) {
    title = "Not Found";
    message = "The requested content could not be found.";
  } else if (is500) {
    title = "Server Error";
    message = "There's a problem with our servers. Please try again later.";
  }

  return (
    <ErrorMessage 
      title={title}
      message={message}
      onRetry={onRetry}
      variant="card"
    />
  );
}