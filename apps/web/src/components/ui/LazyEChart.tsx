'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Props {
  option: any;
  height?: number;
}

/**
 * 延迟挂载的 ECharts 容器。
 *
 * 直接用 ReactECharts 时，若图表位于未激活的 antd Tab 里（display:none），
 * echarts 会在 0 尺寸容器中初始化，切到可见后不会自动重画，导致图表空白。
 * 这里用 ResizeObserver 等容器真正可见（offsetWidth>0）后才挂载图表，
 * 保证 echarts 始终在正确尺寸下初始化。
 */
export default function LazyEChart({ option, height = 240 }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const check = () => {
      if (el.offsetWidth > 0) setVisible(true);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} style={{ minHeight: height }}>
      {visible && <ReactECharts option={option} style={{ height }} />}
    </div>
  );
}
