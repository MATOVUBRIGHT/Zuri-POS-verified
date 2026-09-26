import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Plus, Minus, Send, History, ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown, Edit2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CashTransaction } from "@/types";

interface CashManagementProps {
  availableCash: number;
  onUpdateCash: (amount: number) => void;
  onClose: () => void;
}

const CashManagement = ({ availableCash, onUpdateCash, onClose }: CashManagementProps) => {
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState("");
  const [isAddition, setIsAddition] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingOpening, setEditingOpening] = useState(false);
  const [editingClosing, setEditingClosing] = useState(false);
  const [manualOpening, setManualOpening] = useState<string>("");
  const [manualClosing, setManualClosing] = useState<string>("");
  const { toast } = useToast();

  const accountOptions = [
    { value: "mtn", label: "MTN Mobile Money" },
    { value: "airtel", label: "Airtel Money" },
    { value: "bank", label: "Bank Account" },
    { value: "wave", label: "Wave Mobile Money" },
    { value: "mpesa", label: "M-Pesa" },
    { value: "cash", label: "Cash" },
  ];

  // Calculate opening and closing balance for today
  const { calculatedOpening, calculatedClosing, todayIn, todayOut } = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    // Get all transactions before today for opening balance
    const beforeToday = transactions.filter(tx => {
      const txDate = new Date(tx.created_at).toISOString().split('T')[0];
      return txDate < today;
    });
    
    // Get today's transactions
    const todayTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.created_at).toISOString().split('T')[0];
      return txDate === today;
    });
    
    // Calculate opening balance (sum of all transactions before today)
    const opening = beforeToday.reduce((sum, tx) => {
      return sum + (tx.type === 'in' ? Number(tx.amount) : -Number(tx.amount));
    }, 0);
    
    // Calculate today's inflows and outflows
    const inflows = todayTransactions
      .filter(tx => tx.type === 'in')
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
    
    const outflows = todayTransactions
      .filter(tx => tx.type === 'out')
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
    
    // Closing balance = opening + today's net
    const closing = opening + inflows - outflows;
    
    return {
      calculatedOpening: opening,
      calculatedClosing: closing,
      todayIn: inflows,
      todayOut: outflows
    };
  }, [transactions]);

  // Load saved manual balances
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const savedOpening = localStorage.getItem(`opening_balance_${today}`);
    const savedClosing = localStorage.getItem(`closing_balance_${today}`);
    if (savedOpening) setManualOpening(savedOpening);
    if (savedClosing) setManualClosing(savedClosing);
  }, []);

  const openingBalance = manualOpening ? parseFloat(manualOpening) : calculatedOpening;
  const closingBalance = manualClosing ? parseFloat(manualClosing) : calculatedClosing;

  const saveOpeningBalance = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(`opening_balance_${today}`, manualOpening);
    setEditingOpening(false);
    toast({ title: "Opening Balance Saved", description: `Set to UGX ${parseFloat(manualOpening).toLocaleString()}` });
  };

  const saveClosingBalance = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(`closing_balance_${today}`, manualClosing);
    setEditingClosing(false);
    toast({ title: "Closing Balance Saved", description: `Set to UGX ${parseFloat(manualClosing).toLocaleString()}` });
  };

  // Fetch transaction history
  useEffect(() => {
    const fetchTransactions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: stores } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!stores?.[0]) return;

      const { data, error } = await supabase
        .from("cash_transactions")
        .select("*")
        .eq("store_id", stores[0].id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && data) {
        setTransactions(data as CashTransaction[]);
      }
    };

    fetchTransactions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Math.round(parseFloat(amount) * 100) / 100; // Round to 2 decimal places
    
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive"
      });
      return;
    }

    if (!isAddition && numAmount > availableCash) {
      toast({
        title: "Error",
        description: "Cannot withdraw more than available cash",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: stores } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!stores?.[0]) throw new Error("No store found");

      // Save transaction to database
      const { error } = await supabase
        .from("cash_transactions")
        .insert({
          user_id: user.id,
          store_id: stores[0].id,
          amount: numAmount,
          type: isAddition ? 'in' : 'out',
          description: description || (isAddition ? 'Cash added' : 'Cash withdrawn'),
          account_type: selectedAccount || 'cash'
        });

      if (error) throw error;

      const finalAmount = isAddition ? numAmount : -numAmount;
      onUpdateCash(finalAmount);
      
      // Add to local transactions
      const newTransaction: CashTransaction = {
        id: Date.now().toString(),
        amount: numAmount,
        type: isAddition ? 'in' : 'out',
        description: description || (isAddition ? 'Cash added' : 'Cash withdrawn'),
        account_type: selectedAccount || 'cash',
        created_at: new Date().toISOString()
      };
      setTransactions(prev => [newTransaction, ...prev]);
      
      toast({
        title: "Success",
        description: `UGX ${numAmount.toLocaleString()} ${isAddition ? 'added to' : 'removed from'} cash`,
      });

      setAmount("");
      setDescription("");
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message || "Failed to process transaction",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="w-full max-h-[90vh] overflow-y-auto border-none shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xl font-bold">
            <DollarSign className="h-6 w-6 text-success" />
            Cash Management
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="gap-2"
            >
              <History className="h-4 w-4" />
              {showHistory ? 'Add Cash' : 'History'}
            </Button>
            
          </div>
        </CardTitle>
        <div className="text-3xl font-bold text-success mt-2">
          UGX {availableCash.toLocaleString()}
        </div>
      </CardHeader>
        <CardContent>
          {/* Opening/Closing Balance Summary */}
          <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-muted/50 rounded-lg border">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  Opening Balance
                </div>
                {!editingOpening ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => {
                      setManualOpening(String(openingBalance));
                      setEditingOpening(true);
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-success" onClick={saveOpeningBalance}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => setEditingOpening(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              {editingOpening ? (
                <Input
                  type="number"
                  value={manualOpening}
                  onChange={(e) => setManualOpening(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
              ) : (
                <p className="text-lg font-bold text-foreground">
                  UGX {openingBalance.toLocaleString()}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="h-3 w-3" />
                  Closing Balance
                </div>
                {!editingClosing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => {
                      setManualClosing(String(closingBalance));
                      setEditingClosing(true);
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-success" onClick={saveClosingBalance}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => setEditingClosing(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              {editingClosing ? (
                <Input
                  type="number"
                  value={manualClosing}
                  onChange={(e) => setManualClosing(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
              ) : (
                <p className="text-lg font-bold text-primary">
                  UGX {closingBalance.toLocaleString()}
                </p>
              )}
            </div>
            <div className="text-xs">
              <span className="text-success">+UGX {todayIn.toLocaleString()}</span>
              <span className="text-muted-foreground"> today</span>
            </div>
            <div className="text-xs">
              <span className="text-destructive">-UGX {todayOut.toLocaleString()}</span>
              <span className="text-muted-foreground"> today</span>
            </div>
          </div>

          {showHistory ? (
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground">Transaction History</h4>
              {transactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No transactions yet</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        tx.type === 'in' ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {tx.type === 'in' ? (
                          <ArrowDownCircle className="h-5 w-5 text-success" />
                        ) : (
                          <ArrowUpCircle className="h-5 w-5 text-destructive" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(tx.created_at)} • {tx.account_type}
                          </p>
                        </div>
                      </div>
                      <span className={`font-bold ${tx.type === 'in' ? 'text-success' : 'text-destructive'}`}>
                        {tx.type === 'in' ? '+' : '-'}UGX {tx.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" className="w-full mt-4" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2 mb-4">
                <Button
                  type="button"
                  variant={isAddition ? "default" : "outline"}
                  onClick={() => setIsAddition(true)}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Cash
                </Button>
                <Button
                  type="button"
                  variant={!isAddition ? "destructive" : "outline"}
                  onClick={() => setIsAddition(false)}
                  className="flex-1"
                >
                  <Minus className="h-4 w-4 mr-2" />
                  Remove Cash
                </Button>
              </div>
              
              <div>
                <Label htmlFor="amount">Amount (UGX)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Reason for cash adjustment"
                />
              </div>

              <div className="border-t pt-4 space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Payment Method
                </h4>
                
                <div>
                  <Label htmlFor="account">Select Account</Label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose account type" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedAccount && selectedAccount !== 'cash' && (
                  <div>
                    <Label htmlFor="phone">Phone Number / Account</Label>
                    <Input
                      id="phone"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Enter phone or account number"
                    />
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1" disabled={isLoading}>
                  {isLoading ? 'Processing...' : `${isAddition ? 'Add' : 'Remove'} UGX ${amount || '0'}`}
                </Button>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
  );
};

export default CashManagement;
