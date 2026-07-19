import { useId, useRef } from 'react'
import type { ReactNode } from 'react'

export interface TabItem {
  id: string
  label: string
  content: ReactNode
}

interface PixelTabsProps {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
}

/** Tabs acessíveis (tablist/tab/tabpanel) com navegação por setas. */
export function PixelTabs({ tabs, active, onChange }: PixelTabsProps): React.JSX.Element {
  const baseId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0]

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const idx = tabs.findIndex((t) => t.id === activeTab.id)
    let next = -1
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    if (next >= 0) {
      e.preventDefault()
      onChange(tabs[next].id)
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      buttons?.[next]?.focus()
    }
  }

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Seções do run"
        className="flex gap-1 border-b-2 border-night-600"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeTab.id
          return (
            <button
              key={tab.id}
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={`font-pixel cursor-pointer px-3 py-2 text-[11px] tracking-wide uppercase transition-colors ${
                selected
                  ? 'bg-night-700 text-cyan-glow shadow-[inset_0_-3px_0_0_var(--color-cyan-glow)]'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeTab.id}`}
        aria-labelledby={`${baseId}-tab-${activeTab.id}`}
        className="pt-4"
      >
        {activeTab.content}
      </div>
    </div>
  )
}
