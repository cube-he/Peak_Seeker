import { resolveTransferPolicy } from './transfer-policy';

describe('resolveTransferPolicy', () => {
  it('transfer_difficulty 优先', () => {
    expect(
      resolveTransferPolicy({ transferDifficulty: '可申请，需绩点2.5', charterTransferLimit: '不得转入' }),
    ).toBe('可申请，需绩点2.5');
  });

  it('transfer_difficulty 空则回退 charter', () => {
    expect(
      resolveTransferPolicy({ transferDifficulty: null, charterTransferLimit: '不得转入其它专业' }),
    ).toBe('不得转入其它专业');
  });

  it('两者皆空返回 null', () => {
    expect(resolveTransferPolicy({ transferDifficulty: null, charterTransferLimit: null })).toBeNull();
  });

  it('纯空白视为空(td 空白→回退 charter, 并 trim)', () => {
    expect(
      resolveTransferPolicy({ transferDifficulty: '   ', charterTransferLimit: '  限制  ' }),
    ).toBe('限制');
  });

  it('字段缺失/对象为空也安全返回 null', () => {
    expect(resolveTransferPolicy({})).toBeNull();
    expect(resolveTransferPolicy(undefined)).toBeNull();
    expect(resolveTransferPolicy(null)).toBeNull();
  });
});
