import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calculator as CalculatorIcon, X, Delete } from "lucide-react";

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onResult?: (result: number) => void;
}

const Calculator = ({ isOpen, onClose, onResult }: CalculatorProps) => {
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const inputDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === "0" ? digit : display + digit);
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
    } else if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const clear = () => {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  };

  const backspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay("0");
    }
  };

  const performOperation = (nextOperation: string) => {
    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operation) {
      const currentValue = previousValue || 0;
      let result: number;

      switch (operation) {
        case "+":
          result = currentValue + inputValue;
          break;
        case "-":
          result = currentValue - inputValue;
          break;
        case "×":
          result = currentValue * inputValue;
          break;
        case "÷":
          result = currentValue / inputValue;
          break;
        default:
          result = inputValue;
      }

      setDisplay(String(result));
      setPreviousValue(result);
    }

    setWaitingForOperand(true);
    setOperation(nextOperation);
  };

  const calculate = () => {
    if (operation === null || previousValue === null) return;

    const inputValue = parseFloat(display);
    let result: number;

    switch (operation) {
      case "+":
        result = previousValue + inputValue;
        break;
      case "-":
        result = previousValue - inputValue;
        break;
      case "×":
        result = previousValue * inputValue;
        break;
      case "÷":
        result = previousValue / inputValue;
        break;
      default:
        result = inputValue;
    }

    setDisplay(String(result));
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  };

  const useResult = () => {
    const result = parseFloat(display);
    if (onResult && !isNaN(result)) {
      onResult(result);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[320px] p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalculatorIcon className="h-5 w-5" />
            Calculator
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3">
          {/* Display */}
          <div className="bg-muted p-4 rounded-lg text-right">
            <div className="text-xs text-muted-foreground h-4">
              {previousValue !== null && operation && `${previousValue} ${operation}`}
            </div>
            <div className="text-3xl font-mono font-bold truncate">
              {parseFloat(display).toLocaleString()}
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" onClick={clear} className="text-destructive">C</Button>
            <Button variant="outline" onClick={backspace}><Delete className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={() => performOperation("÷")}>÷</Button>
            <Button variant="outline" onClick={() => performOperation("×")}>×</Button>

            <Button variant="secondary" onClick={() => inputDigit("7")}>7</Button>
            <Button variant="secondary" onClick={() => inputDigit("8")}>8</Button>
            <Button variant="secondary" onClick={() => inputDigit("9")}>9</Button>
            <Button variant="outline" onClick={() => performOperation("-")}>−</Button>

            <Button variant="secondary" onClick={() => inputDigit("4")}>4</Button>
            <Button variant="secondary" onClick={() => inputDigit("5")}>5</Button>
            <Button variant="secondary" onClick={() => inputDigit("6")}>6</Button>
            <Button variant="outline" onClick={() => performOperation("+")}>+</Button>

            <Button variant="secondary" onClick={() => inputDigit("1")}>1</Button>
            <Button variant="secondary" onClick={() => inputDigit("2")}>2</Button>
            <Button variant="secondary" onClick={() => inputDigit("3")}>3</Button>
            <Button className="row-span-2" onClick={calculate}>=</Button>

            <Button variant="secondary" onClick={() => inputDigit("0")} className="col-span-2">0</Button>
            <Button variant="secondary" onClick={inputDecimal}>.</Button>
          </div>

          {/* Use Result Button */}
          {onResult && (
            <Button onClick={useResult} className="w-full" variant="default">
              Use {parseFloat(display).toLocaleString()} in Amount
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Calculator;
