import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, ChevronLeft, BarChart3, Package, TrendingUp } from "lucide-react";
import businessDashboard from "@/assets/business-dashboard.jpg";
import inventoryManagement from "@/assets/inventory-management.jpg";
import salesTracking from "@/assets/sales-tracking.jpg";

interface OnboardingIntroProps {
  onComplete: () => void;
}

const OnboardingIntro = ({ onComplete }: OnboardingIntroProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "Track Your Business Dashboard",
      description: "Monitor your business performance with real-time analytics, financial insights, and comprehensive reporting all in one place.",
      image: businessDashboard,
      icon: <BarChart3 className="w-12 h-12 text-primary" />
    },
    {
      title: "Manage Your Inventory",
      description: "Keep track of your stock levels, add new products, and monitor inventory movements with our powerful inventory management system.",
      image: inventoryManagement,
      icon: <Package className="w-12 h-12 text-primary" />
    },
    {
      title: "Boost Your Sales",
      description: "Record sales transactions, track customer payments, and analyze sales trends to grow your business revenue efficiently.",
      image: salesTracking,
      icon: <TrendingUp className="w-12 h-12 text-primary" />
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipToEnd = () => {
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="p-0">
          <div className="grid md:grid-cols-2 gap-0 min-h-[600px]">
            {/* Image Section */}
            <div className="relative overflow-hidden">
              <img
                src={steps[currentStep].image}
                alt={steps[currentStep].title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>

            {/* Content Section */}
            <div className="p-8 flex flex-col justify-between">
              <div>
                {/* Progress Dots */}
                <div className="flex justify-center space-x-2 mb-8">
                  {steps.map((step, index) => (
                    <div
                      key={`dot-${index}`}
                      className={`w-3 h-3 rounded-full transition-all duration-300 ${
                        index === currentStep
                          ? "bg-primary scale-125"
                          : index < currentStep
                          ? "bg-primary/60"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>

                {/* Content */}
                <div className="text-center space-y-6">
                  <div className="flex justify-center">
                    {steps[currentStep].icon}
                  </div>
                  
                  <h1 className="text-3xl font-bold text-foreground">
                    {steps[currentStep].title}
                  </h1>
                  
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    {steps[currentStep].description}
                  </p>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex justify-between items-center mt-8">
                <Button
                  variant="ghost"
                  onClick={skipToEnd}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Skip
                </Button>

                <div className="flex space-x-2">
                  {currentStep > 0 && (
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      size="sm"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>
                  )}
                  
                  <Button
                    onClick={nextStep}
                    size="sm"
                    className="min-w-[100px]"
                  >
                    {currentStep === steps.length - 1 ? "Get Started" : "Next"}
                    {currentStep < steps.length - 1 && (
                      <ChevronRight className="w-4 h-4 ml-1" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingIntro;