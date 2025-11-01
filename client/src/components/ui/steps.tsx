import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  description?: string;
}

interface StepsProps {
  steps: Step[];
  currentStep: number;
  stepProgress?: number;
  status?: 'success' | 'failure' | null;
  className?: string;
}

export function Steps({ steps, currentStep, stepProgress = 0, status = null, className }: StepsProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;
          const isFinalStep = index === steps.length - 1;
          const showFinalStatus = isFinalStep && isCurrent && status !== null;

          // Connector line progress: show gradual 0→85% animation for current step
          const connectorProgress = isCurrent ? stepProgress : (isCompleted ? 100 : 0);

          return (
            <div key={index} className="flex flex-1 items-center">
              <div className="flex flex-col items-center flex-1">
                {/* Step circle */}
                <div
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300",
                    showFinalStatus && status === 'success' && "border-green-600 bg-green-600 text-white",
                    showFinalStatus && status === 'failure' && "border-red-600 bg-red-600 text-white",
                    !showFinalStatus && isCompleted && "border-green-600 bg-green-600 text-white",
                    !showFinalStatus && isCurrent && "border-blue-600 bg-blue-600 text-white shadow-lg scale-110",
                    !showFinalStatus && isUpcoming && "border-gray-300 bg-white text-gray-400"
                  )}
                  data-testid={`step-${index}`}
                >
                  {showFinalStatus ? (
                    status === 'success' ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <X className="h-5 w-5" />
                    )
                  ) : isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>

                {/* Step label */}
                <div className="text-center mt-2">
                  <p
                    className={cn(
                      "text-xs font-medium transition-colors duration-300",
                      (isCompleted || isCurrent) && "text-gray-900 dark:text-gray-100",
                      isUpcoming && "text-gray-400 dark:text-gray-500"
                    )}
                  >
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                  )}
                </div>
              </div>

              {/* Connector line - shows gradual progress animation */}
              {index < steps.length - 1 && (
                <div className="relative h-1 flex-1 -mt-8">
                  {/* Background line */}
                  <div className="absolute inset-0 bg-gray-300 rounded-full" />
                  {/* Animated progress line */}
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 transition-all duration-300 ease-out rounded-full",
                      isCompleted && "bg-green-600",
                      isCurrent && "bg-blue-600"
                    )}
                    style={{ width: `${connectorProgress}%` }}
                    data-testid={`connector-progress-${index}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
