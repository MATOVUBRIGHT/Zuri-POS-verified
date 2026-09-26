import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ArrowRight,
  Building2,
  Camera,
  Image as ImageIcon,
  Landmark,
  Loader2,
  Receipt,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";

/** A receiving account configured for this branch. */
export type BranchAccount = {
  id: string;
  name: string;
  provider_type: string;
  account_number: string | null;
};

const depositSchema = z.object({
  amount: z.number().positive("Enter an amount greater than zero"),
  bankName: z.string().trim().min(1, "Enter the bank name"),
  accountNumber: z.string().trim().min(1, "Enter the account number"),
});

interface BankCashFormProps {
  storeId: string;
  availableCash: number;
  /** Called after the deposit is committed so the caller can drop cash on hand. */
  onBanked: (amount: number) => void;
  onCancel?: () => void;
  accounts?: BranchAccount[];
  onReloadAccounts?: () => void;
}

const BankCashForm = ({
  storeId,
  availableCash,
  onBanked,
  onCancel,
  accounts,
  onReloadAccounts,
}: BankCashFormProps) => {
  const { toast } = useToast();

  const [destination, setDestination] = useState<"registered" | "manual">("registered");
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const activeAccounts = useMemo(
    () => (accounts ?? []).filter((a) => Boolean(a?.id)),
    [accounts],
  );

  // Object URLs leak until revoked, so release the previous preview whenever the
  // file changes or the form unmounts.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (accountId) {
      const match = activeAccounts.find((a) => a.id === accountId);
      if (match) {
        if (!accountNumber.trim()) setAccountNumber(match.account_number ?? "");
        if (!bankName.trim()) setBankName(match.name);
      }
      return;
    }
    if (destination === "manual" && !accountNumber.trim()) {
      // A manual destination still needs a number; the till is unaffected.
    }
  }, [accountId, activeAccounts, destination, accountNumber, bankName]);

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setReceiptFile(file);
    setReceiptPreview(url);
  };

  const clearReceipt = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parsedAmount = Number(amount) || 0;
  const selectedAccount = activeAccounts.find((a) => a.id === accountId) || null;
  const effectiveAccountNumber = destination === "registered" ? accountNumber : accountNumber;

  const remainingAfter = availableCash - parsedAmount;

  const resetForm = () => {
    setAmount("");
    setNotes("");
    setAccountNumber("");
    setBankName("");
    setAccountId("");
    clearReceipt();
    setStep("form");
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = depositSchema.safeParse({
      amount: parsedAmount,
      bankName,
      accountNumber: effectiveAccountNumber,
    });
    if (!parsed.success) {
      toast({
        title: "Check the details",
        description: parsed.error.errors.map((err) => err.message).join(", "),
        variant: "destructive",
      });
      return;
    }
    if (parsedAmount > availableCash) {
      toast({
        title: "Not enough cash",
        description: `You can bank at most ${fmtCurrency(availableCash)}`,
        variant: "destructive",
      });
      return;
    }
    if (destination === "registered" && !accountId) {
      toast({
        title: "Select an account",
        description: "Choose a branch account or switch to entering an account number",
        variant: "destructive",
      });
      return;
    }
    setStep("verify");
  };

  const handleBankNow = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let receiptPath: string | null = null;
      if (receiptFile) {
        const ext = (receiptFile.name.split(".").pop() || "jpg").toLowerCase();
        receiptPath = `${storeId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(receiptPath, receiptFile);
        if (upErr) {
          // The deposit itself is still valid without the slip, so keep going
          // rather than losing the cash movement.
          console.warn("Receipt upload failed", upErr);
          receiptPath = null;
        }
      }

      const { data, error } = await supabase.rpc("bank_cash_to_account", {
        p_store_id: storeId,
        p_amount: parsedAmount,
        p_bank_name: bankName.trim(),
        p_account_id: destination === "registered" && accountId ? accountId : null,
        p_account_name: destination === "manual" ? accountName.trim() || null : null,
        p_account_number: effectiveAccountNumber.trim() || null,
        p_notes: notes.trim() || null,
        p_receipt_url: receiptPath,
      });

      if (error) throw error;

      onBanked(parsedAmount);
      onReloadAccounts?.();

      toast({
        title: "Cash banked",
        description: `${fmtCurrency(parsedAmount)} sent to ${bankName.trim()}`,
      });
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Banking failed", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!storeId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Select a branch before banking cash.
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-success">
          <ShieldCheck className="h-4 w-4" />
          Verify the deposit
        </div>

        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="flex items-baseline justify-between border-b pb-3">
            <span className="text-sm text-muted-foreground">Amount to bank</span>
            <span className="text-2xl font-bold text-foreground">
              {fmtCurrency(parsedAmount)}
            </span>
          </div>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Bank</dt>
              <dd className="text-right font-medium">{bankName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Account number</dt>
              <dd className="text-right font-mono font-medium">
                {effectiveAccountNumber}
              </dd>
            </div>
            {destination === "registered" && selectedAccount ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Branch account</dt>
                <dd className="text-right font-medium">{selectedAccount.name}</dd>
              </div>
            ) : (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Account name</dt>
                <dd className="text-right font-medium">
                  {accountName.trim() || "Not given"}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="text-right font-medium">{notes.trim() || "Not given"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Receipt</dt>
              <dd className="text-right font-medium">
                {receiptFile ? receiptFile.name : "Not attached"}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex justify-between gap-4 border-t pt-3 text-sm">
            <span className="text-muted-foreground">Cash left in till</span>
            <span
              className={
                remainingAfter < 0
                  ? "font-semibold text-destructive"
                  : "font-semibold text-foreground"
              }
            >
              {fmtCurrency(Math.max(0, remainingAfter))}
            </span>
          </div>
        </div>

        {parsedAmount > availableCash && (
          <p className="text-sm text-destructive">
            This is more than the {fmtCurrency(availableCash)} currently in the till.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setStep("form")}
            disabled={isSubmitting}
          >
            Back
          </Button>
          <Button
            type="button"
            className="flex-1 gap-2"
            onClick={handleBankNow}
            disabled={isSubmitting || parsedAmount > availableCash}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Banking…
              </>
            ) : (
              <>
                <Landmark className="h-4 w-4" />
                Bank now
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" />
          Bank cash on hand
        </div>
        <Badge variant="outline" className="gap-1.5">
          Till: {fmtCurrency(availableCash)}
        </Badge>
      </div>

      {/* Destination: a configured branch account, or a typed account number. */}
      <div className="space-y-2">
        <Label className="text-xs">Send to</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={destination === "registered" ? "default" : "outline"}
            size="sm"
            onClick={() => setDestination("registered")}
          >
            Branch account
          </Button>
          <Button
            type="button"
            variant={destination === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setDestination("manual")}
          >
            Enter account no.
          </Button>
        </div>
      </div>

      {destination === "registered" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a branch account" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.length === 0 ? (
                <SelectItem value="none" disabled>
                  No branch accounts yet
                </SelectItem>
              ) : (
                activeAccounts.map((acct) => (
                  <SelectItem key={acct.id} value={acct.id}>
                    {acct.name}
                    {acct.account_number ? ` · ${acct.account_number}` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="bank-account-number">
              Account number
            </Label>
            <Input
              id="bank-account-number"
              inputMode="numeric"
              placeholder="e.g. 0100 123 456"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="bank-account-name">
              Account name (optional)
            </Label>
            <Input
              id="bank-account-name"
              placeholder="Account holder"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="bank-amount">
            Amount ({getCurrencySymbol()})
          </Label>
          <Input
            id="bank-amount"
            type="number"
            min="0"
            step="100"
            inputMode="decimal"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="bank-name">
            Bank name
          </Label>
          <Input
            id="bank-name"
            placeholder="e.g. Stanbic Bank"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
        </div>
      </div>

      {parsedAmount > 0 && (
        <p
          className={
            remainingAfter < 0
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {remainingAfter < 0
            ? `Over the till by ${fmtCurrency(Math.abs(remainingAfter))}`
            : `Till after this deposit: ${fmtCurrency(remainingAfter)}`}
        </p>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="bank-notes">
          Reason / notes
        </Label>
        <Textarea
          id="bank-notes"
          rows={2}
          placeholder="Why is this cash being banked? e.g. weekly deposit"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Receipt (optional)</Label>
        {/* capture lets a phone open the camera straight into this input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          onChange={handleReceiptChange}
          className="hidden"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {receiptFile ? "Change" : "Upload"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-3.5 w-3.5" />
            Take photo
          </Button>
          {receiptFile && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="max-w-[9rem] truncate">{receiptFile.name}</span>
              <button
                type="button"
                onClick={clearReceipt}
                aria-label="Remove receipt"
                className="hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        {receiptPreview && (
          <img
            src={receiptPreview}
            alt="Receipt preview"
            className="mt-1 max-h-24 rounded-lg border object-cover"
          />
        )}
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1 gap-2"
          disabled={availableCash <= 0}
        >
          <ArrowRight className="h-4 w-4" />
          Verify amount
        </Button>
      </div>

      {availableCash <= 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" />
          There is no cash on hand to bank.
        </p>
      )}
    </form>
  );
};

export default BankCashForm;
