'use client';

/**
 * 教师工作台 · 坐诊面板
 * 复刻自 `WillNest Design System/teacher/views/clinic.jsx`.
 * 三栏:正在沟通 / 等待队列 / 已完成,带"结束沟通"确认 Modal.
 * className: clinic-board / clinic-col / now-card / queue-list / done-list.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, DatePicker, Form, Input, Modal, Select, Spin, message,
} from 'antd';
const { RangePicker } = DatePicker;
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consultationApi } from '@/services/consultation-api';
import { studentApi } from '@/services/student-api';
import {
  Avatar,
  ChannelIcon,
  PageHeader,
  TIcon,
  fmtMins,
} from '@/components/willnest';

const CHANNEL_TXT: Record<string, string> = {
  phone: '电话',
  wechat: '微信',
  in_person: '线下',
  video: '视频',
};

const TONES = ['t-blue', 't-amber', 't-violet', 't-rose', 't-green'];
function pickTone(id: number | string): string {
  const n =
    typeof id === 'number'
      ? id
      : Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return TONES[Math.abs(n) % TONES.length];
}

function elapsedMin(startedAt: string | null | undefined): number {
  if (!startedAt) return 0;
  const t = new Date(startedAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}

function fmtTimeHM(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function ClinicPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['clinic-state'],
    queryFn: () => consultationApi.getClinicState(),
    refetchInterval: 5000,
  });

  // 老师邀约家长 — 复用 consultations.create (createdByActor='teacher', status='scheduled', 家长被动看到)
  // 学生列表延迟加载到 Modal 打开时
  const { data: studentsResp } = useQuery({
    queryKey: ['teacher-students-options'],
    queryFn: () => studentApi.getList({ pageSize: 200 }),
    enabled: inviteOpen,
    staleTime: 60_000,
  });
  const studentOptions = (() => {
    const raw: any[] = (studentsResp as any)?.data?.data ?? (studentsResp as any)?.data ?? [];
    return raw.map((s: any) => ({
      value: s.id,
      label: `${s.user?.realName ?? s.realName ?? `学生 ${s.id}`}${s.user?.phone ? ` · ${s.user.phone}` : ''}`,
    }));
  })();
  const inviteMutation = useMutation({
    // 串行: create → enqueue. 不 enqueue 的话 queueNumber=null, clinic 面板不显示.
    // enqueue 不挑日期, getClinicState 按 scheduledAt 当日过滤, 所以未来日期 enqueue 也安全
    // (今日预约立即入今日队列; 未来日期到那天才出现在面板).
    mutationFn: async (payload: any) => {
      const created = await consultationApi.create(payload);
      await consultationApi.enqueue(created.id);
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic-state'] });
      message.success('已为家长创建预约并加入等待队列');
      setInviteOpen(false);
      inviteForm.resetFields();
    },
    onError: (e: any) =>
      message.error(e?.response?.data?.message ?? '创建预约失败'),
  });

  const callNextMutation = useMutation({
    mutationFn: (notes?: string) => consultationApi.callNext(notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic-state'] });
      setEndModalOpen(false);
      setNotesInput('');
      message.success('已切换到下一号');
    },
  });

  if (isLoading || !data) {
    return (
      <div className="view-transition" style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const inProgress = data.inProgress;
  const waiting = data.waiting ?? [];
  const done = data.done ?? [];

  const todayMin = done.reduce((s: number, x: any) => s + (x.durationAct ?? 0), 0);
  const openStudent = (id: number | string) => router.push(`/teacher/students/${id}?tab=comm`);

  return (
    <>
      <div className="view-transition">
        <PageHeader
          eyebrow="LIVE CONSULTATION"
          title="实时沟通"
          meta={
            <>
              <span>
                今日已沟通 <span className="em">{done.length}</span> 次
              </span>
              <span className="dot" />
              <span>
                累计 <span className="em">{fmtMins(todayMin)}</span>
              </span>
              <span className="dot" />
              <span>
                当前 <span className="em">{inProgress ? 1 : 0}</span> 进行中 ·{' '}
                <span className="em">{waiting.length}</span> 排队
              </span>
            </>
          }
          fresh="实时"
          actions={
            <Button type="primary" onClick={() => setInviteOpen(true)}>
              邀约家长
            </Button>
          }
        />

        <div className="clinic-board fade-up d1">
          {/* —— 正在沟通 —— */}
          <div className="clinic-col t-now">
            <h3>
              <span className="ic">
                <TIcon.flame />
              </span>
              正在沟通
            </h3>
            {inProgress ? (
              <div className="now-card">
                <div className="top">
                  <Avatar
                    student={{
                      id: inProgress.studentId,
                      name: inProgress.student?.user?.realName ?? '学生',
                      initials: (inProgress.student?.user?.realName ?? '学')[0],
                      tone: 't-rose',
                    }}
                    size={40}
                  />
                  <div>
                    <div className="nm">{inProgress.student?.user?.realName ?? '学生'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      #{String(inProgress.queueNumber ?? '').padStart(2, '0')}
                    </div>
                  </div>
                  <span className="pulse">进行中</span>
                </div>
                <div className="topic">{inProgress.purpose ?? '—'}</div>
                <div className="timeline">
                  <div>
                    <span style={{ fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                      开始
                    </span>
                    <span className="em">{fmtTimeHM(inProgress.startedAt)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                      已沟通
                    </span>
                    <span className="em">
                      {elapsedMin(inProgress.startedAt)}{' '}
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                        分
                      </span>
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                      方式
                    </span>
                    <span
                      className="em"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontFamily: 'var(--font-body)',
                        fontSize: 14,
                        fontWeight: 500,
                        marginTop: 6,
                      }}
                    >
                      <span style={{ width: 12, height: 12, display: 'inline-flex' }}>
                        <ChannelIcon kind={inProgress.channel} />
                      </span>
                      {CHANNEL_TXT[inProgress.channel] ?? inProgress.channel}
                    </span>
                  </div>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn end"
                    onClick={() => setEndModalOpen(true)}
                  >
                    结束沟通
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => openStudent(inProgress.studentId)}
                  >
                    打开档案
                  </button>
                </div>
              </div>
            ) : (
              <div className="clinic-empty">
                <div
                  style={{
                    fontSize: 22,
                    fontFamily: 'var(--font-heading)',
                    color: 'var(--text-faint)',
                    marginBottom: 6,
                  }}
                >
                  —
                </div>
                当前无进行中的沟通
                {waiting.length > 0 ? (
                  <button
                    type="button"
                    style={{ marginTop: 12 }}
                    className="qa primary"
                    onClick={() => setEndModalOpen(true)}
                  >
                    叫第 #{String(waiting[0].queueNumber ?? 1).padStart(2, '0')} 号
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* —— 等待队列 —— */}
          <div className="clinic-col t-queue">
            <h3>
              <span className="ic">
                <TIcon.clock />
              </span>
              等待队列
              <span className="n">{waiting.length}</span>
            </h3>
            {waiting.length === 0 ? (
              <div className="clinic-empty">
                <div
                  style={{
                    fontSize: 22,
                    fontFamily: 'var(--font-heading)',
                    color: 'var(--text-faint)',
                    marginBottom: 6,
                  }}
                >
                  —
                </div>
                暂无等待
              </div>
            ) : (
              <>
                <div className="queue-list">
                  {waiting.map((q: any, i: number) => {
                    const name = q.student?.user?.realName ?? '学生';
                    return (
                      <div
                        className={`queue-item ${i === 0 ? 'next' : ''}`}
                        key={q.id}
                        onClick={() => openStudent(q.studentId)}
                      >
                        <span className="no">
                          {String(q.queueNumber ?? i + 1).padStart(2, '0')}
                        </span>
                        <Avatar
                          student={{
                            id: q.studentId,
                            name,
                            initials: name[0],
                            tone: pickTone(q.studentId),
                          }}
                          size={32}
                        />
                        <div className="who">
                          <div className="nm">{name}</div>
                          <div className="topic">{q.purpose ?? '—'}</div>
                        </div>
                        <span className="est">
                          <span
                            style={{
                              width: 11,
                              height: 11,
                              display: 'inline-flex',
                              marginRight: 3,
                              verticalAlign: -1,
                            }}
                          >
                            <ChannelIcon kind={q.channel} />
                          </span>
                          {q.durationEst ?? 30}m
                        </span>
                      </div>
                    );
                  })}
                </div>
                {inProgress ? (
                  <button
                    type="button"
                    className="queue-action"
                    onClick={() => setEndModalOpen(true)}
                  >
                    <TIcon.arrowRight /> 叫下一号 ·{' '}
                    {waiting[0].student?.user?.realName ?? '学生'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="queue-action"
                    onClick={() => callNextMutation.mutate(undefined)}
                  >
                    <TIcon.arrowRight /> 开始 ·{' '}
                    {waiting[0].student?.user?.realName ?? '学生'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* —— 已完成 —— */}
          <div className="clinic-col t-done">
            <h3>
              <span className="ic">
                <TIcon.check />
              </span>
              已完成
              <span className="n">{done.length}</span>
            </h3>
            {done.length === 0 ? (
              <div className="clinic-empty">
                <div
                  style={{
                    fontSize: 22,
                    fontFamily: 'var(--font-heading)',
                    color: 'var(--text-faint)',
                    marginBottom: 6,
                  }}
                >
                  —
                </div>
                今日尚无完成记录
              </div>
            ) : (
              <div className="done-list">
                {done.map((d: any) => (
                  <div className="done-item" key={d.id} onClick={() => openStudent(d.studentId)}>
                    <span className="when">{fmtTimeHM(d.endedAt ?? d.startedAt)}</span>
                    <span className="nm">{d.student?.user?.realName ?? '学生'}</span>
                    <span className="topic">{d.purpose ?? '—'}</span>
                    <span className="dur">{d.durationAct ?? '?'}m</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* —— 结束沟通 确认 Modal —— */}
      {endModalOpen && (
        <>
          <div className="clinic-modal-mask" onClick={() => setEndModalOpen(false)} />
          <div className="clinic-modal" role="dialog" aria-label="结束沟通确认">
            <div className="clinic-modal-head">
              <h3>{inProgress ? '结束当前沟通?' : '开始下一号?'}</h3>
              <button
                type="button"
                className="clinic-modal-close"
                onClick={() => setEndModalOpen(false)}
              >
                <TIcon.close />
              </button>
            </div>
            <div className="clinic-modal-body">
              <p>
                {inProgress ? (
                  <>
                    这将结束{' '}
                    <strong>
                      #{String(inProgress.queueNumber ?? '').padStart(2, '0')}
                    </strong>{' '}
                    ·{' '}
                    <strong>{inProgress.student?.user?.realName ?? '学生'}</strong>{' '}
                    的沟通
                    {waiting[0] ? (
                      <>
                        ,并开始下一个等待中的号 (
                        <strong>{waiting[0].student?.user?.realName ?? '学生'}</strong>
                        {waiting[0].purpose ? ` · ${waiting[0].purpose}` : ''})
                      </>
                    ) : null}
                    。
                  </>
                ) : (
                  <>
                    开始{' '}
                    <strong>#{String(waiting[0]?.queueNumber ?? 1).padStart(2, '0')}</strong>{' '}
                    ·{' '}
                    <strong>{waiting[0]?.student?.user?.realName ?? '学生'}</strong>{' '}
                    的沟通。
                  </>
                )}
              </p>
              {inProgress ? (
                <div className="clinic-modal-stats">
                  <div>
                    <span>已沟通时长</span>
                    <strong>{elapsedMin(inProgress.startedAt)} 分</strong>
                  </div>
                  <div>
                    <span>沟通主题</span>
                    <strong>{inProgress.purpose ?? '—'}</strong>
                  </div>
                  <div>
                    <span>沟通方式</span>
                    <strong>
                      {CHANNEL_TXT[inProgress.channel] ?? inProgress.channel}
                    </strong>
                  </div>
                </div>
              ) : null}
              <textarea
                style={{
                  marginTop: 12,
                  width: '100%',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  padding: 8,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
                rows={3}
                placeholder="可选:当前沟通备注 (会写入沟通记录)"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
              />
            </div>
            <div className="clinic-modal-foot">
              <button
                type="button"
                className="qa"
                onClick={() => setEndModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="qa primary"
                disabled={callNextMutation.isPending}
                onClick={() => callNextMutation.mutate(notesInput || undefined)}
              >
                <TIcon.check /> {callNextMutation.isPending ? '处理中...' : '确认'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* —— 邀约家长 Modal — 老师主动发起 (createdByActor=teacher, status=scheduled 直接生效) —— */}
      <Modal
        title="邀约家长沟通"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={() =>
          inviteForm.validateFields().then((values) => {
            // RangePicker 给 [start, end] 两个 Dayjs; 拆成 scheduledAt + durationEst
            const [start, end] = values.timeRange as [any, any];
            const durationEst = Math.max(5, Math.round((end.valueOf() - start.valueOf()) / 60000));
            inviteMutation.mutate({
              studentId: values.studentId,
              scheduledAt: start.toISOString(),
              channel: values.channel,
              durationEst,
              purpose: values.purpose,
              notes: values.notes,
            });
          })
        }
        okText="确认邀约"
        confirmLoading={inviteMutation.isPending}
        destroyOnClose
      >
        <Form form={inviteForm} layout="vertical" initialValues={{ channel: 'phone' }}>
          <Form.Item
            name="studentId"
            label="学生"
            rules={[{ required: true, message: '请选择学生' }]}
          >
            <Select
              showSearch
              placeholder="输入姓名或电话搜索"
              options={studentOptions}
              filterOption={(input, option) =>
                ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
              }
              loading={studentOptions.length === 0 && inviteOpen}
            />
          </Form.Item>
          <Form.Item
            name="timeRange"
            label="预约时段 (开始 → 结束)"
            rules={[{ required: true, message: '请选择时间段' }]}
          >
            <RangePicker
              showTime={{ format: 'HH:mm', minuteStep: 5 }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder={['开始时间', '结束时间']}
            />
          </Form.Item>
          <Form.Item name="channel" label="沟通方式" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '电话', value: 'phone' },
                { label: '微信', value: 'wechat' },
                { label: '线下', value: 'in_person' },
                { label: '视频', value: 'video' },
              ]}
            />
          </Form.Item>
          <Form.Item name="purpose" label="沟通主题">
            <Input placeholder="例: 讨论选校 / 强基备战 / 进度反馈" />
          </Form.Item>
          <Form.Item name="notes" label="备注 (可选)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
