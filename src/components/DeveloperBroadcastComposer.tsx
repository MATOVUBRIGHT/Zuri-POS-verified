import { useState } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DeveloperBroadcastComposer() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const send = async () => {
    if (!message.trim()) return;
    const channel = supabase.channel("developer-broadcasts");
    await channel.subscribe();
    await channel.send({ type: "broadcast", event: "information", payload: { title: title.trim() || "Information", message: message.trim() } });
    await supabase.removeChannel(channel);
    setTitle(""); setMessage(""); setSent(true); window.setTimeout(() => setSent(false), 2500);
  };
  return <Card className="rounded-2xl border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-emerald-700" />Broadcast information popup</CardTitle></CardHeader><CardContent className="space-y-3"><Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} /><Input placeholder="Message for signed-in users" value={message} onChange={(e) => setMessage(e.target.value)} /><Button onClick={() => void send()} disabled={!message.trim()}>Send popup</Button>{sent && <span className="ml-3 text-sm text-emerald-700">Broadcast sent.</span>}</CardContent></Card>;
}
