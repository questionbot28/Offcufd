import { CheckCircle, XCircle, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  description: string;
}

interface ProgressStepperProps {
  steps: Step[];
  currentStep: string;
  status: 'pending' | 'extracting' | 'installing' | 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
}

export function ProgressStepper({ steps, currentStep, status, error }: ProgressStepperProps) {
  // Map to determine step completion status
  const stepStatusMap: Record<string, 'pending' | 'active' | 'completed' | 'error'> = {};
  
  let activeFound = false;
  let errorOccurred = status === 'error';
  
  steps.forEach((step) => {
    if (errorOccurred) {
      // If already past the current step when error occurred, mark as error
      if (activeFound) {
        stepStatusMap[step.id] = 'pending';
      }
      // If this is the current step where error occurred
      else if (step.id === currentStep) {
        stepStatusMap[step.id] = 'error';
        activeFound = true;
      }
      // If before the error step
      else {
        stepStatusMap[step.id] = 'completed';
      }
    } else {
      // Normal flow without error
      if (step.id === currentStep) {
        stepStatusMap[step.id] = 'active';
        activeFound = true;
      } else if (!activeFound) {
        stepStatusMap[step.id] = 'completed';
      } else {
        stepStatusMap[step.id] = 'pending';
      }
    }
  });
  
  // Determine icon for the step
  const getStepIcon = (stepId: string) => {
    const stepStatus = stepStatusMap[stepId];
    
    switch (stepStatus) {
      case 'completed':
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case 'active':
        if (status === 'running' && stepId === 'running') {
          return <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />;
        }
        return <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />;
      case 'error':
        return <XCircle className="h-8 w-8 text-red-500" />;
      default:
        return <div className="h-8 w-8 rounded-full border-2 border-gray-300" />;
    }
  };
  
  return (
    <div className="w-full py-4">
      <div className="space-y-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex">
            <div className="flex flex-col items-center mr-6">
              <div>{getStepIcon(step.id)}</div>
              {index < steps.length - 1 && (
                <div 
                  className={`w-0.5 h-full mt-2 ${
                    stepStatusMap[step.id] === 'completed' 
                      ? 'bg-green-500' 
                      : stepStatusMap[step.id] === 'error'
                        ? 'bg-red-500'
                        : 'bg-gray-300'
                  }`}
                />
              )}
            </div>
            <div className="flex-grow pt-1">
              <h3 className={`text-lg font-semibold ${
                stepStatusMap[step.id] === 'active' 
                  ? 'text-blue-600' 
                  : stepStatusMap[step.id] === 'completed'
                    ? 'text-green-600'
                    : stepStatusMap[step.id] === 'error'
                      ? 'text-red-600'
                      : 'text-gray-600'
              }`}>
                {step.title}
              </h3>
              <p className="text-sm text-gray-600 mt-1">{step.description}</p>
              
              {stepStatusMap[step.id] === 'error' && error && (
                <div className="mt-2 flex items-start space-x-2 text-red-600 bg-red-50 p-3 rounded-md">
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
