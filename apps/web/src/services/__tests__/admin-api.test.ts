import api from '../api';
import { adminApi } from '../admin-api';

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

describe('adminApi student assignment helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries students with assignment filters mapped to the student endpoint', () => {
    adminApi.getStudents({
      search: 'Li',
      assignmentStatus: 'UNASSIGNED',
      teacherProfileId: 10,
      page: 2,
      pageSize: 50,
    });

    expect(api.get).toHaveBeenCalledWith('/students', {
      params: {
        keyword: 'Li',
        assignmentStatus: 'UNASSIGNED',
        teacherProfileId: 10,
        page: 2,
        pageSize: 50,
      },
    });
  });

  it('assigns or clears a student teacher through the existing assign endpoint', () => {
    adminApi.assignStudentTeacher(12, null);

    expect(api.put).toHaveBeenCalledWith('/students/12/assign', {
      teacherProfileId: null,
    });
  });
});
