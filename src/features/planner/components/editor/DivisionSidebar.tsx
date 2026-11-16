// Division picker for the editor: divisions grouped by semester, each with "placed/total" and a percentage.
//
//   DivisionSidebar({ divisions, counts, activeId, onSelect })
//     counts   {[division_id]: {placed, unplaced, total}} from countByDivision()
// The active division is marked with aria-current and a visible "selected" style; progress is always written as
// text (e.g. "12/20, 60%"), the bar is decoration.
// issueCounts? ({[division_id]: {hard, soft}}, e.g. diagnostics.by_division): adds a red "hard" and an amber "soft" count badge
// (icon + number) to each division with issues, and the same counts in the button's aria-label.

import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DivisionWithBatches } from "../../types";
import type { DivisionCounts } from "../../lib/patch";
import { groupBySemester, percentPlaced } from "../../lib/sessionFilters";

export interface DivisionSidebarProps {
  divisions: DivisionWithBatches[];
  counts: Record<string, DivisionCounts>;
  activeId: string | null;
  onSelect: (divisionId: string) => void;
  issueCounts?: Record<string, { hard: number; soft: number }>;
  className?: string;
}

export function DivisionSidebar({ divisions, counts, activeId, onSelect, issueCounts, className }: DivisionSidebarProps) {
  const groups = groupBySemester(divisions);

  if (groups.length === 0) {
    return <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">This term has no divisions yet.</p>;
  }

  return (
    <nav aria-label="Divisions" className={cn("space-y-3", className)}>
      {groups.map((g) => (
        <div key={g.semester} className="space-y-1">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Semester {g.semester}</h3>
          <ul className="space-y-1">
            {g.divisions.map((d) => {
              const c = counts[d.id] ?? { placed: 0, unplaced: 0, total: 0 };
              const pct = percentPlaced(c.placed, c.total);
              const active = d.id === activeId;
              const issues = issueCounts?.[d.id];
              const hard = issues?.hard ?? 0;
              const soft = issues?.soft ?? 0;
              const issueText = [
                hard ? `${hard} hard ${hard === 1 ? "issue" : "issues"}` : null,
                soft ? `${soft} ${soft === 1 ? "warning" : "warnings"}` : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(d.id)}
                    aria-current={active ? "true" : undefined}
                    aria-label={`Division ${d.name}, semester ${d.semester}, ${c.placed} of ${c.total} sessions placed, ${pct} percent${issueText ? `, ${issueText}` : ""}${active ? ", selected" : ""}`}
                    className={cn(
                      "w-full rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
                      "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "border-primary bg-accent font-semibold ring-1 ring-primary" : "border-transparent bg-card",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        {active && <span aria-hidden="true">{"› "}</span>}
                        {d.name}
                      </span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {c.placed}/{c.total} {"·"} {pct}%
                      </span>
                    </span>
                    {(hard > 0 || soft > 0) && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs" aria-hidden="true">
                        {hard > 0 && (
                          <span className="flex items-center gap-0.5 rounded-full border border-status-danger-border bg-status-danger px-1.5 text-status-danger-foreground" title={`${hard} hard issues`}>
                            <AlertTriangle className="h-3 w-3" />
                            {hard}
                          </span>
                        )}
                        {soft > 0 && (
                          <span className="flex items-center gap-0.5 rounded-full border border-status-lunch-border bg-status-lunch px-1.5 text-status-lunch-foreground" title={`${soft} warnings`}>
                            <Info className="h-3 w-3" />
                            {soft}
                          </span>
                        )}
                      </span>
                    )}
                    <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
