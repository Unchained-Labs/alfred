"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { LayoutGrid, List } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  ApplicationCard,
  type BoardCardData,
} from "@/components/applications/application-card";
import { ApplicationList } from "@/components/applications/application-list";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ApplicationStage } from "@/db/schema";
import { BOARD_STAGES, STAGE_META } from "@/lib/stages";
import { cn } from "@/lib/utils";

function DraggableCard({ app }: { app: BoardCardData }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: app.id,
    data: { stage: app.stage },
  });

  return (
    <div ref={setNodeRef}>
      <ApplicationCard
        app={app}
        dragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners } as never}
      />
    </div>
  );
}

function Column({
  stage,
  apps,
  activeStage,
}: {
  stage: ApplicationStage;
  apps: BoardCardData[];
  activeStage: ApplicationStage | null;
}) {
  const meta = STAGE_META[stage];
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  // Only highlight columns that are a valid destination for the active card.
  const candidate = activeStage != null && activeStage !== stage;

  return (
    <div className="flex w-[17rem] shrink-0 flex-col lg:w-auto lg:min-w-0 lg:flex-1">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: `var(${meta.token})` }}
          aria-hidden
        />
        <h2 className="text-xs font-semibold text-ink">{meta.label}</h2>
        <span className="tnum rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
          {apps.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-32 flex-1 space-y-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver
            ? "border-[var(--brand)] bg-brand-wash"
            : candidate
              ? "border-line-strong bg-surface-2/40"
              : "border-line bg-surface-2/20",
        )}
      >
        {apps.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-ink-muted">
            {meta.hint}
          </p>
        ) : (
          apps.map((app) => <DraggableCard key={app.id} app={app} />)
        )}
      </div>
    </div>
  );
}

export function PipelineBoard({
  applications,
}: {
  applications: BoardCardData[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = React.useState<"board" | "list">("board");
  const [items, setItems] = React.useState(applications);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // The server is the source of truth; re-sync whenever it sends new data.
  React.useEffect(() => setItems(applications), [applications]);

  const sensors = useSensors(
    // A small distance threshold keeps the card's links clickable.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const active = items.find((app) => app.id === activeId) ?? null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    setActiveId(null);

    const target = event.over?.id as ApplicationStage | undefined;
    if (!target || !BOARD_STAGES.includes(target)) return;

    const moved = items.find((app) => app.id === id);
    if (!moved || moved.stage === target) return;

    const previous = items;
    // Optimistic: the card lands where it was dropped immediately.
    setItems((current) =>
      current.map((app) => (app.id === id ? { ...app, stage: target } : app)),
    );

    try {
      const response = await fetch(`/api/applications/${id}/move`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: target }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not move the application.");
      }
      toast.success(
        `${moved.company} → ${STAGE_META[target].label}`,
        moved.title,
      );
      router.refresh();
    } catch (error) {
      setItems(previous);
      toast.error(
        "Move failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const byStage = React.useMemo(() => {
    const map = new Map<ApplicationStage, BoardCardData[]>();
    for (const stage of BOARD_STAGES) map.set(stage, []);
    for (const app of items) {
      // Terminal stages live in the list view, not the board.
      map.get(app.stage)?.push(app);
    }
    return map;
  }, [items]);

  const closed = items.filter((app) => !BOARD_STAGES.includes(app.stage));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
          {(
            [
              { id: "board", label: "Board", Icon: LayoutGrid },
              { id: "list", label: "List", Icon: List },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                view === id
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {closed.length > 0 && view === "board" ? (
          <Button variant="ghost" size="sm" onClick={() => setView("list")}>
            {closed.length} closed — see list
          </Button>
        ) : null}
      </div>

      {view === "list" ? (
        <ApplicationList applications={items} />
      ) : (
        <DndContext
          // Without a stable id, dnd-kit's generated aria-describedby ids
          // differ between the server and client renders and React warns.
          id="alfred-pipeline"
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {/* Horizontal scroll on narrow screens; equal columns from lg up. */}
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
            {BOARD_STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                apps={byStage.get(stage) ?? []}
                activeStage={active?.stage ?? null}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
            {active ? (
              <div className="w-[16rem]">
                <ApplicationCard app={active} overlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
