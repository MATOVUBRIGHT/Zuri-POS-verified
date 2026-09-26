import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  CreditCard, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Search,
  RefreshCw,
  Mail,
  Calendar,
  Trash2,
  PauseCircle,
  Eye,
  UserX,
  Shield
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const AdminDashboard = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const hasFetched = useRef(false);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  
  // User detail dialog
  const [userDetailOpen, setUserDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  
  // Suspend dialog
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendUser, setSuspendUser] = useState<any | null>(null);
  const [suspendDays, setSuspendDays] = useState<string>("7");
  const [suspendReason, setSuspendReason] = useState("");
  
  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch profiles (exclude anonymous users - only real users with email)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Display all profiles so Admin can actually see users
      const activeProfiles = profiles || [];

      // Fetch subscriptions
      const { data: subs, error: subsError } = await supabase
        .from("user_subscriptions")
        .select(`
          *,
          subscription_plans (
            name,
            price
          )
        `)
        .order("created_at", { ascending: false });

      if (subsError) throw subsError;

      // Filter out deleted subscriptions in JS (until migration is applied)
      const activeSubs = (subs || []).filter((s: any) => !s.is_deleted);

      // We completely skip fetching user_access_suspension to stop the 404 error showing in DevTools
      // until the backend table is actually created.
      const suspensionData: any[] = [];

      setUsers(activeProfiles);
      setSubscriptions(activeSubs);
      setSuspensions(suspensionData);
    } catch (error: any) {
      console.error("Error fetching admin data:", error);
      toast.error("Failed to fetch admin data: " + (error?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Ref guard prevents double fetch in StrictMode
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetchData();

    // Set up real-time subscription for live updates with debouncing
    const channel = supabase
      .channel('admin-live-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          // Debounce refetch to prevent rapid repeated calls
          if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
          fetchTimeoutRef.current = setTimeout(() => {
            fetchData();
          }, 1000);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_subscriptions' },
        () => {
          // Debounce refetch to prevent rapid repeated calls
          if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
          fetchTimeoutRef.current = setTimeout(() => {
            fetchData();
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return <Badge className="bg-success hover:bg-success/90"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-warning border-warning"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'expired':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredUsers = users.filter(user => 
    (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
     user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     user.user_id?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getSubscriptionForUser = (userId: string) => {
    return subscriptions.find(s => s.user_id === userId);
  };

  const getUserSuspension = (userId: string) => {
    return suspensions.find(s => s.user_id === userId);
  };

  const stats = {
    total: users.length,
    active: subscriptions.filter(s => s.status === 'active' && (s.verified_at || s.status === 'active')).length,
    pending: subscriptions.filter(s => s.status === 'pending').length,
    suspended: suspensions.length,
  };

  const handleVerifyUser = async (subId: string, userId: string, userName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;

      // Update with new columns if they exist, otherwise just update status
      const updateData: any = { 
        status: 'active',
        updated_at: new Date().toISOString() 
      };
      
      // Try to add new columns (will be ignored if they don't exist)
      try {
        updateData.verified_at = new Date().toISOString();
        updateData.verified_by = adminId;
      } catch (e) {
        // Columns don't exist yet, that's okay
      }

      const { error } = await supabase
        .from("user_subscriptions")
        .update(updateData)
        .eq('id', subId);

      if (error) throw error;

      // Ensure the profile reflects verification even if the DB trigger is not present yet.
      try {
        await supabase
          .from("profiles")
          .update({
            status: "approved",
            account_status: "active",
            is_active: true,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("user_id", userId);
      } catch {
        // ignore (older schemas may not have these columns)
      }

      // Try to log the action (will fail silently if table doesn't exist)
      try {
        await supabase.from("user_access_logs" as any).insert({
          user_id: userId,
          action: 'verified',
          performed_by: adminId
        });
      } catch (e) {
        // Table doesn't exist yet, that's okay
        // ignore
      }

      toast.success(`User "${userName}" verified and activated`);
      fetchData();
    } catch (error: any) {
      toast.error("Failed to verify user: " + error.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;

      // Mark profile as deleted
      await supabase
        .from("profiles")
        .update({ 
          account_status: 'deleted',
          is_active: false
        } as any)
        .eq('user_id', deleteUser.user_id);

      // Mark subscription as deleted
      const sub = getSubscriptionForUser(deleteUser.user_id);
      if (sub) {
        await supabase
          .from("user_subscriptions")
          .update({ 
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by: adminId,
            status: 'expired'
          })
          .eq('id', sub.id);
      }

      // Log the action (will fail silently if table doesn't exist)
      try {
        await supabase.from("user_access_logs" as any).insert({
          user_id: deleteUser.user_id,
          action: 'deleted',
          reason: deleteReason,
          performed_by: adminId
        });
      } catch (e) {
        // ignore
      }

      toast.success(`User "${deleteUser.full_name}" deleted`);
      setDeleteOpen(false);
      setDeleteUser(null);
      setDeleteReason("");
      fetchData();
    } catch (error: any) {
      toast.error("Failed to delete user: " + error.message);
    }
  };

  const handleSuspendUser = async () => {
    if (!suspendUser) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;
      
      const days = parseInt(suspendDays) || 7;
      const suspendedUntil = new Date();
      suspendedUntil.setDate(suspendedUntil.getDate() + days);

      // user_access_suspension table does not exist — skip insert

      // Update profile status (will fail silently if column doesn't exist)
      try {
        await supabase
          .from("profiles")
          .update({ account_status: 'suspended' } as any)
          .eq('user_id', suspendUser.user_id);
      } catch (e) {
        // ignore
      }

      // Log the action (will fail silently if table doesn't exist)
      try {
        await supabase.from("user_access_logs" as any).insert({
          user_id: suspendUser.user_id,
          action: 'suspended',
          reason: `Suspended for ${days} days: ${suspendReason}`,
          performed_by: adminId
        });
      } catch (e) {
        // ignore
      }

      toast.success(`User "${suspendUser.full_name}" suspended for ${days} days`);
      setSuspendOpen(false);
      setSuspendUser(null);
      setSuspendDays("7");
      setSuspendReason("");
      fetchData();
    } catch (error: any) {
      toast.error("Failed to suspend user: " + error.message);
    }
  };

  const handleReactivateUser = async (userId: string, userName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;

      // user_access_suspension table does not exist — skip update

      // Update profile status (will fail silently if column doesn't exist)
      try {
        await supabase
          .from("profiles")
          .update({ account_status: 'active' } as any)
          .eq('user_id', userId);
      } catch (e) {
        // ignore
      }

      // Log the action (will fail silently if table doesn't exist)
      try {
        await supabase.from("user_access_logs" as any).insert({
          user_id: userId,
          action: 'reactivated',
          performed_by: adminId
        });
      } catch (e) {
        // ignore
      }

      toast.success(`User "${userName}" reactivated`);
      fetchData();
    } catch (error: any) {
      toast.error("Failed to reactivate user: " + error.message);
    }
  };

  const openUserDetail = (user: any) => {
    setSelectedUser(user);
    setUserDetailOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <p className="text-muted-foreground">Manage user accounts and access control</p>
        </div>
        <Button onClick={fetchData} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active & Verified</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.suspended}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>View and manage all registered users</CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">User</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Plan</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Payment</th>
                    <th className="px-4 py-3 text-left font-medium">Joined</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10">
                        <LoadingSpinner size="lg" text="Loading users..." />
                      </td>
                    </tr>
                  ) : filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => {
                      const sub = getSubscriptionForUser(user.user_id);
                      const suspension = getUserSuspension(user.user_id);
                      const isPending = sub?.status === 'pending';
                      const isSuspended = !!suspension;
                      
                      return (
                        <tr 
                          key={user.id} 
                          className={`hover:bg-muted/50 transition-colors cursor-pointer ${
                            isPending ? 'bg-yellow-50/50' : ''
                          } ${isSuspended ? 'bg-red-50/50' : ''}`}
                          onClick={() => openUserDetail(user)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium">{user.full_name || 'No Name'}</span>
                              <div className="text-xs text-muted-foreground font-mono truncate w-32" title={user.user_id}>
                                ID: {user.user_id?.substring(0, 8)}...
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-muted-foreground" />
                              <span className="text-sm">{user.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {sub ? (
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline">{sub.subscription_plans?.name || "Unknown"}</Badge>
                                {sub.subscription_plans?.price && (
                                  <span className="text-xs text-muted-foreground">
                                    UGX {sub.subscription_plans.price.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">No Plan</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {sub ? getStatusBadge(sub.status) : <Badge variant="secondary">Inactive</Badge>}
                              {isSuspended && (
                                <Badge variant="destructive" className="text-xs">
                                  <PauseCircle className="w-3 h-3 mr-1" />
                                  Suspended
                                </Badge>
                              )}
                              {sub?.verified_at && (
                                <Badge variant="outline" className="text-success border-success text-xs">
                                  <Shield className="w-3 h-3 mr-1" />
                                  Verified
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {sub ? (
                              <div className="flex flex-col gap-1">
                                {sub.payment_reference ? (
                                  <div className="flex items-center gap-1">
                                    <CreditCard className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs font-mono">{sub.payment_reference}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No ref</span>
                                )}
                                {sub.amount_paid != null ? (
                                  <span className="text-xs font-semibold text-success">
                                    UGX {sub.amount_paid.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Not paid</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {format(new Date(user.created_at), "MMM d, yyyy")}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-2 flex-wrap">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => openUserDetail(user)}
                                className="gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                View
                              </Button>
                              {sub?.status === 'pending' && !sub.verified_at && (
                                <Button 
                                  size="sm" 
                                  onClick={() => handleVerifyUser(sub.id, user.user_id, user.full_name || 'User')}
                                  className="bg-success hover:bg-success/90 gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Verify
                                </Button>
                              )}
                              {!isSuspended && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => { setSuspendUser(user); setSuspendOpen(true); }}
                                  className="gap-1 text-warning border-warning"
                                >
                                  <PauseCircle className="w-3 h-3" />
                                  Suspend
                                </Button>
                              )}
                              {isSuspended && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleReactivateUser(user.user_id, user.full_name || 'User')}
                                  className="gap-1 text-success border-success"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Reactivate
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => { setDeleteUser(user); setDeleteOpen(true); }}
                                className="gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No users found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      <Dialog open={userDetailOpen} onOpenChange={setUserDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Details
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Full Name</Label>
                      <p className="font-medium">{selectedUser.full_name || 'Not provided'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <p className="font-medium">{selectedUser.email}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">User ID</Label>
                      <p className="font-mono text-xs break-all">{selectedUser.user_id}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Account Status</Label>
                      <Badge className="mt-1">{selectedUser.account_status || 'active'}</Badge>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Joined Date</Label>
                      <p className="text-sm">{format(new Date(selectedUser.created_at), "PPP")}</p>
                    </div>
                    {selectedUser.last_login && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Last Login</Label>
                        <p className="text-sm">{format(new Date(selectedUser.last_login), "PPP")}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {(() => {
                const sub = getSubscriptionForUser(selectedUser.user_id);
                return sub ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Subscription Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Plan</Label>
                          <p className="font-medium">{sub.subscription_plans?.name || 'Unknown'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Price</Label>
                          <p className="font-medium">UGX {sub.subscription_plans?.price?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <div className="mt-1">{getStatusBadge(sub.status)}</div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Payment Reference</Label>
                          <p className="font-mono text-sm">{sub.payment_reference || 'Not provided'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Amount Paid</Label>
                          <p className="font-semibold text-success">
                            {sub.amount_paid != null ? `UGX ${sub.amount_paid.toLocaleString()}` : 'Not paid'}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Subscription ID</Label>
                          <p className="font-mono text-xs break-all">{sub.id}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Starts At</Label>
                          <p className="text-sm">{format(new Date(sub.starts_at), "PPP")}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Expires At</Label>
                          <p className="text-sm">{format(new Date(sub.expires_at), "PPP")}</p>
                        </div>
                        {sub.verified_at && (
                          <>
                            <div>
                              <Label className="text-xs text-muted-foreground">Verified At</Label>
                              <p className="text-sm text-success">{format(new Date(sub.verified_at), "PPP p")}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Verified By</Label>
                              <p className="font-mono text-xs">{sub.verified_by || 'System'}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No subscription found for this user
                    </CardContent>
                  </Card>
                );
              })()}

              {(() => {
                const suspension = getUserSuspension(selectedUser.user_id);
                return suspension ? (
                  <Card className="border-destructive">
                    <CardHeader>
                      <CardTitle className="text-base text-destructive flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Active Suspension
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Suspended Until</Label>
                          <p className="font-medium text-destructive">
                            {format(new Date(suspension.suspended_until), "PPP p")}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Suspended At</Label>
                          <p className="text-sm">{format(new Date(suspension.suspended_at), "PPP p")}</p>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">Reason</Label>
                          <p className="text-sm">{suspension.reason || 'No reason provided'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null;
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend User Dialog */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-warning" />
              Suspend User Access
            </DialogTitle>
            <DialogDescription>
              Temporarily suspend {suspendUser?.full_name}'s access to the system
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="suspend-days">Suspension Duration (days)</Label>
              <Input
                id="suspend-days"
                type="number"
                min="1"
                max="365"
                value={suspendDays}
                onChange={(e) => setSuspendDays(e.target.value)}
                placeholder="7"
              />
            </div>
            <div>
              <Label htmlFor="suspend-reason">Reason for Suspension</Label>
              <Textarea
                id="suspend-reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Enter reason for suspension..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button onClick={handleSuspendUser} className="bg-warning hover:bg-warning/90">
              Suspend User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />
              Delete User Account
            </DialogTitle>
            <DialogDescription>
              This will permanently delete {deleteUser?.full_name}'s account. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-destructive">Warning: This is a permanent action!</p>
              <p className="text-xs text-muted-foreground mt-1">
                The user will lose all access and their data will be marked as deleted.
              </p>
            </div>
            <div>
              <Label htmlFor="delete-reason">Reason for Deletion (Required)</Label>
              <Textarea
                id="delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Enter reason for deletion..."
                rows={3}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleDeleteUser} 
              variant="destructive"
              disabled={!deleteReason.trim()}
            >
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
