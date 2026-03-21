import { useMemo } from 'react'
import {
  Heart,
  CheckSquare,
  DollarSign,
  Calendar,
  MessageSquare,
  Lightbulb,
  TrendingUp,
  ArrowRight,
} from 'lucide-react'

interface ProgressDashboardProps {
  weddingDate: Date | null
  checklistStats: {
    total: number
    completed: number
    overdue: number
  }
  budgetStats: {
    totalBudget: number
    totalSpent: number
  } | null
  calendarEventCount: number
  threadCount: number
}

function ProgressRing({ percentage }: { percentage: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-stone-200"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#A2B29D"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-stone-800">{Math.round(percentage)}%</span>
        <span className="text-[10px] text-stone-500">ready</span>
      </div>
    </div>
  )
}

function MiniProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full h-1.5 rounded-full bg-stone-200 mt-2">
      <div
        className="h-1.5 rounded-full bg-primary"
        style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
      />
    </div>
  )
}

export default function ProgressDashboard({
  weddingDate,
  checklistStats,
  budgetStats,
  calendarEventCount,
  threadCount,
}: ProgressDashboardProps) {
  const daysUntilWedding = useMemo(() => {
    if (!weddingDate) return null
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const target = new Date(weddingDate)
    target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }, [weddingDate])

  const formattedDate = useMemo(() => {
    if (!weddingDate) return ''
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(weddingDate)
  }, [weddingDate])

  const readinessScore = useMemo(() => {
    let score = 0

    // Checklist progress: 50%
    if (checklistStats.total > 0) {
      score += (checklistStats.completed / checklistStats.total) * 50
    }

    // Budget: 25%
    if (budgetStats) {
      score += 12.5 // budget exists = half credit
      if (budgetStats.totalBudget > 0 && budgetStats.totalSpent / budgetStats.totalBudget > 0.5) {
        score += 12.5 // >50% tracked = full 25%
      }
    }

    // Calendar: 15%
    if (calendarEventCount >= 3) {
      score += 15
    } else if (calendarEventCount > 0) {
      score += (calendarEventCount / 3) * 15
    }

    // Threads: 10%
    if (threadCount >= 5) {
      score += 10
    } else if (threadCount > 0) {
      score += (threadCount / 5) * 10
    }

    return Math.min(score, 100)
  }, [checklistStats, budgetStats, calendarEventCount, threadCount])

  const nextSteps = useMemo(() => {
    const steps: string[] = []
    if (checklistStats.overdue > 0) {
      steps.push(`You have ${checklistStats.overdue} overdue task${checklistStats.overdue > 1 ? 's' : ''} — check your planner`)
    }
    if (!budgetStats) {
      steps.push('Set up your budget tracker to stay on top of spending')
    }
    if (checklistStats.total < 5) {
      steps.push('Ask Viva in Planner mode to create a wedding timeline')
    }
    if (calendarEventCount < 3) {
      steps.push('Save important dates to your calendar')
    }
    if (!weddingDate) {
      steps.push('Set your wedding date in your profile')
    }
    return steps.slice(0, 3)
  }, [checklistStats, budgetStats, calendarEventCount, weddingDate])

  const isEmpty =
    checklistStats.total === 0 &&
    !budgetStats &&
    calendarEventCount === 0 &&
    threadCount === 0 &&
    !weddingDate

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Heart className="w-12 h-12 text-primary mb-4" />
        <h2 className="font-headline text-2xl text-stone-800 mb-2">Welcome to Wedding Ease</h2>
        <p className="text-sm text-stone-500 max-w-sm">
          Your wedding planning journey starts here. Chat with Viva to create a checklist, set your
          wedding date, and start organizing the big day.
        </p>
        <div className="mt-6 flex items-center gap-1.5 text-primary text-sm font-medium">
          <span>Start a conversation</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    )
  }

  const budgetPct =
    budgetStats && budgetStats.totalBudget > 0
      ? Math.round((budgetStats.totalSpent / budgetStats.totalBudget) * 100)
      : 0

  return (
    <div className="space-y-6 pb-4">
      {/* Wedding Countdown */}
      <div className="text-center py-4">
        {daysUntilWedding !== null ? (
          <>
            <Heart className="w-6 h-6 text-primary mx-auto mb-2" fill="#A2B29D" />
            <div className="text-2xl font-bold text-stone-800">
              {daysUntilWedding > 0 ? daysUntilWedding : 0}
            </div>
            <div className="text-sm text-stone-600">
              {daysUntilWedding > 0
                ? 'days until your wedding'
                : daysUntilWedding === 0
                  ? "Today's the day!"
                  : 'days since your wedding'}
            </div>
            <div className="text-xs text-stone-400 mt-1">{formattedDate}</div>
          </>
        ) : (
          <div className="text-sm text-stone-400">Set your wedding date to see countdown</div>
        )}
      </div>

      {/* Overall Readiness */}
      <div className="flex flex-col items-center gap-2">
        <ProgressRing percentage={readinessScore} />
        <div className="flex items-center gap-1 text-sm text-stone-600">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Overall readiness</span>
        </div>
      </div>

      {/* Category Cards 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        {/* Planning */}
        <div className="rounded-2xl bg-white/70 border border-[#EBE4D9] p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="text-xs text-stone-500 font-medium">Planning</span>
          </div>
          <div className="text-2xl font-bold text-stone-800">
            {checklistStats.completed}
            <span className="text-sm font-normal text-stone-400">/{checklistStats.total}</span>
          </div>
          <div className="text-xs text-stone-500">tasks complete</div>
          <MiniProgressBar value={checklistStats.completed} max={checklistStats.total} />
        </div>

        {/* Budget */}
        <div className="rounded-2xl bg-white/70 border border-[#EBE4D9] p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-stone-500 font-medium">Budget</span>
          </div>
          {budgetStats ? (
            <>
              <div className="text-2xl font-bold text-stone-800">
                ${budgetStats.totalSpent.toLocaleString()}
              </div>
              <div className="text-xs text-stone-500">
                of ${budgetStats.totalBudget.toLocaleString()} spent
              </div>
              <MiniProgressBar value={budgetStats.totalSpent} max={budgetStats.totalBudget} />
            </>
          ) : (
            <>
              <div className="text-sm text-stone-400 mt-1">Not set up</div>
              <div className="text-[10px] text-primary mt-1 flex items-center gap-0.5">
                <span>Set up budget</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </>
          )}
        </div>

        {/* Calendar */}
        <div className="rounded-2xl bg-white/70 border border-[#EBE4D9] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-xs text-stone-500 font-medium">Calendar</span>
          </div>
          <div className="text-2xl font-bold text-stone-800">{calendarEventCount}</div>
          <div className="text-xs text-stone-500">events scheduled</div>
        </div>

        {/* Conversations */}
        <div className="rounded-2xl bg-white/70 border border-[#EBE4D9] p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="text-xs text-stone-500 font-medium">Conversations</span>
          </div>
          <div className="text-2xl font-bold text-stone-800">{threadCount}</div>
          <div className="text-xs text-stone-500">threads</div>
        </div>
      </div>

      {/* What to do next */}
      {nextSteps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wide px-1">
            What to do next
          </h3>
          {nextSteps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-100 p-3"
            >
              <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <span className="text-sm text-stone-700">{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
