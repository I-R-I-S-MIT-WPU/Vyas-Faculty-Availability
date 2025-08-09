import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
} from "date-fns";
import { CalendarIcon, Download, FileText } from "lucide-react";
import jsPDF from "jspdf";

interface ReportGeneratorProps {
  className?: string;
}

type ReportType = "daily" | "weekly" | "monthly" | "custom";

export const ReportGenerator = ({ className }: ReportGeneratorProps) => {
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();

  const getDateRange = (type: ReportType, date: Date) => {
    switch (type) {
      case "daily":
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      case "weekly":
        return {
          start: startOfWeek(date, { weekStartsOn: 1 }), // Monday start
          end: endOfWeek(date, { weekStartsOn: 1 }),
        };
      case "monthly":
        return {
          start: startOfMonth(date),
          end: endOfMonth(date),
        };
      case "custom":
        return {
          start: customStartDate || date,
          end: customEndDate || date,
        };
      default:
        return { start: date, end: date };
    }
  };

  const fetchBookingsForReport = async (
    startDate: Date,
    endDate: Date
  ): Promise<Booking[]> => {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        *,
        room:rooms(name, room_type, capacity, floor:floors(name)),
        profiles:profiles(full_name, email, department)
      `
      )
      .gte("start_time", startDate.toISOString())
      .lte("end_time", endDate.toISOString())
      .order("start_time", { ascending: true });

    if (error) throw error;
    return data || [];
  };

  const generatePDF = async (
    bookings: Booking[],
    startDate: Date,
    endDate: Date,
    reportType: ReportType
  ) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;

    // Header
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.text("Vyas Building - Room Booking Report", pageWidth / 2, yPosition, {
      align: "center",
    });
    yPosition += 15;

    // Report details
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    const reportTitle = `${
      reportType.charAt(0).toUpperCase() + reportType.slice(1)
    } Report`;
    pdf.text(reportTitle, pageWidth / 2, yPosition, { align: "center" });
    yPosition += 10;

    const dateRange = `${format(startDate, "MMM dd, yyyy")} - ${format(
      endDate,
      "MMM dd, yyyy"
    )}`;
    pdf.text(dateRange, pageWidth / 2, yPosition, { align: "center" });
    yPosition += 10;

    pdf.text(
      `Generated on: ${format(new Date(), "MMM dd, yyyy 'at' h:mm a")}`,
      pageWidth / 2,
      yPosition,
      { align: "center" }
    );
    yPosition += 20;

    // Summary
    pdf.setFont("helvetica", "bold");
    pdf.text(`Total Bookings: ${bookings.length}`, margin, yPosition);
    yPosition += 15;

    if (bookings.length === 0) {
      pdf.setFont("helvetica", "normal");
      pdf.text("No bookings found for the selected period.", margin, yPosition);
    } else {
      // Bookings table header
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);

      const headers = ["Date & Time", "Room", "Title", "Teacher", "Duration"];
      const colWidths = [40, 30, 35, 35, 25];
      let xPosition = margin;

      headers.forEach((header, index) => {
        pdf.text(header, xPosition, yPosition);
        xPosition += colWidths[index];
      });
      yPosition += 8;

      // Draw line under headers
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 5;

      // Bookings data
      pdf.setFont("helvetica", "normal");
      bookings.forEach((booking) => {
        // Check if we need a new page
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = margin;
        }

        xPosition = margin;

        // Date & Time
        const startTime = parseISO(booking.start_time);
        const endTime = parseISO(booking.end_time);
        const dateTimeText = `${format(startTime, "MM/dd")} ${format(
          startTime,
          "HH:mm"
        )}-${format(endTime, "HH:mm")}`;
        pdf.text(dateTimeText, xPosition, yPosition);
        xPosition += colWidths[0];

        // Room
        const roomText = `${booking.room?.name || "N/A"} (${
          booking.room?.floor?.name || "N/A"
        })`;
        pdf.text(roomText.substring(0, 20), xPosition, yPosition);
        xPosition += colWidths[1];

        // Title
        pdf.text(booking.title.substring(0, 25), xPosition, yPosition);
        xPosition += colWidths[2];

        // Teacher
        pdf.text(
          (booking.profiles?.full_name || "N/A").substring(0, 25),
          xPosition,
          yPosition
        );
        xPosition += colWidths[3];

        // Duration
        const duration = Math.round(
          (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
        );
        pdf.text(`${duration}h`, xPosition, yPosition);

        yPosition += 8;
      });

      // Statistics
      yPosition += 15;
      pdf.setFont("helvetica", "bold");
      pdf.text("Statistics:", margin, yPosition);
      yPosition += 8;

      pdf.setFont("helvetica", "normal");

      // Room usage stats
      const roomUsage = bookings.reduce((acc, booking) => {
        const roomName = booking.room?.name || "Unknown";
        acc[roomName] = (acc[roomName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      pdf.text("Most Used Rooms:", margin, yPosition);
      yPosition += 6;

      Object.entries(roomUsage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .forEach(([room, count]) => {
          pdf.text(`  ${room}: ${count} bookings`, margin + 10, yPosition);
          yPosition += 5;
        });

      yPosition += 10;

      // Room type stats
      const typeUsage = bookings.reduce((acc, booking) => {
        const type = booking.room?.room_type || "unknown";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      pdf.text("Bookings by Room Type:", margin, yPosition);
      yPosition += 6;

      Object.entries(typeUsage).forEach(([type, count]) => {
        const typeLabel =
          type === "classroom"
            ? "Lecture Room"
            : type === "lab"
            ? "Lab"
            : type === "conference"
            ? "Conference Room"
            : type === "auditorium"
            ? "Hall"
            : type;
        pdf.text(`  ${typeLabel}: ${count} bookings`, margin + 10, yPosition);
        yPosition += 5;
      });
    }

    // Save the PDF
    const fileName = `Room_Booking_Report_${format(
      startDate,
      "yyyy-MM-dd"
    )}_to_${format(endDate, "yyyy-MM-dd")}.pdf`;
    pdf.save(fileName);
  };

  const handleGenerateReport = async () => {
    try {
      setLoading(true);

      // Validate custom date range
      if (reportType === "custom") {
        if (!customStartDate || !customEndDate) {
          toast({
            title: "Validation Error",
            description:
              "Please select both start and end dates for custom report",
            variant: "destructive",
          });
          return;
        }
        if (customStartDate > customEndDate) {
          toast({
            title: "Validation Error",
            description: "Start date must be before or equal to end date",
            variant: "destructive",
          });
          return;
        }
      }

      const { start, end } = getDateRange(reportType, selectedDate);
      const bookings = await fetchBookingsForReport(start, end);

      toast({
        title: "Generating Report",
        description: `Found ${bookings.length} bookings for the selected period`,
      });

      await generatePDF(bookings, start, end, reportType);

      toast({
        title: "Success",
        description: "Report generated and downloaded successfully",
      });
    } catch (error) {
      console.error("Error generating report:", error);
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-4 p-4 border rounded-lg bg-muted/30 ${className}`}>
      <div className="flex items-center space-x-2">
        <FileText className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Generate Booking Report</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="report-type">Report Type</Label>
          <Select
            value={reportType}
            onValueChange={(value: ReportType) => setReportType(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily Report</SelectItem>
              <SelectItem value="weekly">Weekly Report</SelectItem>
              <SelectItem value="monthly">Monthly Report</SelectItem>
              <SelectItem value="custom">Custom Date Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {reportType !== "custom" && (
          <div className="space-y-2">
            <Label>Reference Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {reportType === "custom" && (
          <>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customStartDate
                      ? format(customStartDate, "PPP")
                      : "Select start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customEndDate
                      ? format(customEndDate, "PPP")
                      : "Select end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}
      </div>

      <div className="pt-2">
        <Button
          onClick={handleGenerateReport}
          disabled={loading}
          className="w-full md:w-auto"
        >
          <Download className="mr-2 h-4 w-4" />
          {loading ? "Generating..." : "Generate & Download PDF"}
        </Button>
      </div>

      {reportType !== "custom" && (
        <div className="text-sm text-muted-foreground">
          {reportType === "daily" &&
            `Report for: ${format(selectedDate, "PPP")}`}
          {reportType === "weekly" &&
            `Report for week: ${format(
              startOfWeek(selectedDate, { weekStartsOn: 1 }),
              "MMM dd"
            )} - ${format(
              endOfWeek(selectedDate, { weekStartsOn: 1 }),
              "MMM dd, yyyy"
            )}`}
          {reportType === "monthly" &&
            `Report for: ${format(selectedDate, "MMMM yyyy")}`}
        </div>
      )}
    </div>
  );
};
