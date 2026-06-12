import { resolveBatchQueryShape } from './batch-alias';

describe('resolveBatchQueryShape', () => {
  it('国家/地方专项 → 本科批A段 + recruitType 收窄', () => {
    expect(resolveBatchQueryShape('本科批A段（国家专项）')).toEqual({
      batches: ['本科批A段'],
      recruitTypeContains: '国家专项',
    });
    expect(resolveBatchQueryShape('本科批A段（地方专项）')).toEqual({
      batches: ['本科批A段'],
      recruitTypeContains: '地方专项',
    });
  });

  it('简称/变体映射到数据实名', () => {
    expect(resolveBatchQueryShape('高职批').batches).toEqual(['高职(专科)批']);
    expect(resolveBatchQueryShape('省属高校少民预科').batches).toEqual(['本科批(省属高校少数民族预科)']);
    expect(resolveBatchQueryShape('本科批区域教育均衡专项').batches).toEqual(['本科批(区域教育均衡发展专项)']);
    expect(resolveBatchQueryShape('本科提前批国家专项').batches).toEqual(['本科提前批(国家专项)']);
  });

  it('半角括号变体也能命中', () => {
    expect(resolveBatchQueryShape('本科批A段(国家专项)')).toEqual({
      batches: ['本科批A段'],
      recruitTypeContains: '国家专项',
    });
  });

  it('两侧一致的批次原样返回', () => {
    expect(resolveBatchQueryShape('本科批B段')).toEqual({ batches: ['本科批B段'] });
    expect(resolveBatchQueryShape('本科提前批B段')).toEqual({ batches: ['本科提前批B段'] });
  });
});
