import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Download, RefreshCw, ExternalLink, Copy, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface USBDriverFixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetryConnection: () => Promise<void>;
  printerName?: string;
  lastError?: string;
  isConnecting?: boolean;
}

export default function USBDriverFixModal({
  open,
  onOpenChange,
  onRetryConnection,
  printerName = "Thermal Printer",
  lastError = "USB Access Denied",
  isConnecting = false,
}: USBDriverFixModalProps) {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const { toast } = useToast();

  const steps = [
    {
      number: 1,
      title: "Download Zadig",
      description: "Download the portable Zadig tool - no installation needed",
      action: "Download",
      details: "Visit zadig.akeo.ie and download the portable .exe file",
    },
    {
      number: 2,
      title: "Connect Your Printer",
      description: "Plug in your thermal printer via USB cable",
      action: "Connected",
      details: "Ensure the printer is powered on and shows in your computer",
    },
    {
      number: 3,
      title: "Run Zadig as Admin",
      description: "Right-click Zadig.exe and select 'Run as Administrator'",
      action: "Done",
      details: "This is required to modify drivers on Windows",
    },
    {
      number: 4,
      title: "Show All Devices",
      description: "In Zadig, click Options → Enable 'List All Devices' checkbox",
      action: "Done",
      details: "This helps you see your printer in the device list",
    },
    {
      number: 5,
      title: "Select Your Printer",
      description: "Find and select your printer from the dropdown menu",
      action: "Done",
      details: `Look for "${printerName}" or similar thermal printer name`,
    },
    {
      number: 6,
      title: "Choose WinUSB Driver",
      description: "Select 'WinUSB' from the driver dropdown in the middle of Zadig",
      action: "Selected",
      details: "This allows the app to communicate directly with your printer",
    },
    {
      number: 7,
      title: "Replace Driver",
      description: "Click the large yellow 'Replace Driver' button",
      action: "Done",
      details: "Wait for the installation to complete (usually 30 seconds - 1 minute)",
    },
    {
      number: 8,
      title: "Reconnect Printer",
      description: "Unplug and reconnect the USB cable to your printer",
      action: "Done",
      details: "This resets the connection with the new WinUSB driver",
    },
  ];

  const handleDownloadZadig = () => {
    window.open("https://zadig.akeo.ie/", "_blank");
    setCompletedSteps(prev => new Set([...prev, 1]));
  };

  const handleCopyZadigUrl = () => {
    navigator.clipboard.writeText("https://zadig.akeo.ie/");
    toast({
      title: "Copied",
      description: "Zadig download URL copied to clipboard",
    });
  };

  const handleRetryConnection = async () => {
    setRetrying(true);
    try {
      await onRetryConnection();
      // Success will be handled by parent component
    } catch (error) {
      setFailureCount(prev => prev + 1);
      toast({
        title: "Connection Failed",
        description: "The printer is still not accessible. Please verify the WinUSB driver was installed correctly.",
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
    }
  };

  const completionPercentage = Math.round((completedSteps.size / steps.length) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                USB Driver Fix Required
              </DialogTitle>
              <DialogDescription className="mt-1">
                Your printer "{printerName}" needs a driver update to work with this app
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error Message */}
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-red-900">Connection Error:</p>
                  <p className="text-red-800 text-xs mt-1">
                    {lastError || "Windows is blocking access to your USB printer"}
                  </p>
                  <p className="text-red-700 text-xs mt-2 font-medium">
                    ⚠️ Close all other browser tabs and apps that might be using the printer before proceeding.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Installation Progress</span>
              <span className="text-xs text-gray-500">{completionPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          {/* Important Warning */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-xs text-amber-900 font-medium">
                💡 <strong>Why this is needed:</strong> Windows by default blocks web apps from accessing USB devices. 
                Zadig installs the WinUSB driver which allows our app to communicate with your printer.
              </p>
            </CardContent>
          </Card>

          {/* Step-by-Step Guide */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm mb-3">Step-by-Step Installation Guide</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {steps.map((step, idx) => {
                const isCompleted = completedSteps.has(step.number);
                const isActive = activeStep === null ? idx === 0 : activeStep === step.number;

                return (
                  <button
                    key={step.number}
                    onClick={() => setActiveStep(activeStep === step.number ? null : step.number)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all",
                      isCompleted
                        ? "border-green-200 bg-green-50"
                        : isActive
                          ? "border-blue-300 bg-blue-50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border", 
                        isCompleted
                          ? "bg-green-500 border-green-500 text-white"
                          : isActive
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "bg-white border-gray-300 text-gray-600"
                      )}>
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm text-gray-900 flex-shrink-0">{step.title}</h4>
                          {isCompleted && (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 border-0">
                              Done
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{step.description}</p>

                        {/* Expanded details */}
                        {isActive && (
                          <div className="mt-2 p-2 bg-white border border-gray-200 rounded text-xs space-y-2">
                            <p className="text-gray-700">{step.details}</p>

                            {step.number === 1 && (
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadZadig();
                                  }}
                                >
                                  <Download className="h-3 w-3" />
                                  Download Zadig
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyZadigUrl();
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                  Copy URL
                                </Button>
                                <a
                                  href="https://zadig.akeo.ie/"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  zadig.akeo.ie
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            )}

                            {step.number === 2 && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCompletedSteps(prev => new Set([...prev, step.number]));
                                  }}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Mark as Done
                                </Button>
                              </div>
                            )}

                            {step.number >= 3 && step.number <= 8 && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCompletedSteps(prev => new Set([...prev, step.number]));
                                  }}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Mark as Done
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Failure Recovery Message */}
          {failureCount >= 2 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4">
                <p className="text-xs text-amber-900">
                  <strong>Still not working?</strong> Try restarting your computer and reconnecting the printer. 
                  This often resolves driver conflicts.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Connection Status */}
          {failureCount > 0 && (
            <Card className="border-gray-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">
                    Connection attempts: <span className="font-semibold">{failureCount}</span>
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              onClick={handleRetryConnection}
              disabled={retrying || isConnecting || completedSteps.size < 1}
              className="flex-1 gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {retrying || isConnecting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Reconnecting Printer...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Reconnect Printer Now
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>

          {/* Helper Info */}
          <div className="text-xs text-gray-500 space-y-1 p-2 bg-gray-50 rounded border border-gray-200">
            <p>✓ Mark each step as complete as you follow them</p>
            <p>✓ Once all steps are done, click "Reconnect Printer Now"</p>
            <p>✓ If connection still fails, check that the correct printer was selected in Zadig</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
