import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStudentProfileDto } from './update-student-profile.dto';

async function validatePreferredBatches(value: unknown) {
  const dto = plainToInstance(UpdateStudentProfileDto, { preferredBatches: value });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'preferredBatches');
}

async function validateWithStrictPipe(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateStudentProfileDto, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('UpdateStudentProfileDto stage 1 contact fields', () => {
  it('accepts the student stage 1 identity payload under strict whitelist validation', async () => {
    const errors = await validateWithStrictPipe({
      dataVersion: 1,
      realName: 'Li Bai',
      phone: '13800138000',
      parentPhone: '13900139000',
      gender: 'MALE',
      ethnicity: '汉族',
      politicalStatus: 'LEAGUE_MEMBER',
      formFiller: 'STUDENT',
    });

    expect(errors).toHaveLength(0);
  });
});

describe('UpdateStudentProfileDto phone / parentPhone 二选一与格式', () => {
  async function phoneErrors(payload: Record<string, unknown>) {
    const errors = await validateWithStrictPipe(payload);
    return errors.filter((e) => e.property === 'phone' || e.property === 'parentPhone');
  }

  it('只填手机号、家长手机号留空字符串 — 不应报格式错(二选一渐进式录入)', async () => {
    // 这正是线上 bug 现场: phone 合法、parentPhone='' 时 @Matches 误报
    expect(await phoneErrors({ phone: '13880453034', parentPhone: '' })).toHaveLength(0);
  });

  it('两个手机号都留空字符串 — 不报格式错(空当未填, 完整度另算)', async () => {
    expect(await phoneErrors({ phone: '', parentPhone: '' })).toHaveLength(0);
  });

  it('手机号字段缺省/为 null — 不报格式错', async () => {
    expect(await phoneErrors({})).toHaveLength(0);
    expect(await phoneErrors({ phone: null, parentPhone: null })).toHaveLength(0);
  });

  it('填了非空但格式非法 — 必须报错', async () => {
    expect((await phoneErrors({ phone: '12345' })).length).toBeGreaterThan(0);
    expect((await phoneErrors({ parentPhone: '00000000000' })).length).toBeGreaterThan(0);
  });

  it('合法手机号通过', async () => {
    expect(await phoneErrors({ phone: '13800138000', parentPhone: '15912345678' })).toHaveLength(0);
  });
});

describe('UpdateStudentProfileDto.preferredBatches', () => {
  it('accepts arbitrary batch name strings', async () => {
    const errors = await validatePreferredBatches(['本科提前批A段', '本科批A段', '高职专科批']);
    expect(errors).toHaveLength(0);
  });

  it('rejects non-string array elements with isString constraint', async () => {
    const errors = await validatePreferredBatches([123, true]);
    expect(errors.length).toBeGreaterThan(0);
    // 检查报错来自 @IsString({ each: true })
    const errStr = JSON.stringify(errors);
    expect(errStr).toMatch(/isString/);
  });

  it('accepts empty array (optional + array)', async () => {
    const errors = await validatePreferredBatches([]);
    expect(errors).toHaveLength(0);
  });

  it('accepts undefined (field is optional)', async () => {
    const errors = await validatePreferredBatches(undefined);
    expect(errors).toHaveLength(0);
  });

  it('rejects single string (must be array)', async () => {
    const errors = await validatePreferredBatches('本科批A段');
    expect(errors.length).toBeGreaterThan(0);
    const errStr = JSON.stringify(errors);
    expect(errStr).toMatch(/isArray/);
  });
});

describe('UpdateStudentProfileDto.excludedMajorCategories', () => {
  it('accepts string array', async () => {
    const dto = plainToInstance(UpdateStudentProfileDto, {
      excludedMajorCategories: ['草学类', '林学类'],
    });
    const errors = await validate(dto);
    const e = errors.filter(x => x.property === 'excludedMajorCategories');
    expect(e).toHaveLength(0);
  });

  it('accepts undefined (optional)', async () => {
    const dto = plainToInstance(UpdateStudentProfileDto, {});
    const errors = await validate(dto);
    expect(errors.filter(x => x.property === 'excludedMajorCategories')).toHaveLength(0);
  });
});
