import { cn } from "@/lib/utils";

/** Alfred's mark: a bow tie. The butler, abstracted to two triangles. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg border",
        className,
      )}
      style={{
        borderColor: "color-mix(in oklab, var(--brand) 35%, transparent)",
        background: "var(--brand-wash)",
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
        <path
          d="M11 8.6 4.6 5.3A1 1 0 0 0 3 6.2v11.6a1 1 0 0 0 1.6.9L11 15.4z"
          fill="var(--brand)"
        />
        <path
          d="M13 8.6l6.4-3.3a1 1 0 0 1 1.6.9v11.6a1 1 0 0 1-1.6.9L13 15.4z"
          fill="var(--brand)"
        />
        <rect
          x="10.4"
          y="9.4"
          width="3.2"
          height="5.2"
          rx="1"
          fill="var(--brand)"
          opacity="0.55"
        />
      </svg>
    </span>
  );
}
