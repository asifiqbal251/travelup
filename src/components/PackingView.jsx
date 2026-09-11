import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import PackingRing from "@/components/PackingRing";
import { Check, Plus, Trash2, X } from "lucide-react";

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function categoryAnchorId(category) {
  return `pack-cat-${slug(category)}`;
}

// Single source of truth for "what's visible in this category, and is it
// fully packed" -- shared by the desktop sidebar / mobile pill row (built by
// the caller from this) and this file's own section rendering, so the two
// never disagree about counts.
export function packingCategorySummaries(groups, state) {
  const checkedItemIds = (state && state.checkedItemIds) || [];
  const customItems = (state && state.customItems) || [];
  const removedItemIds = (state && state.removedItemIds) || [];
  const isChecked = (id) => checkedItemIds.includes(id);

  return (groups || [])
    .map((group) => {
      const visibleGenerated = group.items.filter((it) => !removedItemIds.includes(it.id));
      const customInCat = customItems
        .filter((c) => c.category === group.category)
        .map((c) => ({ ...c, custom: true }));
      const items = [...visibleGenerated, ...customInCat];
      const done = items.filter((it) => isChecked(it.id)).length;
      return {
        category: group.category,
        id: categoryAnchorId(group.category),
        items,
        total: items.length,
        done,
        allPacked: items.length > 0 && done === items.length
      };
    })
    .filter((g) => g.total > 0);
}

