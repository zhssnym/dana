import { useEffect, useState } from "react"

import { FolderPlus } from "../../lib/icons.js"
import { cn } from "../ui/utils.js"
import { T_FAST } from "./motion.js"

/* Resting this long on a row turns a reorder into a folder of the two. The
   badge's ring closes over exactly this duration, so the mode announces itself. */

export const DWELL_MS = 1500

export function MergeBadge({ armed }: { armed: boolean }) {
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const radius = 10
  const circumference = 2 * Math.PI * radius

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-[background-color,transform]",
        T_FAST,
        armed
          ? "scale-[1.03] bg-primary text-primary-foreground"
          : "bg-background text-primary ring-1 ring-border",
      )}
    >
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        {armed ? (
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-white/20" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            /* Rotated so the ring starts at twelve o'clock. */
            className="absolute inset-0 size-6 -rotate-90"
          >
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              className="stroke-border"
            />
            <circle
              cx="12"
              cy="12"
              r={radius}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-primary"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: grown ? 0 : circumference,
                transition: `stroke-dashoffset ${DWELL_MS}ms linear`,
              }}
            />
          </svg>
        )}
        <FolderPlus
          className={cn(
            "size-3.5",
            armed ? "text-primary-foreground" : "text-primary",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      <span className="text-xs font-medium whitespace-nowrap">
        {armed ? "Release to make a page" : "Hold to make a page"}
      </span>
    </span>
  )
}
