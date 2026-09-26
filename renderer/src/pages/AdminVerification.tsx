import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield, Users, CheckCircle2, XCircle, Clock, AlertTriangle,
  Search, RefreshCw, LogOut, Loader2, Eye, Ban, MessageSquare,
  Activity, Calendar
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { UserSubscription, Category } from "@/types";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
}

interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  ip_address: string | null;
  device: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface AdminLog {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

import { LoadingSpinner, InlineSpinner } from "@/components/ui/loading-spinner";

const AdminVerification = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userActivity, setUserActivity] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; action: string; user: UserProfile | null }>({
    open: false, action: "", user: null
  });
  const [adminId, setAdminId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Auth guard
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin-login", { replace: true });
        return;
      }
      const { data: isAdmin } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'admin'
      });
      if (!isAdmin) {
        navigate("/admin-login", { replace: true });
        return;
      }
      setAdminId(session.user.id);
    };
    checkAdmin();
  }, [navigate]);

  const fetchUsers = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        // Select only what we need for faster loads.
        .select("id, user_id, full_name, phone, status, created_at, updated_at, avatar_url")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setUsers((data as unknown as UserProfile[]) || []);
    } catch (error: unknown) {
      toast.error("Failed to fetch users: " + ((error as Error)?.message || String(error)));
    } finally {
      setLoading(false);
    }
  }, [adminId, page]);

  const fetchAdminLogs = useCallback(async () => {
    if (!adminId) return;
    try {
      const { data } = await supabase
        .from("admin_action_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setAdminLogs((data as unknown as AdminLog[]) || []);
    } catch {
      // ignore
    }
  }, [adminId]);

  useEffect(() => {
    if (adminId) {
      fetchUsers();
      fetchAdminLogs();
    }
  }, [adminId, fetchUsers, fetchAdminLogs]);

  const fetchUserActivity = async (userId: string) => {
    setActivityLoading(true);
    try {
      const { data } = await supabase
        .from("user_activity")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      setUserActivity((data as unknown as ActivityLog[]) || []);
    } catch {
      setUserActivity([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const handleViewProfile = (user: UserProfile) => {
    setSelectedUser(user);
    fetchUserActivity(user.user_id);
  };

  const handleAction = async (action: string, user: UserProfile) => {
    if (!adminId) return;

    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      suspend: "suspended",
      request_info: "pending_verification",
    };

    const newStatus = statusMap[action];
    if (!newStatus) return;

    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({
          status: newStatus,
          // keep profile flags in sync when present
          account_status: action === "suspend" ? "suspended" : action === "approve" ? "active" : undefined,
          is_active: action === "approve" ? true : action === "suspend" ? false : undefined,
          updated_at: nowIso,
        } as unknown as UserProfile)
        .eq("user_id", user.user_id);

      if (error) throw error;

      // Keep subscription verification in sync (if subscriptions exist).
      if (action === "approve") {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const adminUserId = session?.user?.id || null;

          const { data: subs } = await supabase
            .from("user_subscriptions")
            .select("id, status, verified_at")
            .eq("user_id", user.user_id)
            .order("created_at", { ascending: false })
            .limit(1);

          const sub = (subs?.[0] as unknown as UserSubscription | undefined);
          if (sub?.id) {
            await supabase
              .from("user_subscriptions")
              .update({
                status: "active",
                verified_at: nowIso,
                verified_by: adminUserId,
                updated_at: nowIso,
              } as unknown as { user_id: string })
              .eq("id", sub.id);
          }
        } catch {
          // ignore
        }
      }

      // Log admin action
      await supabase.from("admin_action_logs").insert({
        admin_id: adminId,
        action: `user_${action}`,
        target_user_id: user.user_id,
        details: {
          user_name: user.full_name,
          old_status: user.status,
          new_status: newStatus,
          timestamp: nowIso,
        },
      });

      toast.success(`User ${user.full_name || user.user_id} ${action}ed successfully`);
      setActionDialog({ open: false, action: "", user: null });
      fetchUsers();
      fetchAdminLogs();
    } catch (error: unknown) {
      toast.error("Action failed: " + ((error as Error)?.message || String(error)));
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { className: string; icon: React.ReactNode; label: string }> = {
      pending_verification: { className: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: <Clock className="w-3 h-3" />, label: "Pending" },
      approved: { className: "bg-green-500/10 text-green-600 border-green-500/20", icon: <CheckCircle2 className="w-3 h-3" />, label: "Approved" },
      rejected: { className: "bg-red-500/10 text-red-600 border-red-500/20", icon: <XCircle className="w-3 h-3" />, label: "Rejected" },
      suspended: { className: "bg-muted text-muted-foreground border-muted", icon: <Ban className="w-3 h-3" />, label: "Suspended" },
    };
    const c = config[status] || config.pending_verification;
    return (
      <Badge variant="outline" className={`gap-1 ${c.className}`}>
        {c.icon} {c.label}
      </Badge>
    );
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !searchQuery ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.phone?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: users.length,
    pending: users.filter((u) => u.status === "pending_verification").length,
    approved: users.filter((u) => u.status === "approved").length,
    rejected: users.filter((u) => u.status === "rejected").length,
    suspended: users.filter((u) => u.status === "suspended").length,
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login", { replace: true });
  };

  if (loading && !adminId) {
    return <LoadingSpinner size="xl" fullScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">User Verification Portal</h1>
              <p className="text-xs text-muted-foreground">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchUsers(); fetchAdminLogs(); }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Users className="h-6 w-6 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </CardContent>
          </Card>
          <Card className="border-orange-500/30">
            <CardContent className="pt-4 pb-3 text-center">
              <Clock className="h-6 w-6 mx-auto text-orange-500 mb-1" />
              <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/30">
            <CardContent className="pt-4 pb-3 text-center">
              <CheckCircle2 className="h-6 w-6 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </CardContent>
          </Card>
          <Card className="border-red-500/30">
            <CardContent className="pt-4 pb-3 text-center">
              <XCircle className="h-6 w-6 mx-auto text-red-500 mb-1" />
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Ban className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{stats.suspended}</p>
              <p className="text-xs text-muted-foreground">Suspended</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="audit">Admin Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, ID, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending_verification">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Users Table */}
            <Card>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10">
                          <LoadingSpinner size="md" />
                        </TableCell>
                      </TableRow>
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{user.full_name || "Unnamed"}</p>
                              <p className="text-xs text-muted-foreground font-mono">{user.user_id.slice(0, 8)}...</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{user.phone || "&mdash;"}</TableCell>
                          <TableCell>{getStatusBadge(user.status)}</TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(user.created_at), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <Button size="sm" variant="ghost" onClick={() => handleViewProfile(user)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {user.status === "pending_verification" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                                    onClick={() => setActionDialog({ open: true, action: "approve", user })}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 text-xs"
                                    onClick={() => setActionDialog({ open: true, action: "reject", user })}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              {user.status === "approved" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => setActionDialog({ open: true, action: "suspend", user })}
                                >
                                  Suspend
                                </Button>
                              )}
                              {user.status !== "pending_verification" && user.status !== "approved" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => setActionDialog({ open: true, action: "approve", user })}
                                >
                                  Reactivate
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
              {/* Pagination */}
              <div className="flex items-center justify-between p-4 border-t">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button variant="outline" size="sm" disabled={users.length < PAGE_SIZE} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" /> Admin Action Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {adminLogs.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">No admin actions logged yet</p>
                    ) : (
                      adminLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{log.action.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                            {log.details?.user_name && (
                              <p className="text-xs text-muted-foreground">
                                User: {String(log.details.user_name)} | {String(log.details.old_status)} &rarr; {String(log.details.new_status)}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              <Calendar className="inline h-3 w-3 mr-1" />
                              {format(new Date(log.created_at), "dd MMM yyyy HH:mm")}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* User Profile Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Full Name</p>
                  <p className="font-medium">{selectedUser.full_name || "&mdash;"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedUser.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">User ID</p>
                  <p className="font-mono text-xs break-all">{selectedUser.user_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedUser.phone || "&mdash;"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Registered</p>
                  <p>{format(new Date(selectedUser.created_at), "dd MMM yyyy HH:mm")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Updated</p>
                  <p>{format(new Date(selectedUser.updated_at), "dd MMM yyyy HH:mm")}</p>
                </div>
              </div>

              {/* Activity Timeline */}
              <div>
                <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Activity Timeline
                </h4>
                <ScrollArea className="h-[200px]">
                  {activityLoading ? (
                    <LoadingSpinner size="sm" />
                  ) : userActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No activity recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {userActivity.map((activity) => (
                        <div key={activity.id} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/50">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div>
                            <p className="font-medium">{activity.action}</p>
                            <p className="text-muted-foreground">
                              {format(new Date(activity.created_at), "dd MMM yyyy HH:mm")}
                              {activity.device && ` &bull; ${activity.device}`}
                              {activity.ip_address && ` &bull; IP: ${activity.ip_address}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <DialogFooter className="gap-2">
                {selectedUser.status !== "approved" && (
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleAction("approve", selectedUser)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                )}
                {selectedUser.status !== "suspended" && (
                  <Button variant="outline" onClick={() => handleAction("suspend", selectedUser)}>
                    <Ban className="h-4 w-4 mr-1" /> Suspend
                  </Button>
                )}
                {selectedUser.status !== "rejected" && (
                  <Button variant="destructive" onClick={() => handleAction("reject", selectedUser)}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => !open && setActionDialog({ open: false, action: "", user: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirm {actionDialog.action.replace(/\b\w/g, l => l.toUpperCase())}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to <strong>{actionDialog.action}</strong> user{" "}
            <strong>{actionDialog.user?.full_name || actionDialog.user?.user_id}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, action: "", user: null })}>
              Cancel
            </Button>
            <Button
              variant={actionDialog.action === "reject" || actionDialog.action === "suspend" ? "destructive" : "default"}
              onClick={() => actionDialog.user && handleAction(actionDialog.action, actionDialog.user)}
            >
              Confirm {actionDialog.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVerification;
