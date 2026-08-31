import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyzeAdmissionResultDto } from './analyze-admission-result.dto';

async function validatePayload(payload: Record<string, unknown>) {
  const dto = plainToInstance(AnalyzeAdmissionResultDto, payload, {
    enableImplicitConversion: true,
  });
  return { dto, errors: await validate(dto) };
}

describe('AnalyzeAdmissionResultDto', () => {
  it('accepts a proof and optional submission PDF attachment id', async () => {
    const { dto, errors } = await validatePayload({
      proofAttachmentId: '7',
      submissionAttachmentId: '12',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      proofAttachmentId: 7,
      submissionAttachmentId: 12,
    });
  });

  it.each([
    [{}, 'proofAttachmentId'],
    [{ proofAttachmentId: 0 }, 'proofAttachmentId'],
    [{ proofAttachmentId: 7, submissionAttachmentId: 0 }, 'submissionAttachmentId'],
  ])('rejects invalid attachment ids %#', async (payload, property) => {
    const { errors } = await validatePayload(payload);
    expect(errors.some((error) => error.property === property)).toBe(true);
  });
});
