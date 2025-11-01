import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  description?: string;
}

interface StepsProps {
  steps: Step[];
  currentStep: number;
  stepProgress?: number;
  className?: string;
}

export function Steps({ steps, currentStep, stepProgress = 0, className }: StepsProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          // Mini bar: just complete (100%) when active/completed, 0% otherwise
          const miniBarProgress = (isCompleted || isCurrent) ? 100 : 0;

          // Connector line progress: show gradual 0→85% animation for current step
          const connectorProgress = isCurrent ? stepProgress : (isCompleted ? 100 : 0);

          return (
            <div key={index} className="flex flex-1 items-center">
              <div className="flex flex-col items-center flex-1">
                {/* Step circle */}
                <div
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300",
                    isCompleted && "border-green-600 bg-green-600 text-white",
                    isCurrent && "border-blue-600 bg-blue-600 text-white shadow-lg scale-110",
                    isUpcoming && "border-gray-300 bg-white text-gray-400"
                  )}
                  data-testid={`step-${index}`}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>

                {/* Mini progress bar below step circle - just turns green when active */}
                <div className="w-full mt-1.5 mb-1">
                  <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-300 ease-out",
                        isCompleted && "bg-green-600",
                        isCurrent && "bg-blue-600",
                        isUpcoming && "bg-gray-300"
                      )}
                      style={{ width: `${miniBarProgress}%` }}
                      data-testid={`step-progress-${index}`}
                    />
                  </div>
                </div>

                {/* Step label */}
                <div className="text-center">
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
                <div className="relative h-0.5 flex-1 -mt-8">
                  {/* Background line */}
                  <div className="absolute inset-0 bg-gray-300" />
                  {/* Animated progress line */}
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 transition-all duration-300 ease-out",
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