export default function PackingView({ groups, state, handlers, nav, scrollOffset }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newCat, setNewCat] = useState((groups && groups[0] && groups[0].category) || "Optional items");
  const [showRemoved, setShowRemoved] = useState(false);
  const { onToggle, onAdd, onRemove, onReset, onDelete, onRestore, onSetChecked } = handlers || {};

  const checkedItemIds = (state && state.checkedItemIds) || [];
  const removedItemIds = (state && state.removedItemIds) || [];
  const isRemoved = (id) => removedItemIds.includes(id);

  const summaries = packingCategorySummaries(groups, state);
  const totalItems = summaries.reduce((n, g) => n + g.total, 0);
  const done = summaries.reduce((n, g) => n + g.done, 0);
  const progress = totalItems ? Math.round((done / totalItems) * 100) : 0;

  const allGeneratedItems = (groups || []).flatMap((g) => g.items);
  const removedEntries = removedItemIds
    .map((id) => allGeneratedItems.find((it) => it.id === id))
    .filter(Boolean);

  const addCustom = () => {
    const label = newItem.trim();
    if (!label) return;
    onAdd(label, newCat);
    setNewItem("");
  };
  const confirmReset = () => { onReset(); setResetOpen(false); };

  const handleDelete = (id, label) => {
    onDelete(id);
    toast({
      description: `"${label}" removed from your packing list`,
      action: (
        <ToastAction altText="Undo remove" onClick={() => onRestore(id)}>
          Undo
        </ToastAction>
      )
    });
  };

  const togglePackAll = (categoryGroup) => {
    const ids = categoryGroup.items.map((it) => it.id);
    onSetChecked(ids, !categoryGroup.allPacked);
  };

  // nav.onSelect (wired by TripView) already sets activeId AND scrolls --
  // calling scrollToId again here as well as double-invoked
  // el.scrollIntoView({behavior:"smooth"}) in the same tick, which made the
  // second call cancel the first's in-flight animation before it moved the
  // page at all.
  const jumpTo = (id) => {
    if (nav && nav.onSelect) nav.onSelect(id);
  };

  return (
    <div>
      {/* Sticky on mobile only, pinned below the L1/L2/L3 stack (scrollOffset
          already accounts for that stack's measured height) -- see docs/
          wherenova-fixes brief, Build A #1. */}
      <div
        className="sticky md:static z-10 bg-wn-page-l -mx-4 px-4 md:mx-0 md:px-0 mb-4"
        style={{ top: scrollOffset }}
      >
        <PackingRing percent={progress} done={done} total={totalItems} onReset={() => setResetOpen(true)} />
      </div>

      <h2 className="font-display text-sm font-bold text-wn-text-l mb-4">Packing list</h2>

      <div className="mb-6">
        <Label>Add a custom item</Label>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="e.g. Travel pillow"
            className="min-h-11 flex-1 bg-wn-surface-2-l"
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <Select value={newCat} onValueChange={setNewCat}>
            <SelectTrigger className="min-h-11 sm:w-48 bg-wn-surface-2-l" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(groups || []).map((g) => (
                <SelectItem key={g.category} value={g.category}>{g.category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addCustom} className="bg-wn-text-l hover:bg-wn-text-l/90 text-white min-h-11">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-8 md:items-start">
        {/* Desktop sidebar -- scroll-to-anchor list, never a filter. Every
            category stays rendered in the main column regardless of what's
            selected here. */}
        {nav && nav.items.length > 0 && (
          <nav
            aria-label="Packing categories"
            className="hidden md:block sticky"
            style={{ top: scrollOffset + 16 }}
          >
            <ul className="space-y-0.5">
              {nav.items.map((item) => {
                const summary = summaries.find((s) => s.id === item.id);
                const active = nav.activeId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => jumpTo(item.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm min-h-9 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan",
                        active
                          ? "bg-wn-text-l text-white font-semibold"
                          : "text-wn-text-2-l hover:bg-wn-surface-2-l hover:text-wn-text-l"
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      {summary && (
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums flex-shrink-0",
                            summary.allPacked
                              ? (active ? "text-wn-cyan-bright" : "text-wn-cyan-2")
                              : (active ? "text-white/70" : "text-wn-text-3-l")
                          )}
                        >
                          {summary.done}/{summary.total}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className="space-y-6 min-w-0">
          {summaries.map((group) => (
            <div key={group.category} id={group.id} style={{ scrollMarginTop: scrollOffset + 12 }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="font-display text-sm font-bold text-wn-text-l">{group.category}</h3>
                <button
                  type="button"
                  onClick={() => togglePackAll(group)}
                  className="text-xs font-semibold text-wn-text-l underline decoration-wn-line-2-l underline-offset-2 hover:decoration-wn-text-l min-h-9 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
                >
                  {group.allPacked ? "Unpack all" : "Pack all"}
                </button>
              </div>
              <ul className="divide-y divide-wn-line-l">
                {group.items.map((item) => (
                  <PackingRow
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    custom={!!item.custom}
                    checked={checkedItemIds.includes(item.id) && !isRemoved(item.id)}
                    onToggle={onToggle}
                    onRemove={item.custom ? onRemove : undefined}
                    onDelete={!item.custom ? () => handleDelete(item.id, item.label) : undefined}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {removedEntries.length > 0 && (
        <div className="mt-6 pt-4 border-t border-wn-line-l">
          <button
            type="button"
            onClick={() => setShowRemoved((v) => !v)}
            aria-expanded={showRemoved}
            className="text-xs font-medium text-wn-text-2-l hover:text-wn-text-l underline decoration-wn-line-2-l underline-offset-2 min-h-9 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
          >
            {removedEntries.length} item{removedEntries.length === 1 ? "" : "s"} removed — {showRemoved ? "hide" : "show"}
          </button>
          {showRemoved && (
            <ul className="mt-2 divide-y divide-wn-line-l">
              {removedEntries.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 min-h-11">
                  <span className="text-sm text-wn-text-2-l">{item.label}</span>
                  <button
                    type="button"
                    onClick={() => onRestore(item.id)}
                    className="flex-shrink-0 text-xs font-semibold text-wn-text-l underline decoration-wn-line-2-l underline-offset-2 min-h-9 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
                  >
                    Add back
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset packing progress?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears all checked items and custom items for this trip.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The entire row is the toggle target (not just the checkbox) -- a single
// <button> wraps the checkbox visual + label so the full-width hit area is
// one real interactive element. The delete/remove affordance stays a
// separate sibling button: nesting it inside the row button would be
// invalid HTML and would make "delete" and "toggle" the same click target.
function PackingRow({ id, label, checked, onToggle, custom, onRemove, onDelete }) {
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onToggle(id)}
        role="checkbox"
        aria-checked={checked}
        className="flex-1 flex items-center gap-3 py-3 min-h-11 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan hover:bg-wn-surface-2-l/70 -mx-1 px-1"
      >
        <span
          aria-hidden="true"
          className={cn(
            "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors",
            checked ? "bg-wn-text-l text-white" : "ring-1 ring-wn-line-l bg-wn-surface-l"
          )}
        >
          {checked && <Check className="w-4 h-4" />}
        </span>
        <span className={cn("text-sm flex-1", checked ? "line-through text-wn-text-2-l" : "text-wn-text-l")}>
          {label}
        </span>
      </button>
      {custom && (
        <button
          onClick={() => onRemove(id)}
          aria-label={`Remove ${label}`}
          className="text-wn-text-2-l hover:text-destructive p-1 min-h-9 min-w-9 flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      {!custom && onDelete && (
        <button
          onClick={onDelete}
          aria-label={`Remove ${label} from packing list`}
          className="flex-shrink-0 flex items-center justify-center min-h-11 min-w-11 rounded-full text-wn-text-3-l hover:text-destructive hover:bg-wn-surface-2-l focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}
