import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { StudentController } from './student.controller';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { SaveAdmissionResultDto } from './dto/save-admission-result.dto';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('StudentController', () => {
  let controller: StudentController;
  let studentService: {
    updateProfile: jest.Mock;
    saveAdmissionResult: jest.Mock;
  };
  let admissionMatchService: { analyze: jest.Mock };

  beforeEach(() => {
    studentService = {
      updateProfile: jest.fn(),
      saveAdmissionResult: jest.fn(),
    };
    admissionMatchService = { analyze: jest.fn() };
    controller = new StudentController(
      studentService as any,
      {} as any,
      admissionMatchService as any,
    );
  });

  function getPutRoutes() {
    const prototype = StudentController.prototype as Record<string, any>;

    return Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((methodName) => ({
        methodName,
        path: Reflect.getMetadata(PATH_METADATA, prototype[methodName]),
        requestMethod: Reflect.getMetadata(
          METHOD_METADATA,
          prototype[methodName],
        ),
      }))
      .filter((route) => route.requestMethod === RequestMethod.PUT);
  }

  it('keeps the profile update route and registers the legacy update route', () => {
    expect(getPutRoutes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ':id/profile' }),
        expect.objectContaining({ path: ':id' }),
      ]),
    );
  });

  it('passes the validated admission result DTO to the service', async () => {
    const dto = { admittedUniName: '四川大学' } as SaveAdmissionResultDto;
    const mockUser = { id: 42, role: 'TEACHER', teacherProfileId: 5 } as any;
    studentService.saveAdmissionResult.mockResolvedValue({ id: 1, ...dto });

    await controller.saveAdmissionResult(10, mockUser, dto);

    expect(studentService.saveAdmissionResult).toHaveBeenCalledWith(
      10,
      dto,
      mockUser,
    );
  });

  it('passes admission screenshot analysis to the dedicated service', async () => {
    const body = { proofAttachmentId: 7 } as any;
    const mockUser = { id: 42, role: 'TEACHER', teacherProfileId: 5 } as any;
    admissionMatchService.analyze.mockResolvedValue({ matchStatus: 'EXACT' });

    await controller.analyzeAdmissionResult(10, mockUser, body);

    expect(admissionMatchService.analyze).toHaveBeenCalledWith(
      10,
      body,
      mockUser,
    );
  });

  it('updates through the profile route', async () => {
    const dto = { totalScore: 479 } as UpdateStudentProfileDto;
    const updated = { id: 1, totalScore: 479 };
    const mockUser = { id: 42 } as any;
    studentService.updateProfile.mockResolvedValue(updated);

    await expect(controller.updateProfile(1, mockUser, dto)).resolves.toBe(
      updated,
    );

    expect(studentService.updateProfile).toHaveBeenCalledWith(
      1,
      dto,
      'teacher',
      42,
      undefined,
    );
  });

  it('updates through the legacy route using the same profile flow', async () => {
    const dto = { totalScore: 479 } as UpdateStudentProfileDto;
    const updated = { id: 1, totalScore: 479 };
    const mockUser = { id: 42 } as any;
    studentService.updateProfile.mockResolvedValue(updated);

    await expect(
      (controller as any).updateProfileLegacy(1, mockUser, dto),
    ).resolves.toBe(updated);

    expect(studentService.updateProfile).toHaveBeenCalledWith(
      1,
      dto,
      'teacher',
      42,
      undefined,
    );
  });
});
