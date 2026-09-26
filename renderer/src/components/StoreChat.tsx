import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ChatMessage as Message, PairedStore } from "@/types";

const StoreChat = () => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pairedStores, setPairedStores] = useState<PairedStore[]>([]);
  const [connectedStores, setConnectedStores] = useState<PairedStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [deletedMessages, setDeletedMessages] = useState<string[]>([]);
  const [unreadPerStore, setUnreadPerStore] = useState<Record<string, number>>({});

  // Load deleted messages from localStorage for "Delete for me" feature
  useEffect(() => {
    const deleted = localStorage.getItem("brec_deleted_messages");
    if (deleted) setDeletedMessages(JSON.parse(deleted));
  }, []);

  const saveDeletedMessage = (id: string) => {
    const updated = [...deletedMessages, id];
    setDeletedMessages(updated);
    localStorage.setItem("brec_deleted_messages", JSON.stringify(updated));
  };

  useEffect(() => {
    initializeChat();
  }, []);

  useEffect(() => {
    if (selectedStore) {
      fetchMessages(selectedStore);
    }
  }, [selectedStore]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeChat = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUserId(user.id);
      await fetchPairedStores(user.id);
      await fetchConnectedStores(user.id);
      await fetchUnreadCount(user.id);
      setupRealtimeSubscription(user.id);
    } catch (error: unknown) {
      console.error("Error initializing chat:", error);
    }
  };

  const fetchPairedStores = async (userId: string) => {
    try {
      // Get stores the user has access to (not their own)
      const { data: accessData, error: accessError } = await supabase
        .from("store_access")
        .select("store_id")
        .eq("user_id", userId);

      if (accessError) throw accessError;

      if (!accessData || accessData.length === 0) return;

      const storeIds = accessData.map(a => a.store_id);

      const { data: storesData, error: storesError } = await supabase
        .from("stores")
        .select("id, store_name, user_id")
        .in("id", storeIds);

      if (storesError) throw storesError;

      setPairedStores(
        storesData?.map(s => ({
          id: s.id,
          store_name: s.store_name,
          owner_id: s.user_id,
        })) || []
      );
    } catch (error: unknown) {
      console.error("Error fetching paired stores:", error);
    }
  };

  const fetchConnectedStores = async (userId: string) => {
    try {
      // Get user's own stores
      const { data: myStores, error: storeError } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", userId);

      if (storeError) throw storeError;
      if (!myStores || myStores.length === 0) return;

      const myStoreIds = myStores.map(s => s.id);

      // Get users who have access to my stores
      const { data: accessData, error: accessError } = await supabase
        .from("store_access")
        .select("user_id, store_id")
        .in("store_id", myStoreIds);

      if (accessError) throw accessError;
      if (!accessData || accessData.length === 0) return;

      // Get the stores of users who are connected to me
      const connectedUserIds = [...new Set(accessData.map(a => a.user_id))];
      
      const { data: connectedUserStores, error: connectedError } = await supabase
        .from("stores")
        .select("id, store_name, user_id")
        .in("user_id", connectedUserIds);

      if (connectedError) throw connectedError;

      setConnectedStores(
        connectedUserStores?.map(s => ({
          id: s.id,
          store_name: s.store_name + " (Connected)",
          owner_id: s.user_id,
        })) || []
      );
    } catch (error: unknown) {
      console.error("Error fetching connected stores:", error);
    }
  };

  const fetchMessages = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data as Message[]) || []);

      // Mark messages as read
      const unreadMessages = data?.filter(
        m => m.receiver_id === currentUserId && !m.read
      );
      if (unreadMessages && unreadMessages.length > 0) {
        await supabase
          .from("messages")
          .update({ read: true })
          .in("id", unreadMessages.map(m => m.id));
        
        fetchUnreadCount(currentUserId);
      }
    } catch (error: unknown) {
      console.error("Error fetching messages:", error);
    }
  };

  const fetchUnreadCount = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, store_id")
        .eq("receiver_id", userId)
        .eq("read", false);

      if (error) throw error;
      
      setUnreadCount(data?.length || 0);
      
      // Calculate per-store unread counts
      const perStore: Record<string, number> = {};
      data?.forEach(m => {
        perStore[m.store_id] = (perStore[m.store_id] || 0) + 1;
      });
      setUnreadPerStore(perStore);
    } catch (error: unknown) {
      console.error("Error fetching unread count:", error);
    }
  };

  const setupRealtimeSubscription = (userId: string) => {
    const channel = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as Message;
          
          // If message is for/from current user or current selected store
          if (newMsg.receiver_id === userId || newMsg.sender_id === userId) {
            if (selectedStore === newMsg.store_id) {
              setMessages(prev => {
                const exists = prev.some(m => m.id === newMsg.id);
                if (exists) return prev;
                return [...prev, newMsg];
              });
              if (newMsg.receiver_id === userId) {
                markMessageAsRead(newMsg.id);
              }
            } else if (newMsg.receiver_id === userId) {
              fetchUnreadCount(userId);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
        },
        () => {
          if (selectedStore) fetchMessages(selectedStore);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const markMessageAsRead = async (messageId: string) => {
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("id", messageId);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedStore) return;

    try {
      const store = pairedStores.find(s => s.id === selectedStore) || connectedStores.find(s => s.id === selectedStore);
      if (!store) return;

      const { error } = await supabase
        .from("messages")
        .insert({
          sender_id: currentUserId,
          receiver_id: store.owner_id,
          store_id: selectedStore,
          message: newMessage.trim(),
        });

      if (error) throw error;

      setNewMessage("");
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error sending message",
        description: err.message,
      });
    }
  };

  const clearChat = async () => {
    if (!selectedStore || !window.confirm("Are you sure you want to clear all messages in this chat? This will delete them for BOTH stores.")) return;

    try {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("store_id", selectedStore);

      if (error) throw error;

      setMessages([]);
      toast({ title: "Chat cleared successfully" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to clear chat", description: error.message });
    }
  };

  const unpairStore = async () => {
    if (!selectedStore || !window.confirm("Are you sure you want to remove the pair with this store? You will lose access to chat and transfers.")) return;

    try {
      // Remove from store_access
      const { error } = await supabase
        .from("store_access")
        .delete()
        .eq("store_id", selectedStore)
        .eq("user_id", currentUserId);

      if (error) throw error;

      toast({ title: "Store unpaired successfully" });
      setSelectedStore("");
      fetchPairedStores(currentUserId);
      fetchConnectedStores(currentUserId);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to remove pair", description: error.message });
    }
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getUnreadInStore = (storeId: string) => {
    return unreadPerStore[storeId] || 0;
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <MessageSquare className="h-5 w-5" />
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
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Store Chat</SheetTitle>
          <SheetDescription>
            Chat with your paired stores
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger>
              <SelectValue placeholder="Select a store to chat" />
            </SelectTrigger>
            <SelectContent>
              {pairedStores.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Linked Stores</div>
                  {pairedStores.map(store => {
                    const storeUnread = getUnreadInStore(store.id);
                    return (
                      <SelectItem key={store.id} value={store.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{store.store_name}</span>
                          {storeUnread > 0 && (
                            <Badge variant="destructive" className="ml-2 h-4 min-w-[1rem] flex items-center justify-center p-1 text-[10px]">
                              {storeUnread}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </>
              )}
              {connectedStores.length > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium border-t mt-1 pt-1">Connected Users</div>
                  {connectedStores.map(store => {
                    const storeUnread = getUnreadInStore(store.id);
                    return (
                      <SelectItem key={store.id} value={store.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{store.store_name}</span>
                          {storeUnread > 0 && (
                            <Badge variant="destructive" className="ml-2 h-4 min-w-[1rem] flex items-center justify-center p-1 text-[10px]">
                              {storeUnread}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {selectedStore ? (
          <>
            <div className="flex items-center justify-between border-b pb-2 mt-4">
              <div>
                <h3 className="text-sm font-semibold">
                  {pairedStores.find(s => s.id === selectedStore)?.store_name || 
                   connectedStores.find(s => s.id === selectedStore)?.store_name}
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Store Paired</p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={clearChat}>Clear Chat</Button>
                <Button variant="destructive" size="sm" className="h-7 text-[10px]" onClick={unpairStore}>Remove Pair</Button>
              </div>
            </div>

            <ScrollArea className="h-[calc(100vh-320px)] mt-2 pr-4">
              <div className="space-y-4 pt-2">
                {messages.filter(m => !deletedMessages.includes(m.id)).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No messages yet. Start a conversation!
                  </div>
                ) : (
                  messages
                    .filter(m => !deletedMessages.includes(m.id))
                    .map((msg) => {
                      const isSender = msg.sender_id === currentUserId;
                      return (
                        <div
                          key={msg.id}
                          className={`flex items-start gap-3 ${
                            isSender ? "flex-row-reverse" : ""
                          }`}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {isSender ? "You" : "Them"}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`group relative max-w-[75%]`}>
                            <div
                              className={`rounded-lg p-3 ${
                                isSender
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <p className="text-sm">{msg.message}</p>
                                <p className="text-[10px] mt-1 opacity-70 flex items-center gap-1">
                                  {msg.created_at ? (
                                    <>
                                      {new Date(msg.created_at).toLocaleDateString()} {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </>
                                  ) : "Just now"}
                                  {isSender && (
                                    <span className="ml-1">
                                      {msg.read ? "✓✓" : "✓"}
                                    </span>
                                  )}
                                </p>
                            </div>
                            <Button
                              variant="ghost"
                              className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 opacity-0 group-hover:opacity-100 bg-destructive text-white"
                              onClick={() => saveDeletedMessage(msg.id)}
                            >
                              ×
                            </Button>
                          </div>
                        </div>
                      );
                    })
                )}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <div className="flex gap-2 mt-4">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button onClick={sendMessage} size="icon" disabled={!newMessage.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {pairedStores.length === 0 && connectedStores.length === 0
              ? "No paired or connected stores yet. Link a store to start chatting."
              : "Select a store to start chatting"}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default StoreChat;