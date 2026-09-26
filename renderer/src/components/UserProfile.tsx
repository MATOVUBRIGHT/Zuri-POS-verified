import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShift } from "@/providers/ShiftProvider";
import { useToast } from "@/hooks/use-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { LogOut, Store as StoreIcon, Clock, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { UserProfile as UserProfileType } from "@/types";
import { playSuccess } from "@/lib/sounds";

interface UserProfileProps {
    onPageChange: (page: string) => void;
    userRole?: string;
}

const UserProfile = ({ onPageChange, userRole = "owner" }: UserProfileProps) => {
    const [profile, setProfile] = useState<UserProfileType | null>(null);
    const [showEndShiftModal, setShowEndShiftModal] = useState(false);
    const [endingCash, setEndingCash] = useState(() => {
      try {
        return localStorage.getItem('userprofile_endingCash') || '';
      } catch {
        return '';
      }
    }); 
    const navigate = useNavigate();
    const { activeShift, endShift } = useShift();
    const { toast } = useToast();

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("user_id", user.id)
                    .maybeSingle();
                setProfile(data);
            }
        };
        fetchProfile();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/auth");
    };

    if (!profile) return null;

    return (
        <>
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full border-2 border-primary/20 p-0 overflow-hidden hover:border-primary/50 transition-all">
                    <Avatar className="h-full w-full">
                        <AvatarImage src={profile.avatar_url} alt={profile.full_name || "User"} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                            {profile.full_name ? profile.full_name.substring(0, 2).toUpperCase() : <Settings size={20} />}
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{profile.full_name || "Staff Member"}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {profile.id ? "ID: " + profile.id.slice(0, 8) : "Active Profile"}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onPageChange("settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPageChange("stores")}>
                    <StoreIcon className="mr-2 h-4 w-4" />
                    <span>My Stores</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {activeShift && (
                  <DropdownMenuItem 
                    onClick={() => setShowEndShiftModal(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    <span>End Shift</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {userRole !== "cashier" && (
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>

        {/* End Shift Modal */}
        <Dialog open={showEndShiftModal} onOpenChange={setShowEndShiftModal}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Clock className="w-6 h-6 text-destructive" />
                End Current Shift
              </DialogTitle>
              <DialogDescription>
                Enter your closing cash balance to complete the shift.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="endingCash">Actual Closing Cash (UGX)</Label>
                <Input
                  id="endingCash"
                  type="number"
                  placeholder="Enter actual cash in drawer"
                  value={endingCash}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEndingCash(value);
                    try {
                      localStorage.setItem('userprofile_endingCash', value);
                    } catch {}
                  }}
                  autoFocus
                  className="text-lg font-mono"
                /> 
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setShowEndShiftModal(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                className="w-full flex items-center gap-2" 
                onClick={async () => {
                  const cash = parseFloat(endingCash);
                  if (isNaN(cash) || cash < 0) {
                    toast({ title: "Invalid Amount", description: "Please enter a valid ending cash amount", variant: "destructive" });
                    return;
                  }
                  try {
                    const result = await endShift(cash);
                    setShowEndShiftModal(false);
                    setEndingCash("");
                    try {
                      localStorage.removeItem('userprofile_endingCash');
                    } catch {} 
                    playSuccess();
                    
                    toast({
                      title: "Shift Ended Successfully",
                      description: `Closing: UGX ${result.actual.toLocaleString()} | Expected: UGX ${result.expected.toLocaleString()} | Diff: UGX ${result.discrepancy.toLocaleString()}`,
                      duration: 5000
                    });
                  } catch (error) {
                    toast({
                      title: "Error Ending Shift",
                      description: "Failed to end shift. Please try again.",
                      variant: "destructive"
                    });
                  }
                }}
              >
                Confirm End Shift
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
    );
};

export default UserProfile;
