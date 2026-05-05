interface LowConfidenceBannerProps {
  /** Hide the banner if the result set has no low-confidence items. */
  show: boolean;
}

export default function LowConfidenceBanner({ show }: LowConfidenceBannerProps) {
  if (!show) return null;
  return (
    <div className="bg-[#fef9e7] border-l-[3px] border-l-[#d4a843] px-4 py-2 rounded mb-4">
      <span className="text-xs text-[#6b4520]">
        ⚠ 当前预测基于 2024-2025 两年新高考数据，2026 招生计划尚未公布。结果仅供参考。
      </span>
    </div>
  );
}
