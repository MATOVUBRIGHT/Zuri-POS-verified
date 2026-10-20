import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { playSuccess } from "@/lib/sounds";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

const BarcodeScanner = ({ isOpen, onClose, onScan }: BarcodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const startInFlightRef = useRef(false);
  const lifecycleRef = useRef(0);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const { toast } = useToast();

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    lifecycleRef.current += 1;
    scannerRef.current = null;
    startInFlightRef.current = false;
    if (!scanner || !isScanningRef.current) {
      isScanningRef.current = false;
      setIsScanning(false);
      return;
    }
    try {
      await scanner.stop();
    } catch (error) {
      // html5-qrcode can report an already-stopped scanner during dialog
      // teardown. It is safe to ignore that race.
      if (!String(error).toLowerCase().includes("not running")) {
        console.warn("Barcode scanner cleanup failed", error);
      }
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
    }
  }, []);

  const beginCamera = useCallback(async () => {
    if (startInFlightRef.current || isScanningRef.current || !isOpen) return;
    startInFlightRef.current = true;
    const lifecycle = lifecycleRef.current + 1;
    lifecycleRef.current = lifecycle;
    try {
      // html5-qrcode owns the camera stream. Requesting a temporary stream
      // first creates two camera lifecycles and was the source of freezes and
      // repeated cleanup/sound callbacks on phones.
      const html5QrCode = new Html5Qrcode("barcode-reader", {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
      });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 180 },
          aspectRatio: 1.5,
        },
        (decodedText) => {
          const cleanedBarcode = decodedText.trim();
          if (!cleanedBarcode) return;
          const now = Date.now();
          const previous = lastScanRef.current;
          // A barcode remains visible for many video frames. Accept a second
          // scan after a short, intentional pause so scanning the same item
          // twice increments its cart quantity without frame-loop duplicates.
          if (previous && previous.value.toLowerCase() === cleanedBarcode.toLowerCase() && now - previous.at < 900) return;
          lastScanRef.current = { value: cleanedBarcode, at: now };
          playSuccess();
          onScan(cleanedBarcode);
        },
        () => {
          // Ignore errors during scanning (no QR code found yet)
        }
      );
      if (!isOpen || lifecycle !== lifecycleRef.current) {
        await html5QrCode.stop().catch(() => undefined);
        scannerRef.current = null;
        return;
      }
      isScanningRef.current = true;
      setIsScanning(true);
    } catch (err: unknown) {
      console.error("Error starting scanner:", err);
      let errorMessage = "Failed to access camera.";
      
      const error = err as Error;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = "Camera permission denied. Please allow camera access in your browser settings and try again.";
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = "No camera found on this device.";
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = "Camera is in use by another application.";
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = "Camera doesn't support the required settings.";
      } else if (error.name === 'SecurityError') {
        errorMessage = "Camera access blocked. Please use HTTPS or localhost.";
      }
      
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: errorMessage,
      });
    } finally {
      startInFlightRef.current = false;
    }
  }, [isOpen, onScan, toast]);

  useEffect(() => {
    if (isOpen) void beginCamera();
    else void stopScanner();
    return () => { void stopScanner(); };
  }, [beginCamera, isOpen, stopScanner]);

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scan Barcode or SKU
          </DialogTitle>
          <DialogDescription>
            Use your phone camera to scan a barcode or SKU. Scan the same item again to add another quantity.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div 
            id="barcode-reader" 
            className="w-full min-h-[300px] bg-muted rounded-lg overflow-hidden"
          />
          <p className="text-sm text-muted-foreground text-center">
            Point the camera at a barcode or SKU label
          </p>
          <Button variant="outline" onClick={handleClose} className="w-full gap-2">
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScanner;
