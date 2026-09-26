import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Notification } from "@/types";
import { Bell, AlertTriangle, CreditCard, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface NotificationCenterProps {
  onPageChange?: (page: string, params?: any) => void;
}

const NotificationCenter = ({ onPageChange }: NotificationCenterProps) => {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  useEffect(() => {
    fetchNotifications();
    setupRealtimeSubscription();
    checkForAlerts();
    
    // Polling removed
  }, []);

  const checkForAlerts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's store
      const { data: stores } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      const storeId = stores?.[0]?.id;
      if (!storeId) return;

      // Check for low stock items
      const { data: inventory } = await supabase
        .from("inventory")
        .select("*")
        .eq("store_id", storeId);

      if (inventory && inventory.length > 0) {
        // Group items by stock status
        const lowStockItems = inventory.filter(item => {
          const quantity = item.quantity || 0;
          const minLevel = item.min_stock_level || 10;
          const lowThreshold = minLevel * 1.5;
          return quantity < lowThreshold && quantity >= minLevel;
        });

        const criticalStockItems = inventory.filter(item => {
          const quantity = item.quantity || 0;
          const minLevel = item.min_stock_level || 10;
          return quantity < minLevel;
        });

        // Only send notification if there are low or critical stock items
        if (lowStockItems.length > 0 || criticalStockItems.length > 0) {
          // Check if we already sent a consolidated notification in the last 24 hours
          const { data: existingNotif } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", user.id)
            .eq("type", "low_stock")
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1);

          if (!existingNotif || existingNotif.length === 0) {
            // Create consolidated message
            const totalItems = lowStockItems.length + criticalStockItems.length;
            let message = "";
            
            if (criticalStockItems.length > 0 && lowStockItems.length > 0) {
              message = `${criticalStockItems.length} critical, ${lowStockItems.length} low stock items need attention`;
            } else if (criticalStockItems.length > 0) {
              message = `${criticalStockItems.length} item${criticalStockItems.length > 1 ? 's' : ''} critically low on stock`;
            } else {
              message = `${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} running low on stock`;
            }

            // Add top 3 critical items to message
            const topItems = criticalStockItems.slice(0, 3);
            if (topItems.length > 0) {
              const itemNames = topItems.map(item => `${item.product_name} (${item.quantity})`).join(", ");
              message += `. Critical: ${itemNames}`;
              if (criticalStockItems.length > 3) {
                message += ` and ${criticalStockItems.length - 3} more`;
              }
            }

            // Prepare data with all low stock items
            const notificationData = {
              total_items: totalItems,
              critical_count: criticalStockItems.length,
              low_count: lowStockItems.length,
              critical_items: criticalStockItems.map(item => ({
                product_name: item.product_name,
                quantity: item.quantity,
                min_level: item.min_stock_level || 10
              })),
              low_items: lowStockItems.map(item => ({
                product_name: item.product_name,
                quantity: item.quantity,
                min_level: item.min_stock_level || 10
              })),
              store_id: storeId
            };

            await supabase.from("notifications").insert({
              user_id: user.id,
              type: "low_stock",
              title: "Stock Alert",
              message: message,
              data: notificationData
            });
          }
        }
      }

      // Check for unpaid sales (payment reminders) - keep existing logic
      const { data: unpaidSales } = await supabase
        .from("sales")
        .select("*")
        .eq("store_id", storeId)
        .eq("paid_in_cash", false)
        .lt("date_of_sale", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      if (unpaidSales && unpaidSales.length > 0) {
        for (const sale of unpaidSales) {
          // Check if we already have a recent notification for this sale
          const { data: existingNotif } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", user.id)
            .eq("type", "payment_reminder")
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .contains("data", { sale_id: sale.id })
            .limit(1);

          if (!existingNotif || existingNotif.length === 0) {
            await supabase.from("notifications").insert({
              user_id: user.id,
              type: "payment_reminder",
              title: "Payment Reminder",
              message: `Unpaid sale for ${sale.customer_name} - UGX ${sale.total_amount.toLocaleString()} is overdue`,
              data: { sale_id: sale.id, customer_name: sale.customer_name, amount: sale.total_amount }
            });
          }
        }
      }

      // Refresh notifications after creating new ones
      fetchNotifications();
    } catch (error) {
      console.error("Error checking for alerts:", error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserEmail(user.email || "");

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      
      if (data) {
        const mapped = (data as any[]).map((n: any) => ({
          ...n,
          sender_email: n.sender?.email,
          sender_name: n.sender?.full_name,
          data: n.data as Record<string, unknown> | null
        })) as Notification[];
        setNotifications(mapped);
        setUnreadCount(mapped.filter(n => !n.read).length);
      }
    } catch (error: unknown) {
      console.error("Error fetching notifications:", error);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          toast({
            title: newNotification.title,
            description: newNotification.message,
            variant: "success",
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error: unknown) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error: unknown) {
      console.error("Error marking all as read:", error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'low_stock':
        return <Package className="h-4 w-4 text-warning" />;
      case 'payment_reminder':
        return <CreditCard className="h-4 w-4 text-destructive" />;
      case 'update':
        return <AlertTriangle className="h-4 w-4 text-primary" />;
      default:
        return <Bell className="h-4 w-4 text-primary" />;
    }
  };

  const getNotificationBgColor = (type: string, read: boolean) => {
    if (read) return "bg-background";
    switch (type) {
      case 'low_stock':
        return "bg-warning/5 border-warning/20";
      case 'payment_reminder':
        return "bg-destructive/5 border-destructive/20";
      case 'update':
        return "bg-primary/5 border-primary/20";
      default:
        return "bg-primary/5 border-primary/20";
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </SheetTitle>
          <SheetDescription>
            Stay updated with stock alerts, payment reminders, and transfers
          </SheetDescription>
        </SheetHeader>
        
        {notifications.length > 0 && unreadCount > 0 && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={markAllAsRead}
            className="w-full mt-4"
          >
            Mark all as read
          </Button>
        )}

        <ScrollArea className="h-[calc(100vh-200px)] mt-4">
          <div className="space-y-3">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No notifications yet</p>
                <p className="text-xs mt-1">You'll see low stock alerts and payment reminders here</p>
              </div>
            ) : (
              notifications.map((notification) => {
                // Check if this is a consolidated low stock notification
                const isLowStockSummary = notification.type === 'low_stock' && 
                  notification.data && 
                  typeof notification.data === 'object' &&
                  'total_items' in notification.data;

                const criticalItems = (notification.data as any)?.critical_items as any[] | undefined;
                const lowItems = (notification.data as any)?.low_items as any[] | undefined;

                return (
                  <div
                    key={notification.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${getNotificationBgColor(notification.type, notification.read)}`}
                    onClick={() => !notification.read && markAsRead(notification.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="font-semibold text-sm">{notification.title}</h4>
                          {!notification.read && (
                            <Badge variant="default" className="text-xs ml-2">New</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.message}
                        </p>
                        
                        {/* Show detailed list for consolidated low stock notifications */}
                        {isLowStockSummary && notification.data && (
                          <div className="mt-3 space-y-2">
                            {/* Critical items */}
                            {criticalItems && criticalItems.length > 0 && (
                              <div className="bg-destructive/10 p-2 rounded border border-destructive/20">
                                <p className="text-xs font-semibold text-destructive mb-1">
                                  Critical Stock ({criticalItems.length})
                                </p>
                                <div className="space-y-1">
                                  {criticalItems.slice(0, 5).map((item: any, idx: number) => (
                                    <div key={idx} className="text-xs flex justify-between">
                                      <span className="font-medium">{item.product_name}</span>
                                      <span className="text-destructive">{item.quantity} / {item.min_level}</span>
                                    </div>
                                  ))}
                                  {criticalItems.length > 5 && (
                                    <p className="text-xs text-muted-foreground italic">
                                      +{criticalItems.length - 5} more items
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Low stock items */}
                            {lowItems && lowItems.length > 0 && (
                              <div className="bg-warning/10 p-2 rounded border border-warning/20">
                                <p className="text-xs font-semibold text-warning mb-1">
                                  Low Stock ({lowItems.length})
                                </p>
                                <div className="space-y-1">
                                  {lowItems.slice(0, 5).map((item: any, idx: number) => (
                                    <div key={idx} className="text-xs flex justify-between">
                                      <span className="font-medium">{item.product_name}</span>
                                      <span className="text-warning">{item.quantity} / {item.min_level}</span>
                                    </div>
                                  ))}
                                  {lowItems.length > 5 && (
                                    <p className="text-xs text-muted-foreground italic">
                                      +{lowItems.length - 5} more items
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onPageChange) {
                                  onPageChange('inventory', { stock: 'low' });
                                } else {
                                  window.location.hash = '#/inventory?stock=low';
                                }
                                setIsOpen(false);
                              }}
                            >
                              View All in Inventory
                            </Button>
                          </div>
                        )}
                        
                        {notification.sender_email && (
                          <div className="text-xs mb-1">
                            <span className="text-muted-foreground">From: </span>
                            <span className="font-medium">{notification.sender_name || notification.sender_email}</span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationCenter;
