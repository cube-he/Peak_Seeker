import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveAdmissionResultDto } from './save-admission-result.dto';

async function transformAndValidate(payload: Record<string, unknown>) {
  const dto = plainToInstance(SaveAdmissionResultDto, payload, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
}

describe('SaveAdmissionResultDto', () => {
  it('accepts and normalizes a complete valid admission result', async () => {
    const { dto, errors } = await transformAndValidate({
      admittedUniName: '  四川大学  ',
      admittedUniId: '12',
      admittedMinScore: '620',
      admittedMinRank: '12345',
      sequenceNo: '3',
      proofAttachmentId: '7',
      batchName: '  本科批  ',
      admittedMajorGroupCode: ' 101 ',
      admittedMajorCode: ' 37 ',
      admittedMajorName: ' 汉语言文学 ',
      admittedMajorId: '88',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      admittedUniName: '四川大学',
      admittedUniId: 12,
      admittedMinScore: 620,
      admittedMinRank: 12345,
      sequenceNo: 3,
      proofAttachmentId: 7,
      batchName: '本科批',
      admittedMajorGroupCode: '101',
      admittedMajorCode: '37',
      admittedMajorName: '汉语言文学',
      admittedMajorId: 88,
    });
  });

  it('treats blank optional fields as unfilled instead of converting them to zero', async () => {
    const { dto, errors } = await transformAndValidate({
      admittedUniName: '四川大学',
      admittedUniId: '',
      admittedMinScore: '',
      admittedMinRank: '',
      sequenceNo: '',
      proofAttachmentId: '',
      batchName: '   ',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      admittedUniId: null,
      admittedMinScore: null,
      admittedMinRank: null,
      sequenceNo: null,
      proofAttachmentId: null,
      batchName: null,
    });
  });

  it.each([
    [{ admittedUniName: '   ' }, 'admittedUniName'],
    [{ admittedUniName: '四川大学', admittedMinScore: -1 }, 'admittedMinScore'],
    [
      { admittedUniName: '四川大学', admittedMinScore: 751 },
      'admittedMinScore',
    ],
    [
      { admittedUniName: '四川大学', admittedMinScore: 620.5 },
      'admittedMinScore',
    ],
    [{ admittedUniName: '四川大学', admittedUniId: 0 }, 'admittedUniId'],
    [{ admittedUniName: '四川大学', admittedMinRank: 0 }, 'admittedMinRank'],
    [{ admittedUniName: '四川大学', sequenceNo: 0 }, 'sequenceNo'],
    [
      { admittedUniName: '四川大学', proofAttachmentId: 0 },
      'proofAttachmentId',
    ],
    [{ admittedUniName: '四川大学', admittedMajorId: 0 }, 'admittedMajorId'],
  ])('rejects invalid admission input %#', async (payload, property) => {
    const { errors } = await transformAndValidate(payload);
    expect(errors.some((error) => error.property === property)).toBe(true);
  });

  it('enforces database-backed string lengths and the strict whitelist', async () => {
    const { errors } = await transformAndValidate({
      admittedUniName: '川'.repeat(201),
      batchName: '批'.repeat(101),
      admittedMajorGroupCode: '1'.repeat(11),
      admittedMajorCode: '2'.repeat(11),
      admittedMajorName: '专业'.repeat(101),
      unexpected: 'must be rejected',
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'admittedUniName',
        'batchName',
        'admittedMajorGroupCode',
        'admittedMajorCode',
        'admittedMajorName',
        'unexpected',
      ]),
    );
  });
});
