/**
 * StoreChat — branch-to-branch chat panel.
 *
 * Storage: `branch_messages`, which is addressed to stores rather than users,
 * so every row has a `sender_store_id` and a `recipient_store_id`. A user may
 * act as any branch they are permitted for; the "inbox" selector switches that
 * context, and the conversation list is scoped to it — the same idea as
 * switching accounts in a multi-account messenger.
 *
 * Deleting a chat writes a per-user marker to `chat_deletions` and never
 * removes message rows. Grouping and formatting are shared with ExecChat.
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
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  applyDeletions,
  avatarTone,
  buildConversations,
  createDraftConversation,
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
  type PeerKey,
} from "@/lib/chat";

type Branch = { id: string; store_name: string };
type ExecContact = { id: string; display_name: string; role: string };
type ChatAlert = { fromLabel: string; text: string };
type BranchRow = {
  id: string;
  sender_id: string;
  sender_store_id: string;
  recipient_store_id: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type Msg = {
  id: string;
  sender_id: string;
  sender_store_id: string;
  recipient_store_id: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

/** Messages are addressed to stores; RLS, rather than this picker, enforces every access decision. */
export default function StoreChat({
  currentStoreId: selectedStoreId,
}: {
  currentStoreId?: string | null;
}) {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [contextStoreId, setContextStoreId] = useState<string | null>(
    selectedStoreId || null,
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [execContacts, setExecContacts] = useState<ExecContact[]>([]);
  const [alert, setAlert] = useState<ChatAlert | null>(null);
  const [typingAlert, setTypingAlert] = useState<{ fromLabel: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deletions, setDeletions] = useState<ChatDeletion[]>([]);
  const [target, setTarget] = useState("");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draftPeerKey, setDraftPeerKey] = useState<PeerKey | null>(null);
  const [composing, setComposing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const knownMessageIds = useRef(new Set<string>());
  const bottomRef = useRef<HTMLDivElement>(null);
  const signalChannelRef = useRef<any>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [{ data: owned }, { data: access }] = await Promise.all([
      supabase.from("stores").select("id, store_name").eq("user_id", user.id),
      supabase
        .from("store_access")
        .select("stores(id, store_name)")
        .eq("user_id", user.id),
    ]);
    const permitted = Array.from(
      new Map(
        [
          ...(owned || []),
          ...(access || []).map((item: any) => item.stores).filter(Boolean),
        ].map((branch: Branch) => [branch.id, branch]),
      ).values(),
    ) as Branch[];
    setBranches(permitted);
    const preferred =
      selectedStoreId && permitted.some((s) => s.id === selectedStoreId)
        ? selectedStoreId
        : contextStoreId && permitted.some((s) => s.id === contextStoreId)
          ? contextStoreId
          : permitted[0]?.id || null;
    setContextStoreId(preferred);
    if (!preferred) {
      setMessages([]);
      return;
    }

    const { data: del } = await supabase
      .from("chat_deletions")
      .select("scope, peer_id, deleted_at")
      .eq("user_id", user.id);
    setDeletions((del || []) as ChatDeletion[]);

    const [{ data: branchRows, error: branchError }, { data: executiveRows, error: executiveError }] = await Promise.all([
      (supabase as any)
        .from("branch_messages")
        .select("*")
        .or(`recipient_store_id.eq.${preferred},sender_store_id.eq.${preferred}`)
        .order("created_at", { ascending: false })
        .limit(200),
      (supabase as any)
        .from("executive_messages")
        .select("*")
        .or(`recipient_store_id.eq.${preferred},sender_store_id.eq.${preferred},recipient_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (!branchError || !executiveError) {
      const branchMessages = !branchError ? ((branchRows || []) as BranchRow[]).map((row): ChatMessage => ({
        id: row.id,
        senderUserId: row.sender_id,
        senderStoreId: row.sender_store_id,
        recipientUserId: null,
        recipientStoreId: row.recipient_store_id,
        message: row.message,
        readAt: row.read_at,
        createdAt: row.created_at,
      })) : [];
      const executiveMessages = !executiveError ? (executiveRows || []).map((row: any): ChatMessage => ({
        id: row.id,
        senderUserId: row.sender_user_id,
        senderStoreId: row.sender_store_id,
        recipientUserId: row.recipient_user_id,
        recipientStoreId: row.recipient_store_id,
        message: row.message,
        readAt: row.read_at,
        createdAt: row.created_at,
      })) : [];
      const next = [...branchMessages, ...executiveMessages]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      next.forEach((m) => knownMessageIds.current.add(m.id));
      setMessages(next);
    }

    const [{ data: accessContacts }, { data: owner }] = await Promise.all([
      (supabase as any).from("store_access").select("user_id, role").eq("store_id", preferred)
        .in("role", ["owner", "boss", "accountant", "admin"]),
      (supabase as any).from("stores").select("user_id").eq("id", preferred).maybeSingle(),
    ]);
    const contactIds = Array.from(new Set([
      ...(accessContacts || []).map((row: any) => row.user_id),
      owner?.user_id,
    ].filter((id): id is string => Boolean(id && id !== user.id))));
    if (contactIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", contactIds);
      const roleById = new Map((accessContacts || []).map((row: any) => [row.user_id, row.role]));
      setExecContacts((profiles || []).map((profile: any) => ({
        id: profile.user_id,
        display_name: profile.full_name || roleById.get(profile.user_id) || "Executive",
        role: String(roleById.get(profile.user_id) || "Executive"),
      })));
    } else {
      setExecContacts([]);
    }
  }, [contextStoreId, selectedStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!contextStoreId) return;
    const receive = (payload: any) => {
      const message = payload.new as Msg | undefined;
      if (
        message?.recipient_store_id === contextStoreId &&
        message.sender_id !== userId &&
        !knownMessageIds.current.has(message.id)
      ) {
        knownMessageIds.current.add(message.id);
        setAlert({
          fromLabel: branches.find((branch) => branch.id === message.sender_store_id)?.store_name || "Another branch",
          text: message.message.slice(0, 80),
        });
        toast({ title: "New branch message", description: "Open chat to read your new message." });
      }
      void load();
    };
    const channel = supabase
      .channel(`branch-messages-${contextStoreId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "branch_messages",
          filter: `recipient_store_id=eq.${contextStoreId}`,
        },
        receive,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "branch_messages",
          filter: `sender_store_id=eq.${contextStoreId}`,
        },
        () => void load(),
      )
      .subscribe();
    const executiveChannel = supabase
      .channel(`executive-messages-${contextStoreId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "executive_messages",
          filter: `recipient_store_id=eq.${contextStoreId}`,
        },
        (payload: any) => {
          const message = payload?.new;
          if (message?.recipient_store_id === contextStoreId && message.sender_user_id !== userId) {
            setAlert({
              fromLabel: execContacts.find((contact) => contact.id === message.sender_user_id)?.display_name || "Executive",
              text: String(message.message || "").slice(0, 80),
            });
          }
          void load();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "executive_messages",
          filter: `sender_store_id=eq.${contextStoreId}`,
        },
        () => void load(),
      )
      .subscribe();
    const signalChannel = (supabase as any)
      .channel("branch-chat-global")
      .on("broadcast", { event: "typing" }, (payload: any) => {
        const signal = payload?.payload;
        if (!signal || signal.senderId === userId || !signal.isTyping) {
          if (signal?.senderId !== userId) setTypingAlert(null);
          return;
        }
        const recipientMatches = signal.recipientUserId === userId
          || signal.recipientStoreId === contextStoreId;
        if (!recipientMatches) return;
        const fromLabel = branches.find((branch) => branch.id === signal.senderStoreId)?.store_name
          || execContacts.find((contact) => contact.id === signal.senderId)?.display_name
          || "Someone";
        setTypingAlert({ fromLabel });
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTypingAlert(null), 2200);
      })
      .subscribe();
    signalChannelRef.current = signalChannel;
    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(executiveChannel);
      signalChannelRef.current = null;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      void supabase.removeChannel(signalChannel);
    };
  }, [contextStoreId, load, toast, userId, branches, execContacts]);

  /* ── derived ──────────────────────────────────────────────────────────── */

  const ctx: ChatContext = useMemo(
    () => ({
      myUserId: userId || "",
      // Only the inbox branch counts as "mine", so every other branch resolves
      // as the counterpart for that thread.
      myStoreIds: new Set(contextStoreId ? [contextStoreId] : []),
      nameForUser: (id) => execContacts.find((contact) => contact.id === id)?.display_name || "Executive",
      nameForStore: (id) =>
        branches.find((branch) => branch.id === id)?.store_name || "Assigned branch",
    }),
    [userId, contextStoreId, branches, execContacts],
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
    () => {
      const existing = conversations.find((c) => c.key === activeKey);
      if (existing) return existing;
      if (!draftPeerKey) return null;
      const [scope, peerId] = draftPeerKey.split(":", 2) as ["user" | "store", string];
      return createDraftConversation(draftPeerKey, scope === "user" ? ctx.nameForUser(peerId) : branchName(peerId));
    },
    [conversations, activeKey, draftPeerKey, branches, ctx],
  );

  const recipients = useMemo(
    () => branches.filter((branch) => branch.id !== contextStoreId),
    [branches, contextStoreId],
  );

  const targets = useMemo(
    () =>
      target === "all"
        ? recipients
        : recipients.filter((branch) => branch.id === target),
    [recipients, target],
  );

  const canSend = Boolean(active && (active.scope === "user" || targets.length));

  const unreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  /* ── read receipts ────────────────────────────────────────────────────── */

  const markRead = useCallback(
    async (conversation: Conversation) => {
      const unread = conversation.messages
        .filter((m) => !m.readAt && isToMe(m, ctx))
        .map((m) => m.id);
      if (!unread.length) return;
      const stamp = new Date().toISOString();
      const table = conversation.scope === "user" ? "executive_messages" : "branch_messages";
      const { error } = await (supabase as any)
        .from(table)
        .update({ read_at: stamp })
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
        prev.map((m) => (unread.includes(m.id) ? { ...m, readAt: stamp } : m)),
      );
    },
    [ctx, toast],
  );

  useEffect(() => {
    if (open && active) void markRead(active);
  }, [open, active, markRead]);

  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  }, [messages, open]);

  /* ── actions ──────────────────────────────────────────────────────────── */

  const send = async () => {
    if (!draft.trim() || !userId || !contextStoreId || !active) return;
    if (active.scope === "user") {
      const { error } = await (supabase as any).from("executive_messages").insert({
        sender_user_id: userId,
        sender_store_id: contextStoreId,
        recipient_user_id: active.peerId,
        message: draft.trim(),
      });
      if (error) {
        toast({ title: "Message not sent", description: error.message, variant: "destructive" });
        return;
      }
      void signalChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, isTyping: false } });
      setDraft("");
      toast({ title: "Message sent", description: `Sent to ${active.name}.` });
      void load();
      return;
    }
    if (!targets.length) return;
    const { error } = await (supabase as any)
      .from("branch_messages")
      .insert(
        targets.map((branch) => ({
          sender_id: userId,
          sender_store_id: contextStoreId,
          recipient_store_id: branch.id,
          message: draft.trim(),
        })),
      );
    if (error) {
      toast({ title: "Message not sent", description: error.message, variant: "destructive" });
      return;
    }
    void signalChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, isTyping: false } });
    setDraft("");
    toast({
      title: "Message sent",
      description:
        targets.length > 1
          ? `Sent to ${targets.length} branches.`
          : `Sent to ${targets[0].store_name}.`,
    });
    void load();
  };

  const broadcastTyping = (value: string) => {
    if (!userId || !signalChannelRef.current) return;
    void signalChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        senderId: userId,
        senderStoreId: contextStoreId,
        recipientUserId: active?.scope === "user" ? active.peerId : null,
        recipientStoreId: active?.scope === "store" ? active.peerId : null,
        isTyping: Boolean(value.trim()),
      },
    });
    if (stopTypingTimerRef.current) clearTimeout(stopTypingTimerRef.current);
    stopTypingTimerRef.current = setTimeout(() => {
      void signalChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, isTyping: false } });
    }, 1800);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || !userId) return;
    const target_ = pendingDelete;
    setPendingDelete(null);

    const { error } = await supabase
      .from("chat_deletions")
      .upsert(
        {
          user_id: userId,
          scope: target_.scope,
          peer_id: target_.peerId,
          deleted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,scope,peer_id" },
      );

    if (error) {
      toast({ title: "Could not delete chat", description: error.message, variant: "destructive" });
      return;
    }

    setDeletions((prev) => [
      ...prev.filter(
        (d) => !(d.scope === target_.scope && d.peer_id === target_.peerId),
      ),
      { scope: target_.scope, peer_id: target_.peerId, deleted_at: new Date().toISOString() },
    ]);
    setActiveKey((current) => (current === target_.key ? null : current));
    setDraftPeerKey((current) => (current === target_.key ? null : current));
    toast({
      title: "Chat deleted",
      description: `This conversation with ${target_.name} is hidden for you.`,
    });
  };

  const switchInbox = (value: string) => {
    setContextStoreId(value);
    setActiveKey(null);
    setDraftPeerKey(null);
    setComposing(false);
    setTarget("");
  };

  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.store_name || "Assigned branch";

  /* ── render ───────────────────────────────────────────────────────────── */

  return (
    <>
      {(alert || typingAlert) && (
        <div className="fixed bottom-4 right-4 z-[70] w-[min(22rem,calc(100vw-2rem))] space-y-2">
          {typingAlert && <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg"><span className="font-semibold">{typingAlert.fromLabel}</span> is typing…</div>}
          {alert && <div className="rounded-lg border bg-background p-3 shadow-lg"><p className="text-sm font-semibold">New message from {alert.fromLabel}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{alert.text}</p><div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setAlert(null)}>Dismiss</Button><Button size="sm" onClick={() => { setAlert(null); setOpen(true); }}>Open chat</Button></div></div>}
        </div>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Branch communications">
          <MessageSquare className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-5 justify-center p-1 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => !next && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation with {pendingDelete?.name} will be hidden from your chat
              list.{" "}
              {pendingDelete?.unread
                ? `${pendingDelete.unread} unread message(s) included. `
                : ""}
              The other branch keeps its copy, and a new message will bring this chat
              back.
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

      <SheetContent className="flex h-full w-full flex-col p-0 sm:max-w-lg">
        {/* Header doubles as thread header when a thread is open */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          {active && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setActiveKey(null); setDraftPeerKey(null); }}
              title="Back to chats"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base">
              {active ? active.name : "Branch chat"}
            </SheetTitle>
            <SheetDescription className="truncate text-xs">
              {active
                ? `${active.messages.length} message${active.messages.length === 1 ? "" : "s"}`
                : "Chats with the branches you are assigned to."}
            </SheetDescription>
          </div>
          {active ? (
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
          ) : (
            <Button
              variant="ghost"
              size="icon"
              title="New chat"
                onClick={() => { setDraftPeerKey(null); setComposing(true); }}
              disabled={!recipients.length}
            >
              <Plus className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Inbox switcher */}
        {branches.length > 0 && (
          <div className="border-b bg-muted/40 px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Inbox
              </span>
              <Select value={contextStoreId || ""} onValueChange={switchInbox}>
                <SelectTrigger className="h-8 bg-background text-xs">
                  <SelectValue placeholder="Choose an assigned branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* New-chat picker */}
        {composing && !active && (recipients.length > 0 || execContacts.length > 0) && (
          <div className="border-b bg-muted/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Start a conversation
            </p>
            <Select
              onValueChange={(value) => {
                setDraftPeerKey(value as PeerKey);
                setActiveKey(value);
                setTarget(value.split(":", 2)[1]);
                setComposing(false);
              }}
            >
              <SelectTrigger className="mt-2 bg-background">
                <SelectValue placeholder="Choose a branch or executive…" />
              </SelectTrigger>
              <SelectContent>
                {recipients.map((branch) => (
                  <SelectItem key={branch.id} value={peerKey("store", branch.id)}>
                    {branch.store_name}
                  </SelectItem>
                ))}
                {execContacts.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">Executives & accountants</div>
                    {execContacts.map((contact) => (
                      <SelectItem key={contact.id} value={peerKey("user", contact.id)}>
                        {contact.display_name} · {contact.role}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {branches.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No branch assignments yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Branch chat becomes available once a branch is assigned to you.
            </p>
          </div>
        ) : active ? (
          <>
            <ScrollArea className="flex-1">
              <div className="space-y-1 px-4 py-4">
                {active.messages.map((msg, index) => {
                  const mine = isFromMe(msg, ctx);
                  const prev = active.messages[index - 1];
                  const newDay = !prev || !sameDay(prev.createdAt, msg.createdAt);
                  const grouped =
                    prev &&
                    sameDay(prev.createdAt, msg.createdAt) &&
                    isFromMe(prev, ctx) === mine;
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

            {/* Composer — recipient defaults to the open thread */}
            <div className="border-t p-3">
              {active.scope === "store" && recipients.length > 1 && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    To
                  </span>
                  <Select
                    value={target || active.peerId}
                    onValueChange={setTarget}
                  >
                    <SelectTrigger className="h-8 bg-background text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={active.peerId}>
                        {branchName(active.peerId)}
                      </SelectItem>
                      {recipients
                        .filter((b) => b.id !== active.peerId)
                        .map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.store_name}
                          </SelectItem>
                        ))}
                      {recipients.length > 1 && (
                        <SelectItem value="all">
                          All permitted branches ({recipients.length})
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-end gap-2">
                <Input
                  value={draft}
                  onChange={(event) => { setDraft(event.target.value); broadcastTyping(event.target.value); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
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
                  disabled={!draft.trim() || !canSend}
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
                    : "Start a conversation with another branch."}
                </p>
                {!composing && recipients.length > 0 && (
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
                        onClick={() => { setDraftPeerKey(null); setActiveKey(conversation.key); }}
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
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>
      </Sheet>
    </>
  );
}
