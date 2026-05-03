import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkPlus, Check, ChevronDown, Copy, Lock, Mail, Send, Share2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/lib/tenant-context";

export interface SavedView {
  id: string;
  userId: string;
  orgId: string;
  scope: "user" | "org";
  pageKey: string;
  name: string;
  filtersJson: Record<string, any>;
  isSystem: boolean;
  createdAt: string;
}

const DEFAULT_USER_ID = "default-user";

async function authedFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("x-user-id", DEFAULT_USER_ID);
  return fetch(input, { ...init, headers });
}

interface SavedViewsProps<TFilters extends Record<string, any>> {
  pageKey: string;
  currentFilters: TFilters;
  onApply: (filters: TFilters) => void;
  defaultFilters: TFilters;
  className?: string;
}

export function SavedViews<TFilters extends Record<string, any>>({
  pageKey,
  currentFilters,
  onApply,
  defaultFilters,
  className,
}: SavedViewsProps<TFilters>) {
  const queryClient = useQueryClient();
  const { activeOrgId, organization } = useActiveTenant();
  const orgId = activeOrgId || organization?.id || null;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [shareWithOrg, setShareWithOrg] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [hasAppliedUrlView, setHasAppliedUrlView] = useState(false);

  const urlViewId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("view");
  }, []);

  const queryKey = ["/api/saved-views", orgId, pageKey];
  const { data: views = [], isLoading } = useQuery<SavedView[]>({
    queryKey,
    enabled: !!orgId,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("orgId", orgId!);
      params.set("pageKey", pageKey);
      const res = await authedFetch(`/api/saved-views?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: urlView } = useQuery<SavedView | null>({
    queryKey: ["/api/saved-views/by-id", urlViewId],
    enabled: !!urlViewId && !hasAppliedUrlView,
    queryFn: async () => {
      const res = await authedFetch(`/api/saved-views/${urlViewId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; scope: "user" | "org"; filtersJson: Record<string, any> }) => {
      const res = await authedFetch("/api/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          pageKey,
          name: payload.name,
          scope: payload.scope,
          filtersJson: payload.filtersJson,
          isSystem: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as SavedView;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey });
      setSaveDialogOpen(false);
      setViewName("");
      setShareWithOrg(false);
      setActiveViewId(created.id);
      const params = new URLSearchParams(window.location.search);
      params.set("view", created.id);
      setLocation(`${window.location.pathname}?${params.toString()}`);
      toast({ title: "View saved", description: `"${created.name}" is ready to share.` });
    },
    onError: (err: any) => {
      toast({ title: "Could not save view", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authedFetch(`/api/saved-views/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey });
      if (activeViewId === id) setActiveViewId(null);
      toast({ title: "View deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete view", description: err.message, variant: "destructive" });
    },
  });

  const applyView = (view: SavedView) => {
    const merged = { ...defaultFilters, ...(view.filtersJson as TFilters) };
    onApply(merged);
    setActiveViewId(view.id);
    const params = new URLSearchParams(window.location.search);
    params.set("view", view.id);
    setLocation(`${window.location.pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (hasAppliedUrlView) return;
    if (!urlViewId) {
      setHasAppliedUrlView(true);
      return;
    }
    if (urlView === undefined) return;
    if (urlView) {
      onApply({ ...defaultFilters, ...(urlView.filtersJson as TFilters) });
      setActiveViewId(urlView.id);
    }
    setHasAppliedUrlView(true);
  }, [urlView, urlViewId, hasAppliedUrlView, defaultFilters, onApply]);

  const activeView = useMemo(() => views.find(v => v.id === activeViewId) || null, [views, activeViewId]);

  const isDirty = useMemo(() => {
    if (!activeView) return false;
    return JSON.stringify({ ...defaultFilters, ...activeView.filtersJson }) !== JSON.stringify(currentFilters);
  }, [activeView, currentFilters, defaultFilters]);

  const userViews = views.filter(v => v.scope === "user" && !v.isSystem);
  const orgViews = views.filter(v => v.scope === "org" && !v.isSystem);
  const systemViews = views.filter(v => v.isSystem);

  const buildShareUrl = () => {
    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  };

  const handleCopyLink = () => {
    const url = buildShareUrl();
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied", description: "Share this URL with your team." }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };

  const handleEmailShare = () => {
    if (!activeView) return;
    const url = buildShareUrl();
    const subject = encodeURIComponent(`Saved view: ${activeView.name}`);
    const body = encodeURIComponent(
      `I'm sharing the saved view "${activeView.name}" with you.\n\nOpen the filtered view here:\n${url}\n`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const slackMutation = useMutation({
    mutationFn: async () => {
      if (!activeView) throw new Error("No active view");
      const res = await authedFetch(`/api/saved-views/${activeView.id}/share/slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: buildShareUrl() }),
      });
      if (!res.ok) {
        let msg = `Slack share failed (${res.status})`;
        try {
          const data = await res.json();
          if (data?.message) msg = data.message;
        } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sent to Slack", description: "Your team will see it in the configured channel." });
    },
    onError: (err: any) => {
      toast({ title: "Could not send to Slack", description: err.message, variant: "destructive" });
    },
  });

  const handleClearActive = () => {
    setActiveViewId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("view");
    const qs = params.toString();
    setLocation(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };

  if (!orgId) return null;

  return (
    <div className={`flex items-center gap-2 ${className || ""}`} data-testid={`saved-views-${pageKey}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid={`button-views-${pageKey}`}>
            <Bookmark className="h-3.5 w-3.5 mr-1.5" />
            {activeView ? activeView.name : "Views"}
            {isDirty && <Badge variant="secondary" className="ml-1.5 text-[10px]">edited</Badge>}
            <ChevronDown className="h-3 w-3 ml-1.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {userViews.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">My views</DropdownMenuLabel>
              {userViews.map(v => (
                <ViewItem
                  key={v.id}
                  view={v}
                  isActive={activeViewId === v.id}
                  onSelect={() => applyView(v)}
                  onDelete={() => deleteMutation.mutate(v.id)}
                />
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          {orgViews.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Shared with org</span>
              </DropdownMenuLabel>
              {orgViews.map(v => (
                <ViewItem
                  key={v.id}
                  view={v}
                  isActive={activeViewId === v.id}
                  onSelect={() => applyView(v)}
                  onDelete={() => deleteMutation.mutate(v.id)}
                />
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          {systemViews.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> System defaults</span>
              </DropdownMenuLabel>
              {systemViews.map(v => (
                <ViewItem
                  key={v.id}
                  view={v}
                  isActive={activeViewId === v.id}
                  onSelect={() => applyView(v)}
                />
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          {views.length === 0 && (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              {isLoading ? "Loading..." : "No saved views yet"}
            </DropdownMenuItem>
          )}
          {activeView && (
            <DropdownMenuItem onClick={handleClearActive} data-testid={`button-clear-view-${pageKey}`}>
              <span className="text-xs">Clear active view</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setViewName("");
          setShareWithOrg(false);
          setSaveDialogOpen(true);
        }}
        data-testid={`button-save-view-${pageKey}`}
      >
        <BookmarkPlus className="h-3.5 w-3.5 mr-1.5" />
        Save view
      </Button>

      {activeView && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              data-testid={`button-share-view-${pageKey}`}
              title="Share this view"
            >
              <Share2 className="h-3.5 w-3.5 mr-1.5" />
              Share
              <ChevronDown className="h-3 w-3 ml-1.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Share "{activeView.name}"
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleCopyLink();
              }}
              data-testid={`button-copy-view-link-${pageKey}`}
            >
              <Copy className="h-3.5 w-3.5 mr-2" />
              <span className="text-sm">Copy link</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleEmailShare();
              }}
              data-testid={`button-email-view-${pageKey}`}
            >
              <Mail className="h-3.5 w-3.5 mr-2" />
              <span className="text-sm">Email link</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                slackMutation.mutate();
              }}
              disabled={slackMutation.isPending}
              data-testid={`button-slack-view-${pageKey}`}
            >
              <Send className="h-3.5 w-3.5 mr-2" />
              <span className="text-sm">{slackMutation.isPending ? "Sending..." : "Send to Slack"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-md" data-testid={`dialog-save-view-${pageKey}`}>
          <DialogHeader>
            <DialogTitle>Save current filters as a view</DialogTitle>
            <DialogDescription>
              Capture the current filters, sort, and search into a named view you can re-apply with one click.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                placeholder="e.g. Failed Cascadia traces"
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                data-testid={`input-view-name-${pageKey}`}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Share with org</div>
                <div className="text-xs text-muted-foreground">Visible to everyone in your organization.</div>
              </div>
              <Switch
                checked={shareWithOrg}
                onCheckedChange={setShareWithOrg}
                data-testid={`switch-share-org-${pageKey}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  name: viewName.trim(),
                  scope: shareWithOrg ? "org" : "user",
                  filtersJson: currentFilters,
                })
              }
              disabled={!viewName.trim() || createMutation.isPending}
              data-testid={`button-confirm-save-view-${pageKey}`}
            >
              {createMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewItem({
  view,
  isActive,
  onSelect,
  onDelete,
}: {
  view: SavedView;
  isActive: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className="flex items-center justify-between gap-2"
      data-testid={`view-item-${view.id}`}
    >
      <span className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
        {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
        <span className="truncate">{view.name}</span>
        {view.isSystem && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
      </span>
      {onDelete && !view.isSystem && (
        <button
          type="button"
          className="p-0.5 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (confirm(`Delete view "${view.name}"?`)) onDelete();
          }}
          data-testid={`button-delete-view-${view.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </DropdownMenuItem>
  );
}
