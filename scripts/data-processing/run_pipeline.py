"""
数据处理管道 - 一条命令执行全部步骤
用法:
  python scripts/data-processing/run_pipeline.py              # 执行全部步骤
  python scripts/data-processing/run_pipeline.py --step=1     # 只执行Step 1
  python scripts/data-processing/run_pipeline.py --from=4     # 从Step 4开始
  python scripts/data-processing/run_pipeline.py --validate   # 只跑验证

配置: config.json (年份/文件路径/列映射/批次映射)
输出: output/ 目录下的JSON和SQL文件
"""
import subprocess
import sys
import os
import time
import json

sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

STEPS = [
    ('step1_score_segments.py', '一分一段表处理'),
    ('step2_batch_lines.py',    '批次线处理'),
    ('step3_main_data.py',      '03主表处理 (院校/专业/计划/录取)'),
    ('step4_fill_2025_gaps.py', '01 API补齐2025空缺'),
    ('step5_enrollment_groups.py', '04专业组数据补全'),
    ('step6_enrich_metadata.py',   '02国家库元数据丰富'),
    ('step7_supplementary.py',     '体检受限数据'),
    ('step8_validate.py',          '数据验证'),
    ('step9_policy_data.py',       '政策文件处理'),
]


def run_step(script, label, step_num):
    print(f"\n{'='*60}")
    print(f"Step {step_num}: {label}")
    print(f"{'='*60}")

    script_path = os.path.join(SCRIPT_DIR, script)
    start = time.time()

    result = subprocess.run(
        [sys.executable, script_path],
        capture_output=True, text=True, encoding='utf-8',
        cwd=os.path.join(SCRIPT_DIR, '..', '..'),
    )

    elapsed = time.time() - start

    if result.stdout:
        # 只显示非重复的输出（跳过Step脚本自己的分隔线）
        for line in result.stdout.strip().split('\n'):
            if not line.startswith('=' * 20):
                print(f"  {line}")

    if result.returncode != 0:
        print(f"\n  ✗ FAILED ({elapsed:.1f}s)")
        if result.stderr:
            print(f"  STDERR: {result.stderr[:500]}")
        return False

    print(f"\n  ✓ 完成 ({elapsed:.1f}s)")
    return True


def show_summary():
    """显示output目录的文件汇总"""
    output_dir = os.path.join(SCRIPT_DIR, 'output')
    if not os.path.exists(output_dir):
        return

    print(f"\n{'='*60}")
    print("产出文件汇总")
    print(f"{'='*60}")

    total_size = 0
    for f in sorted(os.listdir(output_dir)):
        fpath = os.path.join(output_dir, f)
        if os.path.isfile(fpath):
            size = os.path.getsize(fpath)
            total_size += size
            size_str = f'{size/1024:.0f}KB' if size < 1024*1024 else f'{size/1024/1024:.1f}MB'

            # JSON文件显示记录数
            count_str = ''
            if f.endswith('.json'):
                try:
                    with open(fpath, 'r', encoding='utf-8') as fp:
                        data = json.load(fp)
                    if isinstance(data, list):
                        count_str = f' ({len(data):,}条)'
                except:
                    pass

            print(f"  {size_str:>8s}  {f}{count_str}")

    print(f"\n  总计: {total_size/1024/1024:.1f}MB")


def main():
    args = sys.argv[1:]

    # 解析参数
    only_step = None
    from_step = 1
    only_validate = False

    for arg in args:
        if arg.startswith('--step='):
            only_step = int(arg.split('=')[1])
        elif arg.startswith('--from='):
            from_step = int(arg.split('=')[1])
        elif arg == '--validate':
            only_validate = True

    print("╔══════════════════════════════════════════════════════════╗")
    print("║          智愿家 数据处理管道 v1.0                        ║")
    print("╚══════════════════════════════════════════════════════════╝")

    # 加载config
    config_path = os.path.join(SCRIPT_DIR, 'config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        print(f"\n配置: 当前年份={config['current_year']}, 省份={config['province']}")
    else:
        print(f"\n⚠ 配置文件不存在: {config_path}")

    start_all = time.time()
    success = 0
    failed = 0

    if only_validate:
        run_step('step8_validate.py', '数据验证', 8)
    elif only_step:
        idx = only_step - 1
        if 0 <= idx < len(STEPS):
            script, label = STEPS[idx]
            run_step(script, label, only_step)
        else:
            print(f"无效步骤号: {only_step} (有效范围: 1-{len(STEPS)})")
    else:
        for i, (script, label) in enumerate(STEPS, 1):
            if i < from_step:
                continue
            ok = run_step(script, label, i)
            if ok:
                success += 1
            else:
                failed += 1
                print(f"\n⚠ Step {i} 失败，是否继续? (后续步骤可能依赖此步骤)")

    elapsed_all = time.time() - start_all

    show_summary()

    print(f"\n{'='*60}")
    print(f"管道执行完成: {success} 成功 / {failed} 失败 / 耗时 {elapsed_all:.0f}s")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
