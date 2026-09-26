/**
 * ExecChat — chat panel for executive & accountant workspaces.
 *
 * Conversations supported:
 *   • Executive → any branch (store)
 *   • Executive → another executive / accountant user
 *   • Branch → executive (branch staff use StoreChat; this is the executive side)
 *
 * Storage: `executive_messages` (migration 20260926000000_executive_chat.sql).
 * Deleting a chat writes a per-user marker to `chat_deletions`
 * (migration 20260926010000) and never removes message rows.
 *
 * UI follows the familiar messenger layout: a conversation list, then a single
 * thread, with per-row overflow menus. Grouping and time formatting are shared
 * with StoreChat via `@/lib/chat`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  MessageSquare,
  MoreVertical,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  applyDeletions,
  avatarTone,
  buildConversations,
  dayLabel,
  initials,
  isFromMe,
  isToMe,
  listTime,
  peerKey,
  sameDay,
  type ChatContext,
  type ChatDeletion,
  type ChatMessage,
  type Conversation,
} from "@/lib/chat";

type Branch = { id: string; store_name: string };
type ExecUser = { id: string; display_name: string };
type NewMsgAlert = { id: string; fromLabel: string; text: string };

interface ExecChatProps {
  userId: string | null;
}

type Row = {
  id: string;
  sender_user_id: string | null;
  sender_store_id: string | null;
  recipient_user_id: string | null;
  recipient_store_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
};

/** Map `executive_messages` rows onto the shared shape. */
function normalise(row: Row): ChatMessage {
  return {
    id: row.id,
    senderUserId: row.sender_user_id,
    senderStoreId: row.sender_store_id,
    recipientUserId: row.recipient_user_id,
    recipientStoreId: row.recipient_store_id,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export default function ExecChat({ userId }: ExecChatProps) {
  const { toast } = useToast();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [execUsers, setExecUsers] = useState<ExecUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deletions, setDeletions] = useState<ChatDeletion[]>([]);

  // "Send as" — executive messages on behalf of a store, or as themselves
  const [sendAsStore, setSendAsStore] = useState<string>("__self__");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [alert, setAlert] = useState<NewMsgAlert | null>(null);

  const knownIds = useRef(new Set<string>());
  const bottomRef = useRef<HTMLDivElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  /* ── loading ──────────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    if (!userId) return;

    const [{ data: owned }, { data: access }] = await Promise.all([
      supabase.from("stores").select("id, store_name").eq("user_id", userId),
      supabase
        .from("store_access")
        .select("stores(id, store_name)")
        .eq("user_id", userId),
    ]);
    const allBranches = Array.from(
      new Map(
        [
          ...(owned || []),
          ...(access || []).map((a: any) => a.stores).filter(Boolean),
        ].map((b: Branch) => [b.id, b]),
      ).values(),
    ) as Branch[];
    setBranches(allBranches);

    // Other executive/accountant users who share at least one branch
    const storeIds = allBranches.map((b) => b.id);
    if (storeIds.length) {
      const { data: peers } = await supabase
        .from("store_access")
        .select("user_id, role")
        .in("store_id", storeIds)
        .in("role", ["owner", "boss", "accountant"]);

      const peerIds = Array.from(
        new Set(
          (peers || []).map((p: any) => p.user_id).filter((id: string) => id !== userId),
        ),
      );

      if (peerIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", peerIds);

        setExecUsers(
          (profiles || []).map((p: any) => ({
            id: p.user_id,
            display_name: p.full_name || "Executive",
          })),
        );
      }
    }

    const { data: del } = await supabase
      .from("chat_deletions")
      .select("scope, peer_id, deleted_at")
      .eq("user_id", userId);
    setDeletions((del || []) as ChatDeletion[]);

    // Messages: sent by or addressed to this user (or their stores)
    const { data, error } = await (supabase as any)
      .from("executive_messages")
      .select("*")
      .or(
        [
          `sender_user_id.eq.${userId}`,
          `recipient_user_id.eq.${userId}`,
          storeIds.length
            ? `sender_store_id.in.(${storeIds.join(",")})` +
              `,recipient_store_id.in.(${storeIds.join(",")})`
            : null,
        ]
          .filter(Boolean)
          .join(","),
      )
      .order("created_at", { ascending: false })
      .limit(300);

    if (!error) {
      const next = ((data || []) as Row[]).map(normalise);
      next.forEach((m) => knownIds.current.add(m.id));
      setMessages(next);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── derived context and conversations ────────────────────────────────── */

  const ctx: ChatContext = useMemo(
    () => ({
      myUserId: userId || "",
      myStoreIds: new Set(branches.map((b) => b.id)),
      nameForUser: (id) => execUsers.find((u) => u.id === id)?.display_name || "Executive",
      nameForStore: (id) => branches.find((b) => b.id === id)?.store_name || "Branch",
    }),
    [userId, branches, execUsers],
  );

  const allConversations = useMemo(
    () => buildConversations(messages, ctx),
    [messages, ctx],
  );

  const conversations = useMemo(
    () => applyDeletions(allConversations, deletions),
    [allConversations, deletions],
  );

  const active = useMemo(
    () => conversations.find((c) => c.key === activeKey) || null,
    [conversations, activeKey],
  );

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  /* ── realtime ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!userId) return;

    const handleNew = (payload: any) => {
      const msg = payload.new as Row | undefined;
      if (!msg) return;
      if (knownIds.current.has(msg.id)) return;
      knownIds.current.add(msg.id);

      // Only alert the *recipient* — never the sender
      const toMe =
        msg.recipient_user_id === userId ||
        branches.some((b) => b.id === msg.recipient_store_id);
      const byMe =
        msg.sender_user_id === userId ||
        branches.some((b) => b.id === msg.sender_store_id);

      if (toMe && !byMe) {
        const fromLabel =
          branches.find((b) => b.id === msg.sender_store_id)?.store_name ||
          execUsers.find((u) => u.id === msg.sender_user_id)?.display_name ||
          "Someone";
        setAlert({ id: msg.id, fromLabel, text: msg.message.slice(0, 80) });
      }

      void load();
    };

    const channel = (supabase as any)
      .channel(`exec-chat-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "executive_messages" },
        handleNew,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, branches, execUsers, load]);

  /* ── read receipts ────────────────────────────────────────────────────── */

  const markRead = useCallback(
    async (conversation: Conversation) => {
      if (!userId) return;
      const unread = conversation.messages
        .filter((m) => !m.readAt && isToMe(m, ctx))
        .map((m) => m.id);
      if (!unread.length) return;
      const { error } = await (supabase as any)
        .from("executive_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread);
      if (error) {
        toast({
          title: "Could not mark as read",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          unread.includes(m.id) ? { ...m, readAt: new Date().toISOString() } : m,
        ),
      );
    },
    [userId, ctx, toast],
  );

  // Mark the open thread read whenever it changes
  useEffect(() => {
    if (open && active) void markRead(active);
  }, [open, active, markRead]);

  // Auto-open the newest thread with unread messages, like a real inbox
  useEffect(() => {
    if (!open || activeKey || composing) return;
    const next = conversations.find((c) => c.unread > 0);
    if (next) setActiveKey(next.key);
  }, [open, activeKey, composing, conversations]);

  useEffect(() => {
    if (open) {
      setTimeout(
        () => (active ? bottomRef.current : listEndRef.current)?.scrollIntoView({ behavior: "smooth" }),
        60,
      );
    }
  }, [active, messages, open]);

  /* ── actions ──────────────────────────────────────────────────────────── */

  const send = async () => {
    if (!draft.trim() || !userId || !active) return;
    const [rType, rId] = active.key.split(":", 2) as ["user" | "store", string];

    const payload: any = {
      sender_user_id: userId,
      sender_store_id: sendAsStore !== "__self__" ? sendAsStore : null,
      message: draft.trim(),
      recipient_user_id: rType === "user" ? rId : null,
      recipient_store_id: rType === "store" ? rId : null,
    };

    const { error } = await (supabase as any)
      .from("executive_messages")
      .insert(payload);

    if (error) {
      toast({ title: "Message not sent", description: error.message, variant: "destructive" });
      return;
    }
    setDraft("");
    void load();
  };

  /** Hide a thread for this user only; a newer message brings it back. */
  const confirmDelete = async () => {
    if (!pendingDelete || !userId) return;
    const target = pendingDelete;
    setPendingDelete(null);

    const { error } = await supabase
      .from("chat_deletions")
      .upsert(
        {
          user_id: userId,
          scope: target.scope,
          peer_id: target.peerId,
          deleted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,scope,peer_id" },
      );

    if (error) {
      toast({
        title: "Could not delete chat",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setDeletions((prev) => [
      ...prev.filter(
        (d) => !(d.scope === target.scope && d.peer_id === target.peerId),
      ),
      { scope: target.scope, peer_id: target.peerId, deleted_at: new Date().toISOString() },
    ]);
    setActiveKey((current) => (current === target.key ? null : current));
    toast({
      title: "Chat deleted",
      description: `This conversation with ${target.name} is hidden for you.`,
    });
  };

  const canSendAs = active?.scope === "store" ? branches.length > 0 : true;

  /* ── render ───────────────────────────────────────────────────────────── */

  return (
    <>
      {/* New-message alert — recipient only */}
      <Dialog open={Boolean(alert)} onOpenChange={() => setAlert(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              New message from {alert?.fromLabel}
            </DialogTitle>
          </DialogHeader>
          <p className="line-clamp-3 text-sm text-muted-foreground">{alert?.text}</p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setAlert(null)}>
              Dismiss
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setAlert(null);
                setOpen(true);
              }}
            >
              Open chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => !next && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation with {pendingDelete?.name} will be hidden from your chat
              list. {pendingDelete?.unread ? `${pendingDelete.unread} unread message(s) included.` : ""}{" "}
              The other person keeps their copy, and a new message from them will bring
              this chat back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" title="Executive chat">
            <MessageSquare className="h-5 w-5" />
            {unreadTotal > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 min-w-5 justify-center p-1 text-xs"
              >
                {unreadTotal > 9 ? "9+" : unreadTotal}
              </Badge>
            )}
          </Button>
        </SheetTrigger>

        <SheetContent className="flex h-full w-full flex-col p-0 sm:max-w-lg">
          {/* Header doubles as thread header when a thread is open */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            {active && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveKey(null)}
                title="Back to chats"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">
                {active ? active.name : "Executive chat"}
              </SheetTitle>
              <SheetDescription className="truncate text-xs">
                {active
                  ? `${active.messages.length} message${active.messages.length === 1 ? "" : "s"}`
                  : "Message branches or other executives."}
              </SheetDescription>
            </div>
            {active && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" title="Chat options">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setPendingDelete(active)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!active && (
              <Button
                variant="ghost"
                size="icon"
                title="New chat"
                onClick={() => setComposing(true)}
                disabled={!branches.length && !execUsers.length}
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* New-chat recipient picker */}
          {composing && !active && (
            <div className="border-b bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Start a conversation
              </p>
              <Select
                onValueChange={(value) => {
                  setActiveKey(value);
                  setComposing(false);
                }}
              >
                <SelectTrigger className="mt-2 bg-background">
                  <SelectValue placeholder="Choose a branch or executive…" />
                </SelectTrigger>
                <SelectContent>
                  {branches.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                        Branches
                      </div>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={peerKey("store", b.id)}>
                          {b.store_name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {execUsers.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                        Executives / Accountants
                      </div>
                      {execUsers.map((u) => (
                        <SelectItem key={u.id} value={peerKey("user", u.id)}>
                          {u.display_name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Thread */}
          {active ? (
            <>
              <ScrollArea className="flex-1">
                <div className="space-y-1 px-4 py-4">
                  {active.messages.map((msg, index) => {
                    const mine = isFromMe(msg, ctx);
                    const prev = active.messages[index - 1];
                    const newDay = !prev || !sameDay(prev.createdAt, msg.createdAt);
                    const grouped = prev && sameDay(prev.createdAt, msg.createdAt) && isFromMe(prev, ctx) === mine;
                    return (
                      <div key={msg.id}>
                        {newDay && (
                          <div className="my-4 flex justify-center">
                            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                              {dayLabel(msg.createdAt)}
                            </span>
                          </div>
                        )}
                        {mine && !grouped && (
                          <p className="mb-1 mt-3 text-[11px] font-semibold text-muted-foreground">
                            You
                          </p>
                        )}
                        <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                              mine
                                ? "rounded-br-sm bg-primary text-primary-foreground"
                                : "rounded-bl-sm bg-muted text-foreground"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                            <div
                              className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                                mine ? "text-primary-foreground/70" : "text-muted-foreground"
                              }`}
                            >
                              <span>
                                {new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {mine &&
                                (msg.readAt ? (
                                  <CheckCheck className="h-3.5 w-3.5" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              {/* Composer */}
              <div className="border-t p-3">
                {canSendAs && branches.length > 0 && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      As
                    </span>
                    <Select value={sendAsStore} onValueChange={setSendAsStore}>
                      <SelectTrigger className="h-8 bg-background text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__self__">Myself (executive)</SelectItem>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.store_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Type a message…"
                    className="rounded-full"
                  />
                  <Button
                    size="icon"
                    className="shrink-0 rounded-full"
                    onClick={() => void send()}
                    disabled={!draft.trim()}
                    title="Send"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* Conversation list */
            <ScrollArea className="flex-1">
              {conversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No conversations yet</p>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    {messages.length
                      ? "All of your chats are deleted. A new message will bring one back."
                      : "Start a conversation with a branch or another executive."}
                  </p>
                  {!composing && branches.length + execUsers.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setComposing(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      New chat
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((conversation) => {
                    const mine = isFromMe(conversation.lastMessage, ctx);
                    return (
                      <div
                        key={conversation.key}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                      >
                        <button
                          type="button"
                          onClick={() => setActiveKey(conversation.key)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarTone(conversation.key)}`}
                          >
                            {initials(conversation.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                                {conversation.name}
                              </span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {listTime(conversation.lastAt)}
                              </span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                                {mine ? "You: " : ""}
                                {conversation.lastMessage.message}
                              </span>
                              {conversation.unread > 0 && (
                                <Badge
                                  variant="destructive"
                                  className="h-5 min-w-5 shrink-0 justify-center p-1 text-[10px]"
                                >
                                  {conversation.unread > 9 ? "9+" : conversation.unread}
                                </Badge>
                              )}
                            </span>
                          </span>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              title={`Options for ${conversation.name}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setPendingDelete(conversation)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete chat
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                  <div ref={listEndRef} />
                </div>
              )}
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
