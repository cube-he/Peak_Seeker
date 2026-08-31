/** @jest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentDetailPage from '../page';

const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockBaseStudentData = {
  id: 1,
  realName: '测试学生',
  dataVersion: 1,
  status: 'ACTIVE',
  intakeStatus: 'DRAFT',
  examYear: 2026,
  examType: 'PHYSICS',
  province: '四川',
  city: '成都市',
  county: '锦江区',
  examLocationProvince: null,
  examLocationCity: null,
  examLocationCounty: null,
  totalScore: 600,
  provincialRank: 1,
  rankCheck: {
    calculatedRank: 28500,
    currentRank: 1,
    isMismatch: true,
    difference: -28499,
    requestedYear: 2026,
    sourceYear: 2026,
    isEstimated: false,
    source: 'score-segment',
  },
  progress: {
    studentSelfCompleteness: 80,
    teacherDataCompleteness: 70,
    overallCompleteness: 75,
    isRecommendable: true,
    missingFieldsForRecommend: [],
  },
};
let mockStudentData = mockBaseStudentData;
let mockAttachmentsData: any[] = [];
let mockAdmissionResultData: any = null;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: () => ({
    getPropertyValue: () => '',
  }),
});

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey?: unknown[] }) => {
    if (queryKey?.[0] === 'student-attachments') {
      return { data: mockAttachmentsData, isLoading: false };
    }
    if (queryKey?.[0] === 'student-admission-result') {
      return { data: mockAdmissionResultData, isLoading: false };
    }
    return { data: mockStudentData, isLoading: false };
  },
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/components/policy/BonusCalcCard', () => ({
  __esModule: true,
  default: function MockBonusCalcCard() {
    return <div>加分测算</div>;
  },
}));

jest.mock('@/components/student/picker/options/useProvinceOptions', () => ({
  useProvinceOptions: () => ({
    data: [{ label: '四川省', value: '四川省' }],
    isLoading: false,
  }),
}));

jest.mock('@/components/student/picker/options/useCityOptions', () => ({
  useCityOptions: () => ({
    data: [{ label: '成都市', value: '成都市' }],
    isLoading: false,
  }),
}));

jest.mock('@/components/student/picker/options/useUniversityOptions', () => ({
  useUniversityOptions: () => ({
    data: [{ label: '四川大学', value: '四川大学' }],
    isLoading: false,
  }),
}));

jest.mock('@/components/student/picker/options/useMajorOptions', () => ({
  useMajorOptions: () => ({
    data: [{ label: '计算机科学与技术', value: '计算机科学与技术' }],
    isLoading: false,
  }),
}));

jest.mock('@/components/student/picker/options/useMajorCategoryOptions', () => ({
  useMajorCategoryOptions: () => ({
    data: [{ label: '计算机类', value: '计算机类' }],
    isLoading: false,
  }),
}));

// sd-subtabs: 资料 tab 现为 2 子页 (必填资料 / 选填资料), 各子页内含多个字段分组.
// required 子页: 基本身份 / 户籍 / 考试成绩 / 色觉 (同时渲染).
// optional 子页: 政治面貌与加分 / 健康与体检 / 偏好与规划 (OptionalSection, 默认展开除健康外).
async function gotoSubtab(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  // 缺失项 mchip 也是 role=button, 精确取 .sd-subtab
  const subtab = screen
    .getAllByRole('button', { name })
    .find((b) => b.classList.contains('sd-subtab'));
  if (!subtab) throw new Error(`sd-subtab not found: ${name.source}`);
  await user.click(subtab);
}

describe('StudentDetailPage', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockInvalidateQueries.mockClear();
    mockStudentData = {
      ...mockBaseStudentData,
      rankCheck: { ...mockBaseStudentData.rankCheck },
      progress: { ...mockBaseStudentData.progress },
    };
    mockAttachmentsData = [];
    mockAdmissionResultData = null;
  });

  // 该 jest 配置未启用 RTL 自动清理, 显式卸载避免跨测试 DOM 累积导致多元素匹配
  afterEach(() => cleanup());

  it('shows concrete options for preference and bonus selects', async () => {
    const user = userEvent.setup();
    const { container } = render(<StudentDetailPage />);

    // 偏好与加分均在「选填资料」子页 (OptionalSection 默认展开)
    await gotoSubtab(user, /选填资料/);

    await openSelect(container, user, 'preferredProvinces');
    expect((await screen.findAllByText('四川省')).length).toBeGreaterThan(0);

    await openSelect(container, user, 'preferredCities');
    expect((await screen.findAllByText('成都市')).length).toBeGreaterThan(0);

    await openSelect(container, user, 'preferredUniversities');
    expect((await screen.findAllByText('四川大学')).length).toBeGreaterThan(0);

    await openSelect(container, user, 'bonusItems');
    expect((await screen.findAllByText('烈士子女 +20')).length).toBeGreaterThan(0);
  });

  it('marks provincial rank mismatch against the score-segment calculation', async () => {
    const user = userEvent.setup();
    render(<StudentDetailPage />);

    // 考试成绩在「必填资料」子页 (默认激活, 显式点一次更稳)
    await gotoSubtab(user, /必填资料/);

    expect(
      screen.getByText((text) => text.includes('28,500') && text.includes('1')),
    ).toBeInTheDocument();
  });

  it('labels temporary 2025 score segment data used for 2026 rank checks', async () => {
    mockStudentData = {
      ...mockBaseStudentData,
      totalScore: 479,
      rankCheck: {
        calculatedRank: 156000,
        currentRank: 1,
        isMismatch: true,
        difference: -155999,
        requestedYear: 2026,
        sourceYear: 2025,
        isEstimated: true,
        source: 'score-segment',
      },
    };

    const user = userEvent.setup();
    render(<StudentDetailPage />);

    // 考试成绩在「必填资料」子页
    await gotoSubtab(user, /必填资料/);

    expect(
      screen.getByText((text) => text.includes('按 2025 一分一段估算') && text.includes('156,000')),
    ).toBeInTheDocument();
  });

  it('uses region cascaders and can copy hukou location to exam registration location', async () => {
    const user = userEvent.setup();
    render(<StudentDetailPage />);

    // 户籍在「必填资料」子页 (与考试成绩同子页)
    await gotoSubtab(user, /必填资料/);

    // 户籍/报名地字段标签都在 (required 子页户籍组已渲染)
    expect(screen.getAllByText('户籍所在地').length).toBeGreaterThan(0);
    expect(screen.getAllByText('高考报名地').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /同户籍所在地/ }));
    await user.click(screen.getByRole('button', { name: /保存资料/ }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          province: '四川',
          city: '成都市',
          county: '锦江区',
          examLocationProvince: '四川',
          examLocationCity: '成都市',
          examLocationCounty: '锦江区',
        }),
      );
    });
  });

  // 整档保存: 在 A 子页编辑后切到 B 子页保存, A 的编辑也要进 payload (而非只存当前 B 子页)
  it('保存时提交所有访问过子页的编辑, 而非只当前子页', async () => {
    const user = userEvent.setup();
    render(<StudentDetailPage />);

    // 在「必填资料」子页的户籍组做一处编辑: 把户籍地复制到高考报名地
    await gotoSubtab(user, /必填资料/);
    await user.click(screen.getByRole('button', { name: /同户籍所在地/ }));

    // 切到「选填资料」子页 (必填子页随之卸载), 在这里点保存
    await gotoSubtab(user, /选填资料/);
    await user.click(screen.getByRole('button', { name: /保存资料/ }));

    // 户籍子页那处编辑必须一并提交 (旧逻辑只收当前挂载子页 → 会漏掉)
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          examLocationProvince: '四川',
          examLocationCity: '成都市',
          examLocationCounty: '锦江区',
        }),
      );
    });
  });

  it('selects a volunteer PDF for matching and supports manual group adjustment', async () => {
    mockAttachmentsData = [
      {
        id: 11,
        studentId: 1,
        category: 'submission_screenshot',
        originalName: '旧志愿.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        uploadedById: 1,
      },
      {
        id: 13,
        studentId: 1,
        category: 'submission_screenshot',
        originalName: '新志愿.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
        uploadedById: 1,
      },
      {
        id: 14,
        studentId: 1,
        category: 'submission_screenshot',
        originalName: '志愿照片.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100,
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
        uploadedById: 1,
      },
      {
        id: 21,
        studentId: 1,
        category: 'admission_proof',
        originalName: '录取截图.png',
        mimeType: 'image/png',
        fileSize: 100,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        uploadedById: 1,
      },
      {
        id: 22,
        studentId: 1,
        category: 'admission_proof',
        originalName: '第二张录取截图.png',
        mimeType: 'image/png',
        fileSize: 100,
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
        uploadedById: 1,
      },
    ];

    const user = userEvent.setup();
    const { container } = render(<StudentDetailPage />);
    await user.click(screen.getByRole('button', { name: '材料归档' }));

    expect(await screen.findByText('匹配志愿 PDF')).toBeInTheDocument();
    expect(screen.getByText('新志愿.pdf')).toBeInTheDocument();
    expect(screen.queryByText('志愿照片.jpg')).not.toBeInTheDocument();

    await openSelect(container, user, 'admissionSubmissionAttachmentId');
    await user.click(await screen.findByText('旧志愿.pdf'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          proofAttachmentId: 21,
          submissionAttachmentId: 11,
        }),
      );
    });

    const majorSequenceInput = screen.getByLabelText('录取专业顺序');
    await user.type(majorSequenceInput, '3');
    await user.click(screen.getByRole('checkbox', { name: '同院校专业组内调剂' }));
    expect(majorSequenceInput).toBeDisabled();
    expect(majorSequenceInput).toHaveValue('');

    await user.click(screen.getByRole('checkbox', { name: '同院校专业组内调剂' }));
    await user.type(screen.getByLabelText('录取志愿顺序'), '2');
    await user.type(majorSequenceInput, '4');

    // Manual positions belong to the selected volunteer PDF. Switching from
    // A to B must discard them before the B analysis starts.
    await openSelect(container, user, 'admissionSubmissionAttachmentId');
    const newPdfOption = Array.from(
      document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
    ).find((option) => option.textContent?.includes('新志愿.pdf'));
    expect(newPdfOption).toBeTruthy();
    await user.click(newPdfOption as HTMLElement);
    expect(screen.getByLabelText('录取志愿顺序')).toHaveValue('');
    expect(majorSequenceInput).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: '同院校专业组内调剂' })).not.toBeChecked();
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          proofAttachmentId: 21,
          submissionAttachmentId: 13,
        }),
      );
    });

    // Clearing the source has the same invalidation semantics.
    await openSelect(container, user, 'admissionSubmissionAttachmentId');
    const oldPdfOption = Array.from(
      document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
    ).find((option) => option.textContent?.includes('旧志愿.pdf'));
    expect(oldPdfOption).toBeTruthy();
    await user.click(oldPdfOption as HTMLElement);
    await user.type(screen.getByLabelText('录取志愿顺序'), '2');
    await user.type(majorSequenceInput, '4');
    const submissionSelector = container
      .querySelector('#admissionSubmissionAttachmentId')
      ?.closest('.ant-select');
    expect(submissionSelector).toBeTruthy();
    await user.hover(submissionSelector as HTMLElement);
    await user.click(submissionSelector?.querySelector('.ant-select-clear') as HTMLElement);
    expect(screen.getByLabelText('录取志愿顺序')).toHaveValue('');
    expect(majorSequenceInput).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: '同院校专业组内调剂' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /保存录取结果/ })).toBeDisabled();

    await openSelect(container, user, 'admissionSubmissionAttachmentId');
    await user.click(await screen.findByText('旧志愿.pdf'));
    await user.type(screen.getByLabelText('录取院校'), '上一张院校');
    await user.type(screen.getByLabelText('录取专业'), '上一张专业');
    await user.type(screen.getByLabelText('录取最低分'), '500');

    await openSelect(container, user, 'proofAttachmentId');
    const secondProofOption = Array.from(
      document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
    ).find((option) => option.textContent?.includes('第二张录取截图.png'));
    expect(secondProofOption).toBeTruthy();
    await user.click(secondProofOption as HTMLElement);
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ proofAttachmentId: 22 }),
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText('录取院校')).toHaveValue('');
      expect(screen.getByLabelText('录取专业')).toHaveValue('');
    });
    expect(screen.getByLabelText('录取最低分')).toHaveValue('500');
  });
});

async function openSelect(
  container: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
  id: string,
) {
  const selector = container.querySelector(`#${id}`);
  expect(selector).toBeTruthy();
  await user.click(selector as HTMLElement);
  await waitFor(() => {
    expect(document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toBeTruthy();
  });
}
