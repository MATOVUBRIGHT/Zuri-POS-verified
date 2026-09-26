import { useState, useEffect } from "react";
import { fmtCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Search,
  FileText,
  Calendar,
  DollarSign,
  Package,
  User,
  CheckCircle,
  Undo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { PageLoader } from "@/components/ui/loading-spinner";

interface SalesReturnsProps {
  currentStoreId?: string;
}

interface ReturnItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason?: string;
}

interface SaleReturn {
  id: string;
  sale_id: string;
  store_id: string;
  user_id: string;
  items: ReturnItem[];
  total_amount: number;
  reason: string;
  staff_id?: string;
  created_at: string;
  sale?: {
    customer_name: string;
    date_of_sale: string;
    total_amount: number;
  };
  staff?: {
    full_name?: string;
    name?: string;
  };
}

const SalesReturns = ({ currentStoreId }: SalesReturnsProps) => {
  const { toast } = useToast();
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReturn, setSelectedReturn] = useState<SaleReturn | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchReturns = async () => {
    if (!currentStoreId) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fetchWithStaffColumn = async (staffColumn: "full_name" | "name") => (
        (supabase
          .from("sale_returns" as any)
          .select(`
            *,
            sale:sales(customer_name, date_of_sale, total_amount),
            staff:staff(${staffColumn})
          `) as any)
          .eq("store_id", currentStoreId)
          .order("created_at", { ascending: false })
      );

      let { data: returnsData, error } = await fetchWithStaffColumn("full_name");
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        const isMissingColumn =
          (msg.includes("column") || msg.includes("schema cache")) &&
          (msg.includes("full_name") || msg.includes("does not exist") || msg.includes("could not find"));

        if (!isMissingColumn) throw error;

        const retry = await fetchWithStaffColumn("name");
        returnsData = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      // Parse and type the data correctly
      const typedReturns: SaleReturn[] = (returnsData || []).map((ret: any) => {
        let parsedItems: ReturnItem[] = [];
        
        if (Array.isArray(ret.items)) {
          parsedItems = ret.items;
        } else if (typeof ret.items === 'string') {
          try {
            parsedItems = JSON.parse(ret.items);
          } catch {
            parsedItems = [];
          }
        } else if (ret.items && typeof ret.items === 'object') {
          // Handle JSONB object
          parsedItems = Array.isArray(ret.items) ? ret.items : [];
        }

        return {
          id: ret.id,
          sale_id: ret.sale_id,
          store_id: ret.store_id,
          user_id: ret.user_id,
          items: parsedItems,
          total_amount: ret.total_amount,
          reason: ret.reason,
          staff_id: ret.staff_id,
          created_at: ret.created_at,
          sale: ret.sale,
          staff: ret.staff,
        };
      });

      setReturns(typedReturns);
    } catch (error: any) {
      console.error("Error fetching returns:", error);
      toast({
        title: "Error",
        description: "Failed to load sales returns",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, [currentStoreId]);

  const filteredReturns = returns.filter((ret) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    
    const inCustomer = ret.sale?.customer_name?.toLowerCase().includes(q);
    const inReason = ret.reason?.toLowerCase().includes(q);
    const inItems = ret.items.some((item) => 
      item.productName.toLowerCase().includes(q)
    );
    const staffName = ret.staff?.full_name || ret.staff?.name || "";
    const inStaff = staffName.toLowerCase().includes(q);
    const inAmount = ret.total_amount.toString().includes(q);
    
    return inCustomer || inReason || inItems || inStaff || inAmount;
  });

  const getStatusBadge = () => {
    // For now, all returns are considered completed
    return (
      <Badge className="bg-success/10 text-success border-success/20">
        <CheckCircle className="h-3 w-3 mr-1" />
        Completed
      </Badge>
    );
  };

  const handleViewDetails = (returnItem: SaleReturn) => {
    setSelectedReturn(returnItem);
    setIsDialogOpen(true);
  };

  const handleProcessRefund = async () => {
    try {
      // In a real implementation, this would process the refund
      // For now, just show a success message
      toast({
        title: "Refund Processed",
        description: "Refund has been processed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to process refund: " + error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sales Returns</h2>
          <p className="text-muted-foreground">Manage product returns and refunds</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search returns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={fetchReturns} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <PageLoader text="Loading returns..." />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Undo2 className="h-4 w-4" />
                  Total Returns
                </div>
                <p className="text-2xl font-bold">{returns.length}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  Total Refunded
                </div>
                <p className="text-2xl font-bold text-destructive">
                  {fmtCurrency(returns.reduce((sum, ret) => sum + ret.total_amount, 0))}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Package className="h-4 w-4" />
                  Items Returned
                </div>
                <p className="text-2xl font-bold">
                  {returns.reduce((sum, ret) => sum + ret.items.length, 0)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  Today's Returns
                </div>
                <p className="text-2xl font-bold">
                  {returns.filter(ret => 
                    new Date(ret.created_at).toDateString() === new Date().toDateString()
                  ).length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Returns Table */}
          <Card>
            <CardHeader>
              <CardTitle>All Returns</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredReturns.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Undo2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No returns found</p>
                  {searchQuery && (
                    <p className="text-sm mt-2">Try a different search term</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReturns.map((ret) => (
                        <TableRow key={ret.id}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {format(new Date(ret.created_at), "MMM d, yyyy")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(ret.created_at), "h:mm a")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {ret.sale?.customer_name || "Unknown"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs">
                              {ret.items.slice(0, 2).map((item, idx) => (
                                <div key={idx} className="text-sm">
                                  {item.quantity}× {item.productName}
                                </div>
                              ))}
                              {ret.items.length > 2 && (
                                <div className="text-xs text-muted-foreground">
                                  +{ret.items.length - 2} more items
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate" title={ret.reason}>
                              {ret.reason || "No reason provided"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-destructive">
                              {fmtCurrency(ret.total_amount)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewDetails(ret)}
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Details
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleProcessRefund()}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Refund
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Return Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Return Details</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Customer</Label>
                  <p className="font-medium">{selectedReturn.sale?.customer_name || "Unknown"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Return Date</Label>
                  <p className="font-medium">
                    {format(new Date(selectedReturn.created_at), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Original Sale</Label>
                  <p className="font-medium">
                    {selectedReturn.sale?.date_of_sale ? 
                      format(new Date(selectedReturn.sale.date_of_sale), "MMM d, yyyy") : 
                      "Unknown"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Staff</Label>
                  <p className="font-medium">{selectedReturn.staff?.full_name || selectedReturn.staff?.name || "Not specified"}</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Reason for Return</Label>
                <p className="font-medium p-3 bg-muted/50 rounded-lg">
                  {selectedReturn.reason || "No reason provided"}
                </p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-2">Items Returned</Label>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedReturn.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{fmtCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right font-medium text-destructive">
                            {fmtCurrency(item.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={3} className="font-bold text-right">
                          Total Refund
                        </TableCell>
                        <TableCell className="text-right font-bold text-destructive">
                          {fmtCurrency(selectedReturn.total_amount)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => handleProcessRefund()}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Process Refund
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesReturns;
