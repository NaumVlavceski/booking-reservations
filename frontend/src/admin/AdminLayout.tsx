// Admin chrome. Desktop (lg+): a sidebar with Overview and Owners on top and, at the bottom, the session card, Log
// out of Admin and the account row. Phones and tablets: a top bar per page (title, ADMIN chip, countdown pill) and a
// bottom tab bar Overview / Owners / More; More opens a sheet with the session card, Audit log and Log out of Admin.
import {useState, type ReactNode} from "react";
import {Link, useLocation} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {meQuery} from "../lib/api/me";
import AppLogo from "../components/AppLogo";
import ThemeToggle from "../components/ThemeToggle";
import Avatar from "../components/ui/Avatar";
import Sheet from "../components/ui/Sheet";
import Button from "../components/ui/Button";
import {CountBubble} from "../components/ui/Badge";
import {ChevronRightIcon, LogoutIcon, MoreHorizontalIcon} from "../components/icons";
import {useAdminShell} from "./AdminContext";
import {AdminChip, ClockIcon, GridIcon, ListIcon, MailIcon, PeopleIcon} from "./adminUi";
import {mmss} from "./adminFormat";
import {getEmailConfig} from "./adminApi";
import SendEmailDialog from "./SendEmailDialog";

export default function AdminLayout({children}: { children: ReactNode }) {
    const {pathname, key} = useLocation();
    const {needHelp, logout} = useAdminShell();
    const {data: me} = useQuery(meQuery);
    const [moreOpenedAt, setMoreOpenedAt] = useState<string | null>(null);
    const moreOpen = moreOpenedAt === key;
    const overviewActive = pathname === "/admin" || pathname === "/admin/";
    const ownersActive = pathname.startsWith("/admin/owners");
    // Send email to any address (shown only when the server has a sender, APP_ADMIN_MAIL_FROM)
    const mailConfig = useQuery({queryKey: ["admin", "email-config"], queryFn: getEmailConfig, staleTime: Infinity});
    const mailFrom = mailConfig.data?.enabled ? mailConfig.data.from ?? "" : null;
    const [mailOpen, setMailOpen] = useState(false);

    return (
        <div className="min-h-dvh">
            <aside aria-label="Admin menu"
                   className="fixed inset-y-0 left-0 z-(--rt-z-nav) hidden w-64 flex-col border-r border-subtle bg-surface lg:flex">
                <div className="flex items-center gap-3 px-5 pt-6 pb-5">
                    <span className="shrink-0 rounded-control bg-white p-1 ring-1 ring-(--rt-border-subtle)"><AppLogo size={28}/></span>
                    <p className="min-w-0 truncate text-title-3 text-fg">RoomTrack</p>
                    <AdminChip/>
                </div>
                <nav aria-label="Admin" className="flex-1 space-y-0.5 overflow-y-auto px-3">
                    <SideLink to="/admin" active={overviewActive} icon={<GridIcon size={18}/>}>Overview</SideLink>
                    <SideLink to="/admin/owners" active={ownersActive} icon={<PeopleIcon size={18}/>}
                              trailing={needHelp > 0 ? <NeedHelpCount count={needHelp}/> : null}>Owners</SideLink>
                    {mailFrom !== null && (
                        <button type="button" onClick={() => setMailOpen(true)} aria-haspopup="dialog"
                                className="flex min-h-10 w-full items-center gap-3 rounded-control px-3 py-1.5 text-left text-body-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-fg">
                            <MailIcon size={18}/>Send email
                        </button>
                    )}
                </nav>
                <div className="space-y-3 border-t border-subtle px-3 pt-4 pb-4">
                    <SessionCard compact/>
                    <Button variant="secondary" block icon={<LogoutIcon size={18}/>} onClick={() => void logout()}>
                        Log out of Admin
                    </Button>
                    <div className="flex items-center gap-3 rounded-control py-1 pr-1 pl-2">
                        <Avatar name={me?.fullName} size="sm"/>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-body-sm font-semibold text-fg">{me?.fullName}</p>
                            <p className="truncate text-caption text-subtle">{me?.email}</p>
                        </div>
                        <ThemeToggle email={me?.email}/>
                    </div>
                </div>
            </aside>

            <main id="main" tabIndex={-1}
                  className="px-4 pt-[env(safe-area-inset-top)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none sm:px-6 lg:py-8 lg:pr-8 lg:pb-10 lg:pl-72">
                <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>

            <nav aria-label="Admin"
                 className="fixed inset-x-0 bottom-0 z-(--rt-z-nav) grid grid-cols-3 border-t border-subtle bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
                <Tab to="/admin" label="Overview" icon={<GridIcon/>} active={overviewActive && !moreOpen}/>
                <Tab to="/admin/owners" label="Owners" icon={<PeopleIcon/>} active={ownersActive && !moreOpen} count={needHelp}/>
                <Tab label="More" icon={<MoreHorizontalIcon size={22}/>} active={moreOpen || pathname.startsWith("/admin/audit")}
                     onClick={() => setMoreOpenedAt(key)} expanded={moreOpen}/>
            </nav>

            <Sheet open={moreOpen} onClose={() => setMoreOpenedAt(null)} title="More" titleHidden showClose closeLabel="Close menu">
                <div className="flex items-center gap-3 pr-10 pb-4">
                    <Avatar name={me?.fullName}/>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-title-3 text-fg">{me?.fullName}</p>
                        <p className="truncate text-body-sm text-muted">{me?.email}</p>
                    </div>
                    <ThemeToggle email={me?.email} className="-mt-7"/>
                </div>
                <div className="space-y-3">
                    <SessionCard/>
                    {mailFrom !== null && (
                        <div className="rounded-card bg-surface-sunken p-1">
                            <button type="button" aria-haspopup="dialog" onClick={() => {
                                setMoreOpenedAt(null);
                                setMailOpen(true);
                            }} className="flex min-h-14 w-full items-center gap-3 rounded-control px-3 text-left transition-colors hover:bg-surface-hover">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-on-primary-soft"><MailIcon size={18}/></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-body font-semibold text-fg">Send email</span>
                                    <span className="block text-caption text-muted">To any address, sent from the app</span>
                                </span>
                                <ChevronRightIcon size={18} className="text-subtle"/>
                            </button>
                        </div>
                    )}
                    <div className="rounded-card bg-surface-sunken p-1">
                        <Link to="/admin/audit" onClick={() => setMoreOpenedAt(null)}
                              className="flex min-h-14 items-center gap-3 rounded-control px-3 text-left transition-colors hover:bg-surface-hover">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-on-primary-soft"><ListIcon size={18}/></span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-body font-semibold text-fg">Audit log</span>
                                <span className="block text-caption text-muted">Everything done in Admin</span>
                            </span>
                            <ChevronRightIcon size={18} className="text-subtle"/>
                        </Link>
                    </div>
                    <div className="rounded-card bg-surface-sunken p-1">
                        <button type="button" onClick={() => void logout()}
                                className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left text-body font-medium text-fg transition-colors hover:bg-surface-hover">
                            <LogoutIcon size={20} className="text-muted"/>
                            <span className="flex-1">Log out of Admin</span>
                            <ChevronRightIcon size={18} className="text-subtle"/>
                        </button>
                    </div>
                </div>
            </Sheet>
            {mailFrom !== null && <SendEmailDialog open={mailOpen} onClose={() => setMailOpen(false)} from={mailFrom}/>}
        </div>
    );
}

