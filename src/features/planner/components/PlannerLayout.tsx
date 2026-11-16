import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import Header from "@/components/layout/Header";
import { SignInRequired } from "@/components/layout/SignInRequired";
import NotFound from "@/pages/NotFound";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { plannerEnabled } from "../lib/flag";

export interface Crumb {
  label: string;
  /** Omit on the last crumb: it is the current page. */
  to?: string;
}

interface PlannerLayoutProps {
  title: string;
  description?: string;
  /** Crumbs after "Admin / Timetable Planner". The last one is the current page. */
  crumbs?: Crumb[];
  /** Buttons on the right of the title. */
  actions?: ReactNode;
  children: ReactNode;
  /** Full-width content area (for the editor grid). Default false keeps the centred container. */
  wide?: boolean;
}

/**
 * Shell for every planner page: feature-flag + admin guard, site header, breadcrumb back to
 * /admin and /admin/planner, title row. Children are only rendered for a signed-in admin, so
 * put data hooks in the children (inner components), not in the page function itself.
 */
export function PlannerLayout({ title, description, crumbs = [], actions, children, wide = false }: PlannerLayoutProps) {
  const { user, isAdmin } = useAuth();

  if (!plannerEnabled()) return <NotFound />;

  if (!user) {
    return <SignInRequired message="Sign in with an admin account to use the timetable planner." />;
  }

  if (!isAdmin) {
    return (
      <SignInRequired
        icon={Shield}
        title="Admins only"
        message="Your account doesn't have access to the timetable planner."
        showSignIn={false}
      />
    );
  }

  const trail: Crumb[] = [{ label: "Admin", to: "/admin" }, { label: "Timetable Planner", to: crumbs.length ? "/admin/planner" : undefined }, ...crumbs];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main
        className={cn(
          "space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6",
          wide ? "mx-auto w-full max-w-none px-2 sm:px-3" : "container mx-auto",
        )}
      >
        <div className="space-y-3">
          <Breadcrumb>
            <BreadcrumbList>
              {trail.map((crumb, i) => (
                <Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {crumb.to && i < trail.length - 1 ? (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.to}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
              {description && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
