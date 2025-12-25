import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek } from "date-fns";

interface TemplateExceptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateTitle: string;
  weekStart: Date;
  onExceptionCreated?: () => void;
}

export default function TemplateExceptionDialog({
  open,
  onOpenChange,
  templateId,
  templateTitle,
  weekStart,
  onExceptionCreated,
}: TemplateExceptionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Calculate week start (Monday)
      const weekStartDate = format(startOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd");

      const { error } = await (supabase as any).rpc("create_template_exception", {
        p_template_id: templateId,
        p_week_start_date: weekStartDate,
        p_reason: reason.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Class cancelled",
        description: `This class has been cancelled for the week of ${weekStartDate}. The slot is now free for booking.`,
      });

      onExceptionCreated?.();
      onOpenChange(false);
      setReason("");
    } catch (error: any) {
      console.error("Error creating exception:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel class for this week",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const weekStartDateObj = startOfWeek(weekStart, { weekStartsOn: 1 });
  const weekStartDate = format(weekStartDateObj, "MMMM d, yyyy");
  const weekEndDate = format(
    new Date(weekStartDateObj.getTime() + 6 * 24 * 60 * 60 * 1000),
    "MMMM d, yyyy"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Class for This Week</DialogTitle>
          <DialogDescription>
            Cancel "{templateTitle}" for the week of {weekStartDate} - {weekEndDate}. This will
            make the slot available for ad-hoc bookings for that week only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Holiday, Special event, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setReason("");
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} variant="destructive">
              {loading ? "Cancelling..." : "Cancel Class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

