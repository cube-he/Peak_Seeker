export type ExamType = '物理' | '历史' | '理科' | '文科';

/**
 * 跨年科类映射：把当前年的科类映射到目标年表里使用的科类。
 * 业内通行：物理↔理科 / 历史↔文科。2025 起四川改为物理/历史/理科/文科四类。
 */
export function mapExamType(current: ExamType, targetYear: number): ExamType {
  if (current === '理科' || current === '文科') return current;
  if (current === '物理') return targetYear <= 2024 ? '理科' : '物理';
  if (current === '历史') return targetYear <= 2024 ? '文科' : '历史';
  throw new Error(`不支持的科类: ${current}`);
}