function NeedHelpCount({count}: { count: number }) {
    return (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-soft px-1.5 text-caption font-bold text-danger">
            {count}<span className="sr-only"> owners need help</span>
        </span>
    );
}

function SideLink({to, active, icon, trailing, children}: {
    to: string; active: boolean; icon: ReactNode; trailing?: ReactNode; children: ReactNode;
}) {
    return (
        <Link to={to} aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-control px-3 py-1.5 text-body-sm font-medium transition-colors ${
                  active ? "bg-primary-soft font-semibold text-on-primary-soft" : "text-muted hover:bg-surface-hover hover:text-fg"
              }`}>
            {icon}
            {children}
            {trailing}
        </Link>
    );
}

function Tab({to, onClick, label, icon, active, count = 0, expanded}: {
    to?: string; onClick?: () => void; label: string; icon: ReactNode; active: boolean; count?: number; expanded?: boolean;
}) {
    const inner = (
        <>
            <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                active ? "bg-primary-soft text-on-primary-soft" : "text-subtle"
            }`}>{icon}</span>
            <span className={active ? "text-on-primary-soft" : "text-subtle"}>
                {label}{count > 0 && <span className="sr-only">, {count} need help</span>}
            </span>
            <CountBubble count={count} className="absolute top-1.5 left-1/2 ml-2.5"/>
        </>
    );
    const cls = "relative flex h-16 flex-col items-center justify-center gap-1 text-micro";
    return to ? (
        <Link to={to} aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>
    ) : (
        <button type="button" onClick={onClick} aria-haspopup="dialog" aria-expanded={expanded} className={cls}>{inner}</button>
    );
}

/** Countdown, progress bar and Continue. */
export function SessionCard({compact = false}: { compact?: boolean }) {
    const {secondsLeft, windowSeconds, extend, extending} = useAdminShell();
    const pct = Math.max(0, Math.min(100, Math.round((secondsLeft / windowSeconds) * 100)));
    return (
        <section aria-label="Admin session" className="rounded-card border border-subtle bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-body-sm font-semibold text-fg"><ClockIcon size={16}/>Admin session</p>
                <p className={`num text-title-2 font-bold ${secondsLeft <= 60 ? "text-warning" : "text-primary"}`}
                   role="timer" aria-label={`ends in ${mmss(secondsLeft)}`}>{mmss(secondsLeft)}</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                <div className="h-full rounded-full bg-primary transition-[width] duration-1000" style={{width: `${pct}%`}}/>
            </div>
            <Button variant={compact ? "secondary" : "primary"} block className="mt-3" onClick={() => void extend()}
                    loading={extending} loadingLabel="Extending…">
                Continue for 30 min
            </Button>
        </section>
    );
}
