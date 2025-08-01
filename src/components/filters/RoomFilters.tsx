import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X } from "lucide-react";

export interface FilterState {
  search: string;
  floor: string;
  roomType: string;
  availability: string;
  capacity: string;
}

interface RoomFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  floors: Array<{ id: string; name: string; number: number }>;
}

const roomTypes = [
  { value: "classroom", label: "Classroom" },
  { value: "lab", label: "Laboratory" },
  { value: "auditorium", label: "Auditorium" },
  { value: "conference", label: "Conference Room" },
  { value: "seminar", label: "Seminar Hall" },
];

export default function RoomFilters({ filters, onFiltersChange, floors }: RoomFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = (key: keyof FilterState, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      floor: "",
      roomType: "",
      availability: "",
      capacity: ""
    });
  };

  const activeFiltersCount = Object.values(filters).filter(value => value !== "").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary">{activeFiltersCount}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center space-x-2">
            {activeFiltersCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? "Hide" : "Show"} Filters
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search">Search Rooms</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by room name or type..."
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Floor Filter */}
            <div className="space-y-2">
              <Label>Floor</Label>
              <Select value={filters.floor} onValueChange={(value) => updateFilter("floor", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All floors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All floors</SelectItem>
                  {floors.map((floor) => (
                    <SelectItem key={floor.id} value={floor.id}>
                      {floor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Room Type Filter */}
            <div className="space-y-2">
              <Label>Room Type</Label>
              <Select value={filters.roomType} onValueChange={(value) => updateFilter("roomType", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  {roomTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Availability Filter */}
            <div className="space-y-2">
              <Label>Availability</Label>
              <Select value={filters.availability} onValueChange={(value) => updateFilter("availability", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All rooms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All rooms</SelectItem>
                  <SelectItem value="available">Available now</SelectItem>
                  <SelectItem value="busy">Currently busy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Capacity Filter */}
            <div className="space-y-2">
              <Label>Minimum Capacity</Label>
              <Select value={filters.capacity} onValueChange={(value) => updateFilter("capacity", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any capacity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any capacity</SelectItem>
                  <SelectItem value="20">20+ seats</SelectItem>
                  <SelectItem value="30">30+ seats</SelectItem>
                  <SelectItem value="50">50+ seats</SelectItem>
                  <SelectItem value="100">100+ seats</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}