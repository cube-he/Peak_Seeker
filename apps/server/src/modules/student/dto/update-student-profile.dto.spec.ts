import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStudentProfileDto } from './update-student-profile.dto';

describe('UpdateStudentProfileDto.preferredBatches', () => {
  it('accepts arbitrary batch name strings (not constrained to Batch enum)', async () => {
    const dto = plainToInstance(UpdateStudentProfileDto, {
      preferredBatches: ['本科提前批A段', '本科批A段', '高职专科批'],
    });
    const errors = await validate(dto);
    const batchErrors = errors.filter((e) => e.property === 'preferredBatches');
    expect(batchErrors).toHaveLength(0);
  });

  it('rejects non-string array elements', async () => {
    const dto = plainToInstance(UpdateStudentProfileDto, {
      preferredBatches: [123, true],
    });
    const errors = await validate(dto);
    const batchErrors = errors.filter((e) => e.property === 'preferredBatches');
    expect(batchErrors.length).toBeGreaterThan(0);
  });
});
