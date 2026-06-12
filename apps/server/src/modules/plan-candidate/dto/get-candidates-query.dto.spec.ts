import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { GetCandidatesQueryDto } from './get-candidates-query.dto';

// 模拟全局 ValidationPipe 的 transform 选项 (main.ts: transform + enableImplicitConversion)
function build(raw: Record<string, unknown>): GetCandidatesQueryDto {
  return plainToInstance(GetCandidatesQueryDto, raw, {
    enableImplicitConversion: true,
  });
}

describe('GetCandidatesQueryDto boolean coercion', () => {
  // 回归: axios 把布尔序列化成字符串 'false'/'true' 进 query。
  // 旧实现用 @Type(()=>Boolean), Boolean('false') === true → 开关永久失效。
  describe('includeSoftFails (default true)', () => {
    it('缺省时为 true', () => {
      expect(build({}).includeSoftFails).toBe(true);
    });
    it("字符串 'false' → false (老师关掉'显示学费不符'要生效)", () => {
      expect(build({ includeSoftFails: 'false' }).includeSoftFails).toBe(false);
    });
    it("字符串 'true' → true", () => {
      expect(build({ includeSoftFails: 'true' }).includeSoftFails).toBe(true);
    });
    it('布尔 false → false', () => {
      expect(build({ includeSoftFails: false }).includeSoftFails).toBe(false);
    });
  });

  describe('excludeAdded (default true)', () => {
    it('缺省时为 true', () => {
      expect(build({}).excludeAdded).toBe(true);
    });
    it("字符串 'false' → false (老师勾'显示已填报组'要生效)", () => {
      expect(build({ excludeAdded: 'false' }).excludeAdded).toBe(false);
    });
    it("字符串 'true' → true", () => {
      expect(build({ excludeAdded: 'true' }).excludeAdded).toBe(true);
    });
  });
});
