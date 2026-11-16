import { useCallback, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PlannerLayout } from "../components/PlannerLayout";
import { DivisionsTab } from "../components/config/DivisionsTab";
import { FacultyTab } from "../components/config/FacultyTab";
import { OfferingsTab } from "../components/config/OfferingsTab";
import { RoomsTab } from "../components/config/RoomsTab";
import { RulesTab } from "../components/config/RulesTab";
import { SettingsTab } from "../components/config/SettingsTab";
import { SubjectsTab } from "../components/config/SubjectsTab";
import ReadinessPanel from "../components/readiness/ReadinessPanel";
import { plannerApi } from "../api";
import { plannerKeys, useTerm } from "../hooks";
import { describeApiError } from "../lib/errors";
import { plannerEnabled } from "../lib/flag";
import type { IssueNavTarget, Term } from "../types";

const TABS = [
  { value: "settings", label: "Settings" },
  { value: "faculty", label: "Faculty" },
  { value: "subjects", label: "Subjects" },
  { value: "divisions", label: "Divisions & batches" },
  { value: "offerings", label: "Offerings" },
  { value: "rooms", label: "Room pool" },
  { value: "rules", label: "Rules" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

const isTab = (v: string | null): v is TabValue => TABS.some((t) => t.value === v);

const READINESS_OPEN_KEY = "planner.readinessOpen";
const readOpenPref = (): boolean => {
  try {
    return localStorage.getItem(READINESS_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
};
const writeOpenPref = (open: boolean) => {
  try {
    localStorage.setItem(READINESS_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* storage unavailable: the preference just isn't remembered */
  }
};

const termTitle = (t: Pick<Term, "academic_year" | "half" | "branch">) => `${t.academic_year} · ${t.half === "odd" ? "Odd" : "Even"} · ${t.branch}`;

export default function PlannerTermSetupPage() {
  const { termId = "" } = useParams();
  const { user, isAdmin } = useAuth();

  // PlannerLayout does the flag / sign-in / admin guard. The term query needs the layout's title,
  // so only start it once the viewer is allowed to see the page.
  if (!plannerEnabled() || !user || !isAdmin) {
    return <PlannerLayout title="Term setup">{null}</PlannerLayout>;
  }
  return <TermSetup termId={termId} />;
}

function TermSetup({ termId }: { termId: string }) {
  const detail = useTerm(termId);
  const term = detail.data?.term;
  const name = term ? termTitle(term) : detail.error ? "Term not available" : "Term setup";

  return (
    <PlannerLayout
      title={name}
      description={term ? "Set up this term's data, check readiness, then generate sessions." : undefined}
      crumbs={[{ label: term ? termTitle(term) : "Term" }]}
      actions={
        <>
          <Button asChild variant="outline">
            <Link to={`/admin/planner/terms/${termId}/editor`}>
              <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
              Editor
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/admin/planner/terms/${termId}/import`}>
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              Import data
            </Link>
          </Button>
        </>
      }
    >
      {detail.error ? (
        <div className="rounded-md border p-8 text-center">
          <p className="text-sm text-destructive">{describeApiError(detail.error)}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => detail.refetch()}>
              Try again
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/planner">Back to terms</Link>
            </Button>
          </div>
        </div>
      ) : (
        <SetupBody termId={termId} />
      )}
    </PlannerLayout>
  );
}

function SetupBody({ termId }: { termId: string }) {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const tabsRef = useRef<HTMLDivElement>(null);
  const [readinessOpen, setReadinessOpen] = useState(readOpenPref);
  // The Rules tab keeps unsaved edits in its own state, so once opened it stays mounted (hidden) while another tab is shown.
  const [rulesOpened, setRulesOpened] = useState(false);
  const [rulesDirty, setRulesDirty] = useState(false);
  const onRulesDirty = useCallback((dirty: boolean) => setRulesDirty(dirty), []);

  const tabParam = params.get("tab");
  const tab: TabValue = isTab(tabParam) ? tabParam : "settings";
  if (tab === "rules" && !rulesOpened) setRulesOpened(true);

  // Other query keys (e.g. ?division= on the offerings tab) are kept. `division` (optional) is set in the same update.
  const setTab = (next: string, division?: string | null) => {
    if (!isTab(next)) return;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("tab", next);
        if (division) p.set("division", division);
        return p;
      },
      { replace: true },
    );
  };

  /** The division an offerings/divisions issue is about, when it can be worked out. */
  const divisionOf = async (tabValue: string, target?: IssueNavTarget): Promise<string | null> => {
    if (!target || (tabValue !== "offerings" && tabValue !== "divisions")) return null;
    const metaDivision = target.meta?.division_id;
    if (typeof metaDivision === "string" && metaDivision) return metaDivision;
    if (target.type === "division" && target.id) return target.id;
    if (target.type === "offering" && target.id) {
      // Offering issues carry only the offering id: look its division up (usually already cached).
      try {
        const all = await qc.fetchQuery({
          queryKey: plannerKeys.offerings(termId),
          queryFn: () => plannerApi.listOfferings(termId),
          staleTime: 30_000,
        });
        return all.find((o) => o.id === target.id)?.division_id ?? null;
      } catch {
        return null; // fall back to the tab's default division
      }
    }
    return null;
  };

  const goToTab = async (next: string, target?: IssueNavTarget) => {
    const division = await divisionOf(next, target);
    setTab(next, division);
    tabsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const toggleReadiness = (open: boolean) => {
    setReadinessOpen(open);
    writeOpenPref(open);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Collapsible open={readinessOpen} onOpenChange={toggleReadiness}>
        <Card>
          <CardHeader className="p-0">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
              >
                <CardTitle className="text-lg">Readiness</CardTitle>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  {readinessOpen ? "Hide" : "Show"}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", readinessOpen && "rotate-180")} aria-hidden="true" />
                </span>
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <ReadinessPanel termId={termId} onNavigateTab={goToTab} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <div ref={tabsRef} className="scroll-mt-4">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          {/* The tab strip scrolls sideways on its own; the page itself never does. */}
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  {t.value === "rules" && rulesDirty && (
                    <>
                      <span aria-hidden="true" className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" title="Unsaved rule changes" />
                      <span className="sr-only">Unsaved rule changes</span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="settings" className="mt-0">
            <SettingsTab termId={termId} />
          </TabsContent>
          <TabsContent value="faculty" className="mt-0">
            <FacultyTab termId={termId} />
          </TabsContent>
          <TabsContent value="subjects" className="mt-0">
            <SubjectsTab termId={termId} />
          </TabsContent>
          <TabsContent value="divisions" className="mt-0">
            <DivisionsTab termId={termId} />
          </TabsContent>
          <TabsContent value="offerings" className="mt-0">
            <OfferingsTab termId={termId} />
          </TabsContent>
          <TabsContent value="rooms" className="mt-0">
            <RoomsTab termId={termId} />
          </TabsContent>
          {/* forceMount keeps the tab (and its unsaved edits) alive while hidden; Radix does not set `hidden` itself then. */}
          <TabsContent value="rules" className="mt-0" forceMount={rulesOpened ? true : undefined} hidden={tab !== "rules"}>
            <RulesTab termId={termId} onDirtyChange={onRulesDirty} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
