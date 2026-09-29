import { useState, useEffect, useRef } from "react";
import { fmtCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Notification } from "@/types";
import { Bell, AlertTriangle, CreditCard, Package, Sparkles, Clock3, X } from "lucide-react";
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
import { AnimatePresence, motion } from "framer-motion";

interface NotificationCenterProps {
  onPageChange?: (page: string, params?: any) => void;
  /** The branch context is supplied by the POS shell, never guessed from ownership. */
  currentStoreId?: string | null;
}

const NotificationCenter = ({ onPageChange, currentStoreId }: NotificationCenterProps) => {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Wait for the store context before doing anything — avoids store_id=eq.undefined 400s
    if (!currentStoreId) return;

    fetchNotifications();
    const cleanupRealtime = setupRealtimeSubscription();
    checkForAlerts();

    return () => {
      cleanupRealtime();
    };
  }, [currentStoreId]);

  const checkForAlerts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const storeId = currentStoreId;
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
          const { data: existingNotif } = await (supabase as any)
            .from("notifications")
            .select("id")
            .eq("user_id", user.id)
            .eq("store_id", storeId)
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
              store_id: storeId,
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
          const { data: existingNotif } = await (supabase as any)
            .from("notifications")
            .select("id")
            .eq("user_id", user.id)
            .eq("store_id", storeId)
            .eq("type", "payment_reminder")
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .contains("data", { sale_id: sale.id })
            .limit(1);

          if (!existingNotif || existingNotif.length === 0) {
            await supabase.from("notifications").insert({
              user_id: user.id,
              store_id: storeId,
              type: "payment_reminder",
              title: "Payment Reminder",
              message: `Unpaid sale for ${sale.customer_name} - ${fmtCurrency(sale.total_amount)} is overdue`,
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
    // Don't query until we have a valid store context — prevents store_id=eq.undefined 400s
    if (!currentStoreId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserEmail(user.email || "");

      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("store_id", currentStoreId)
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
    if (!currentStoreId) return () => undefined;
    // Remove any lingering channel with the same topic to avoid attaching handlers after subscribe.
    supabase
      .getChannels()
      .filter((existing) => existing.topic === "realtime:notifications")
      .forEach((existing) => {
        void supabase.removeChannel(existing);
      });

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`notifications-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `store_id=eq.${currentStoreId}`,
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

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
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
    if (!currentStoreId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await (supabase as any)
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("store_id", currentStoreId)
        .eq("read", false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error: unknown) {
      console.error("Error marking all as read:", error);
    }
  };

  const dismissNotification = (notificationId: string) => {
    setDismissedIds((prev) => (prev.includes(notificationId) ? prev : [...prev, notificationId]));
    const current = notifications.find((n) => n.id === notificationId);
    if (current && !current.read) {
      void markAsRead(notificationId);
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

  const visibleNotifications = notifications.filter((notification) => !dismissedIds.includes(notification.id));

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
      <SheetContent className="w-full sm:max-w-md p-0 border-l border-primary/10 bg-gradient-to-b from-background via-background to-muted/30">
        <div className="h-full flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 border-b bg-background/80 backdrop-blur">
            <SheetTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              Notifications
            </SheetTitle>
            <SheetDescription>
              Live alerts for stock, overdue payments, and activity
            </SheetDescription>
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                {visibleNotifications.length} total
              </Badge>
              <Badge variant={unreadCount > 0 ? "destructive" : "outline"} className="rounded-full px-2.5 py-0.5 text-[11px]">
                {unreadCount} unread
              </Badge>
            </div>
          </SheetHeader>

          {visibleNotifications.length > 0 && unreadCount > 0 && (
            <div className="px-5 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="w-full"
              >
                Mark all as read
              </Button>
            </div>
          )}

          <ScrollArea className="flex-1 px-4 pb-4 mt-3">
            <div className="space-y-3 pr-1">
              {visibleNotifications.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No notifications yet</p>
                  <p className="text-xs mt-1">New alerts will slide in here automatically</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {visibleNotifications.map((notification) => {
                    const isLowStockSummary = notification.type === 'low_stock' &&
                      notification.data &&
                      typeof notification.data === 'object' &&
                      'total_items' in notification.data;

                    const criticalItems = (notification.data as any)?.critical_items as any[] | undefined;
                    const lowItems = (notification.data as any)?.low_items as any[] | undefined;

                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: 36, scale: 0.98 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 80, scale: 0.95 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className={`p-4 rounded-xl border shadow-sm cursor-pointer transition-colors ${getNotificationBgColor(notification.type, notification.read)}`}
                        onClick={() => !notification.read && markAsRead(notification.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-1">
                              <h4 className="font-semibold text-sm">{notification.title}</h4>
                              <div className="flex items-center gap-2 ml-2">
                                {!notification.read && (
                                  <Badge variant="default" className="text-[10px] h-5">New</Badge>
                                )}
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded-md hover:bg-background/70 flex items-center justify-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    dismissNotification(notification.id);
                                  }}
                                  aria-label="Dismiss notification"
                                >
                                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {notification.message}
                            </p>

                            {isLowStockSummary && notification.data && (
                              <div className="mt-3 space-y-2">
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
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock3 className="h-3 w-3" />
                              {new Date(notification.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationCenter;
