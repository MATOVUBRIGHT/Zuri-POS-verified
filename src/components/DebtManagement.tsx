import { useState, useEffect } from "react";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, History, DollarSign, Package } from "lucide-react";
import { Loan, LoanPayment } from "@/types";
import { LoadingSpinner, PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";

interface DebtManagementProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateCash: (amount: number) => void;
  availableCash?: number;
}

const DebtManagement = ({ isOpen, onClose, onUpdateCash, availableCash = 0 }: DebtManagementProps) => {
  const { toast } = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<LoanPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useMinimumLoading(loading, 350);
  useEffect(() => {
    if (isOpen) {
      loadLoans();
    }
  }, [isOpen]);

  const loadLoans = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('stock_loans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLoans((data || []) as unknown as Loan[]);
    } catch (error) {
      console.error('Error loading loans:', error);
      toast({
        title: "Error",
        description: "Failed to load debt information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentHistory = async (loanId: string) => {
    try {
      const { data, error } = await supabase
        .from('loan_payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPaymentHistory(data || []);
      setShowPaymentHistory(true);
    } catch (error) {
      console.error('Error loading payment history:', error);
      toast({
        title: "Error",
        description: "Failed to load payment history",
        variant: "destructive"
      });
    }
  };

  const handlePartialPayment = async () => {
    if (!selectedLoan || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (amount <= 0 || amount > selectedLoan.balance) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount not exceeding the balance",
        variant: "destructive"
      });
      return;
    }

    // Check if we have enough cash
    if (amount > availableCash) {
      toast({
        title: "Insufficient Cash",
        description: `Available cash: ${fmtCurrency(availableCash)}. Payment: ${fmtCurrency(amount)}`,
        variant: "destructive"
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newBalance = selectedLoan.balance - amount;
      const newAmountPaid = selectedLoan.amount_paid + amount;
      const newStatus = newBalance === 0 ? 'paid' : 'unpaid';

      // Update loan
      const { error: loanError } = await supabase
        .from('stock_loans')
        .update({
          amount_paid: newAmountPaid,
          balance: newBalance,
          status: newStatus
        })
        .eq('id', selectedLoan.id);

      if (loanError) throw loanError;

      // Record payment
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .insert({
          loan_id: selectedLoan.id,
          user_id: user.id,
          amount_paid: amount
        });

      if (paymentError) throw paymentError;

      // Get store ID for cash transaction
      const { data: stores } = await supabase
        .from('stores')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      
      const storeId = stores?.[0]?.id;
      
        if (storeId) {
          // Record cash transaction
          try {
            const { error: txError } = await supabase.from('cash_transactions').insert({
              user_id: user.id,
              store_id: storeId,
              amount: Number(amount) || 0,
              type: 'out',
              description: `Debt payment: ${selectedLoan.product_name}`,
              account_type: 'cash'
            });
            if (txError) console.warn("Failed to record cash transaction:", txError);
          } catch (txError) {
            console.warn("Error recording cash transaction:", txError);
          }
        }

      // Deduct from available cash
      onUpdateCash(-amount);

      toast({
        title: "Payment Successful",
        description: `${fmtCurrency(amount)} paid. Balance: ${fmtCurrency(newBalance)}`,
      });

      setPaymentAmount("");
      setSelectedLoan(null);
      loadLoans();
    } catch (error) {
      console.error('Error processing payment:', error);
      toast({
        title: "Error",
        description: "Failed to process payment",
        variant: "destructive"
      });
    }
  };

  const handleMarkAsPaid = async (loan: Loan) => {
    // Check if we have enough cash
    if (loan.balance > availableCash) {
      toast({
        title: "Insufficient Cash",
        description: `Available cash: ${fmtCurrency(availableCash)}. Debt balance: ${fmtCurrency(loan.balance)}`,
        variant: "destructive"
      });
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update loan to paid
      const { error: loanError } = await supabase
        .from('stock_loans')
        .update({
          amount_paid: loan.total_amount,
          balance: 0,
          status: 'paid'
        })
        .eq('id', loan.id);

      if (loanError) throw loanError;

      // Record full payment
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .insert({
          loan_id: loan.id,
          user_id: user.id,
          amount_paid: loan.balance
        });

      if (paymentError) throw paymentError;

      // Get store ID for cash transaction
      const { data: stores } = await supabase
        .from('stores')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      
      const storeId = stores?.[0]?.id;
      
        if (storeId) {
          // Record cash transaction
          try {
            const { error: txError } = await supabase.from('cash_transactions').insert({
              user_id: user.id,
              store_id: storeId,
              amount: Number(loan.balance) || 0,
              type: 'out',
              description: `Debt clearance: ${loan.product_name}`,
              account_type: 'cash'
            });
            if (txError) console.warn("Failed to record cash transaction:", txError);
          } catch (txError) {
            console.warn("Error recording cash transaction:", txError);
          }
        }

      // Deduct from available cash
      onUpdateCash(-loan.balance);

      toast({
        title: "Marked as Paid",
        description: `${fmtCurrency(loan.balance)} deducted from cash`,
      });

      loadLoans();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast({
        title: "Error",
        description: "Failed to mark as paid",
        variant: "destructive"
      });
    }
  };

  const totalDebt = loans.reduce((sum, loan) => sum + loan.balance, 0);
  const totalPaid = loans.reduce((sum, loan) => sum + loan.amount_paid, 0);
  const unpaidLoans = loans.filter(loan => loan.status === 'unpaid');

  if (showLoader) {
    return <PageLoader text="Loading debts..." />;
  }
  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Debt Management - Stock on Credit
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <LoadingSpinner size="lg" text="Loading debts..." />
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-destructive/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Total Outstanding Debt</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">
                      {fmtCurrency(totalDebt)}
                    </div>
                    <p className="text-xs text-muted-foreground">{unpaidLoans.length} unpaid items</p>
                  </CardContent>
                </Card>

                <Card className="bg-success/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Total Paid</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-success">
                      {fmtCurrency(totalPaid)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-primary/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Total Loans</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {loans.length}
                    </div>
                    <p className="text-xs text-muted-foreground">{loans.filter(l => l.status === 'paid').length} fully paid</p>
                  </CardContent>
                </Card>
              </div>

              {/* Loans List */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Stock Items on Credit</h3>
                {loans.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No stock purchased on credit</p>
                    </CardContent>
                  </Card>
                ) : (
                  loans.map((loan) => (
                    <Card key={loan.id} className={loan.status === 'paid' ? 'opacity-60' : ''}>
                      <CardContent className="pt-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex-1">
                            <h4 className="font-semibold text-lg">{loan.product_name}</h4>
                            <div className="text-sm text-muted-foreground space-y-1 mt-2">
                              <p>Quantity: {loan.quantity} units • Cost per unit: {fmtCurrency(loan.cost_per_unit)}</p>
                              <p>Supplier: {loan.supplier} • Date: {new Date(loan.date_of_purchase).toLocaleDateString()}</p>
                            </div>
                          </div>
                          
                          <div className="text-right space-y-2">
                            <div>
                              <p className="text-sm text-muted-foreground">Total Amount</p>
                              <p className="text-xl font-bold">{fmtCurrency(loan.total_amount)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Paid</p>
                              <p className="text-lg font-semibold text-success">{fmtCurrency(loan.amount_paid)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Balance</p>
                              <p className="text-lg font-bold text-destructive">{fmtCurrency(loan.balance)}</p>
                            </div>
                            
                            {loan.status === 'unpaid' && (
                              <div className="flex gap-2 mt-4">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setSelectedLoan(loan)}
                                >
                                  Pay Amount
                                </Button>
                                <Button 
                                  variant="default" 
                                  size="sm"
                                  onClick={() => handleMarkAsPaid(loan)}
                                >
                                  Mark as Paid
                                </Button>
                              </div>
                            )}
                            
                            {loan.status === 'paid' && (
                              <div className="inline-flex items-center px-3 py-1 rounded-full bg-success/20 text-success text-sm font-medium">
                                ✓ Fully Paid
                              </div>
                            )}
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full mt-2"
                              onClick={() => loadPaymentHistory(loan.id)}
                            >
                              <History className="h-4 w-4 mr-2" />
                              View Payment History
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Partial Payment Dialog */}
      <Dialog open={!!selectedLoan} onOpenChange={() => setSelectedLoan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make Partial Payment</DialogTitle>
          </DialogHeader>
          {selectedLoan && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="font-medium">{selectedLoan.product_name}</p>
                <p className="text-sm text-muted-foreground">
                  Balance: {fmtCurrency(selectedLoan.balance)}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Amount ({getCurrencySymbol()})</label>
                <Input
                  type="number"
                  placeholder="Enter amount to pay"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  max={selectedLoan.balance}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedLoan(null)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handlePartialPayment} className="flex-1">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Pay {fmtCurrency(paymentAmount ? parseFloat(paymentAmount) : 0)}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={showPaymentHistory} onOpenChange={() => setShowPaymentHistory(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Payment History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {paymentHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No payment history</p>
            ) : (
              paymentHistory.map((payment) => (
                <Card key={payment.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-success">{fmtCurrency(payment.amount_paid)}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(payment.payment_date).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Payment recorded
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DebtManagement;
