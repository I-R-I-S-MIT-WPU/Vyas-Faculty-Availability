import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Floor, Building } from "@/types/database";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface FloorManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floor?: Floor | null;
  onFloorSaved: () => void;
}

export const FloorManagementDialog = ({
  open,
  onOpenChange,
  floor,
  onFloorSaved,
}: FloorManagementDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [formData, setFormData] = useState({
    number: "",
    name: "",
    building_id: "",
  });

  // Fetch buildings when dialog opens
  useEffect(() => {
    if (open) {
      fetchBuildings();
    }
  }, [open]);

  const fetchBuildings = async () => {
    try {
      const { data, error } = await supabase
        .from("buildings")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setBuildings(data || []);
    } catch (error) {
      console.error("Error fetching buildings:", error);
      toast({
        title: "Error",
        description: "Failed to load buildings",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (open) {
      if (floor) {
        setFormData({
          number: floor.number.toString(),
          name: floor.name,
          building_id: floor.building_id || "",
        });
      } else {
        setFormData({
          number: "",
          name: "",
          building_id: buildings.length > 0 ? buildings[0].id : "",
        });
      }
    }
  }, [open, floor, buildings]);

  const handleSave = async () => {
    if (
      !formData.name.trim() ||
      !formData.number.trim() ||
      !formData.building_id
    ) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const floorNumber = parseInt(formData.number);
    if (isNaN(floorNumber)) {
      toast({
        title: "Validation Error",
        description: "Floor number must be a valid number",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const floorData = {
        number: floorNumber,
        name: formData.name.trim(),
        building_id: formData.building_id,
      };

      if (floor) {
        // Update existing floor
        const { error } = await supabase
          .from("floors")
          .update(floorData)
          .eq("id", floor.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Floor updated successfully",
        });
      } else {
        // Create new floor
        const { error } = await supabase.from("floors").insert([floorData]);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Floor created successfully",
        });
      }

      onFloorSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving floor:", error);

      // Handle unique constraint violation
      if (error?.code === "23505") {
        toast({
          title: "Error",
          description:
            "A floor with this number already exists in this building",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: `Failed to ${floor ? "update" : "create"} floor`,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{floor ? "Edit Floor" : "Add New Floor"}</DialogTitle>
          <DialogDescription>
            {floor ? "Update floor details" : "Create a new floor"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="building" className="text-right">
              Building *
            </Label>
            <Select
              value={formData.building_id}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, building_id: value }))
              }
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a building" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((building) => (
                  <SelectItem key={building.id} value={building.id}>
                    {building.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="number" className="text-right">
              Floor Number *
            </Label>
            <Input
              id="number"
              type="number"
              value={formData.number}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, number: e.target.value }))
              }
              className="col-span-3"
              placeholder="e.g., 1"
              min="0"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Floor Name *
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              className="col-span-3"
              placeholder="e.g., Ground Floor"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : floor ? "Update Floor" : "Create Floor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
