/**
 * Shared chat helpers for the executive and branch chat panels.
 *
 * Both UIs read from different tables (`executive_messages` and
 * `branch_messages`) with different column names, so each panel normalises its
 * rows into `ChatMessage` first and then shares everything below. That keeps
 * conversation grouping, unread counting, and time formatting identical between
 * the two panels instead of drifting apart.
 */

export type ChatMessage = {
  id: string;
  senderUserId: string | null;
  senderStoreId: string | null;
  recipientUserId: string | null;
  recipientStoreId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type PeerScope = "user" | "store";
export type PeerKey = `${PeerScope}:${string}`;

export type ChatContext = {
  myUserId: string;
  myStoreIds: Set<string>;
  nameForUser: (id: string) => string;
  nameForStore: (id: string) => string;
};

export type Conversation = {
  key: PeerKey;
  scope: PeerScope;
  peerId: string;
  name: string;
  lastMessage: ChatMessage;
  lastAt: string;
  unread: number;
  /** Ascending by createdAt, ready to render as a thread. */
  messages: ChatMessage[];
};

export type ChatDeletion = {
  scope: string;
  peer_id: string;
  deleted_at: string;
};

/** Did this message land in one of my inboxes (rather than leaving one)? */
export function isToMe(msg: ChatMessage, ctx: ChatContext): boolean {
  if (msg.recipientUserId === ctx.myUserId) return true;
  return Boolean(
    msg.recipientStoreId && ctx.myStoreIds.has(msg.recipientStoreId),
  );
}

export function isFromMe(msg: ChatMessage, ctx: ChatContext): boolean {
  if (msg.senderUserId === ctx.myUserId) return true;
  return Boolean(msg.senderStoreId && ctx.myStoreIds.has(msg.senderStoreId));
}

/**
 * The counterpart of a message, i.e. the thread it belongs to.
 *
 * Prefers the recipient side and falls back to the sender side, which is what
 * makes "send as branch" and broadcast rows resolve correctly. Returns null
 * when a message has no counterpart outside my own account (should not happen,
 * but we skip rather than render a broken row).
 */
export function peerOf(
  msg: ChatMessage,
  ctx: ChatContext,
): { scope: PeerScope; id: string } | null {
  if (msg.recipientUserId && msg.recipientUserId !== ctx.myUserId) {
    return { scope: "user", id: msg.recipientUserId };
  }
  if (msg.recipientStoreId && !ctx.myStoreIds.has(msg.recipientStoreId)) {
    return { scope: "store", id: msg.recipientStoreId };
  }
  if (msg.senderUserId && msg.senderUserId !== ctx.myUserId) {
    return { scope: "user", id: msg.senderUserId };
  }
  if (msg.senderStoreId && !ctx.myStoreIds.has(msg.senderStoreId)) {
    return { scope: "store", id: msg.senderStoreId };
  }
  return null;
}

export function peerKey(scope: PeerScope, id: string): PeerKey {
  return `${scope}:${id}`;
}

/**
 * Group messages into one conversation per counterpart, newest first.
 */
export function buildConversations(
  messages: ChatMessage[],
  ctx: ChatContext,
): Conversation[] {
  const byKey = new Map<PeerKey, ChatMessage[]>();

  for (const msg of messages) {
    const peer = peerOf(msg, ctx);
    if (!peer) continue;
    const key = peerKey(peer.scope, peer.id);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(msg);
    else byKey.set(key, [msg]);
  }

  const conversations: Conversation[] = [];

  byKey.forEach((bucket, key) => {
    const [scope, peerId] = key.split(":", 2) as [PeerScope, string];
    const sorted = [...bucket].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
    const last = sorted[sorted.length - 1];
    conversations.push({
      key,
      scope,
      peerId,
      name:
        scope === "store"
          ? ctx.nameForStore(peerId)
          : ctx.nameForUser(peerId),
      lastMessage: last,
      lastAt: last.createdAt,
      unread: sorted.filter((m) => !m.readAt && isToMe(m, ctx)).length,
      messages: sorted,
    });
  });

  return conversations.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

/**
 * Drop threads the user deleted. A thread comes back on its own once a message
 * newer than the marker arrives, matching WhatsApp — no extra write required.
 */
export function applyDeletions(
  conversations: Conversation[],
  deletions: ChatDeletion[],
): Conversation[] {
  if (!deletions.length) return conversations;
  const marks = new Map<string, string>();
  for (const d of deletions) {
    marks.set(peerKey(d.scope as PeerScope, d.peer_id), d.deleted_at);
  }
  return conversations.filter((c) => {
    const deletedAt = marks.get(c.key);
    if (!deletedAt) return true;
    return c.lastAt > deletedAt;
  });
}

/* ── time formatting ────────────────────────────────────────────────────── */

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today" / "Yesterday" / "12 Mar" — used for thread date dividers. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Compact stamp for a conversation row: time today, weekday this week, else date. */
export function listTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return clock(iso);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** True when two messages belong on the same side of a date divider. */
export function sameDay(a: string, b: string) {
  return dayLabel(a) === dayLabel(b);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic avatar tint so the same peer keeps the same colour. */
export function avatarTone(key: string): string {
  const tones = [
    "bg-emerald-100 text-emerald-700",
    "bg-sky-100 text-sky-700",
    "bg-amber-100 text-amber-700",
    "bg-violet-100 text-violet-700",
    "bg-rose-100 text-rose-700",
    "bg-teal-100 text-teal-700",
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100_000;
  }
  return tones[hash % tones.length];
}
