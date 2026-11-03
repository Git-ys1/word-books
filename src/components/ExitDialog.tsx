/**
 * 退出确认弹窗（手机上用 action sheet 样式）。
 * 完全随机模式下，有未复习错词时，退出动作会被改写为「进入错词复习」。
 */
interface Props {
  /** 未复习的错词数量 */
  wrongCount: number
  onStay: () => void
  /** 直接退出问答（回到首页） */
  onExit: () => void
  /** 进入错词复习 */
  onWrongReview: () => void
}

export default function ExitDialog({ wrongCount, onStay, onExit, onWrongReview }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-[2px]" onClick={onStay} />
      <div className="relative w-full max-w-[640px] animate-fade-up rounded-t-3xl bg-white p-4 pb-6 shadow-lift sm:max-w-[400px] sm:rounded-3xl sm:pb-4">
        <h3 className="px-2 pb-1 pt-1 text-[15px] font-semibold text-ink-900">要退出这一轮吗？</h3>
        <p className="px-2 pb-3 text-[12.5px] leading-relaxed text-ink-500">
          {wrongCount > 0
            ? `还有 ${wrongCount} 个错词没复习完，退出后会先进入错词复习，把它们过一遍再走。`
            : '进度已经存好了，下次可以接着背。'}
        </p>

        {wrongCount > 0 && (
          <button
            onClick={onWrongReview}
            className="mb-2 w-full rounded-2xl bg-brand-500 py-3.5 text-[15px] font-semibold text-white transition active:scale-[.99] active:bg-brand-600"
          >
            先复习 {wrongCount} 个错词
          </button>
        )}
        <button
          onClick={onExit}
          className="mb-2 w-full rounded-2xl bg-ink-100 py-3.5 text-[15px] font-medium text-ink-700 transition active:scale-[.99] active:bg-ink-200"
        >
          {wrongCount > 0 ? '略过，直接退出' : '退出'}
        </button>
        <button onClick={onStay} className="w-full rounded-2xl py-3 text-[14px] text-ink-400 active:text-ink-700">
          继续背
        </button>
      </div>
    </div>
  )
}
