import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
  size?: 'sm' | 'md'
}

export default function ThemeToggle({ className, size = 'md' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const toggle = () => setTheme(isDark ? 'light' : 'dark')
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  const sizeCls = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const iconCls = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex items-center justify-center rounded-full',
        'text-foreground/70 hover:text-foreground',
        'hover:bg-foreground/5 active:bg-foreground/10',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
        sizeCls,
        className,
      )}
    >
      <Sun
        className={cn(
          iconCls,
          'absolute transition-all duration-300',
          isDark ? 'opacity-0 scale-50 rotate-90' : 'opacity-100 scale-100 rotate-0',
        )}
      />
      <Moon
        className={cn(
          iconCls,
          'absolute transition-all duration-300',
          isDark ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90',
        )}
      />
    </button>
  )
}
