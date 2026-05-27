'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Modal, Spin, message } from 'antd';
import Link from 'next/link';
import { consultationApi } from '@/services/consultation-api';

export default function ClinicPage() {
  const qc = useQueryClient();
  const [confirmCallNext, setConfirmCallNext] = useState(false);
  const [notesInput, setNotesInput] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['clinic-state'],
    queryFn: () => consultationApi.getClinicState(),
    refetchInterval: 5000,
  });

  const callNextMutation = useMutation({
    mutationFn: (notes?: string) => consultationApi.callNext(notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic-state'] });
      setConfirmCallNext(false);
      setNotesInput('');
      message.success('已切换到下一号');
    },
  });

  if (isLoading || !data) {
    return <div className="py-20 text-center"><Spin /></div>;
  }

  const { inProgress, waiting, done } = data;

  return (
    <div className="space-y-5 p-6">
      <h1 className="m-0 text-xl font-semibold">坐诊面板</h1>

      <Card title="正在沟通">
        {inProgress ? (
          <div>
            <p className="m-0 text-2xl font-semibold">
              #{inProgress.queueNumber} · {inProgress.student?.user?.realName ?? '学生'}
            </p>
            <p className="m-0 text-xs text-text-muted">
              {inProgress.purpose ?? '--'} · 已开始 {formatElapsed(inProgress.startedAt)}
            </p>
            <Button
              type="primary"
              size="large"
              className="mt-3"
              onClick={() => setConfirmCallNext(true)}
            >
              完成当前 → 叫下一号
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前无进行中的沟通" />
            {waiting.length > 0 ? (
              <Button type="primary" onClick={() => setConfirmCallNext(true)}>
                叫第 #{waiting[0].queueNumber} 号
              </Button>
            ) : null}
          </div>
        )}
      </Card>

      <Card title={`等待队列 (${waiting.length})`}>
        {waiting.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无等待" />
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {waiting.map((c: any) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2"
              >
                <div>
                  <p className="m-0 text-sm font-medium">
                    #{c.queueNumber} · {c.student?.user?.realName ?? '学生'}
                  </p>
                  <p className="m-0 text-xs text-text-muted">
                    {c.purpose ?? '--'} · 估 {c.durationEst ?? '?'} 分
                  </p>
                </div>
                <Link href={`/teacher/students/${c.studentId}?tab=comm`} className="text-xs text-primary no-underline">
                  详情
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`已完成 (${done.length})`}>
        {done.length === 0 ? (
          <p className="m-0 text-text-muted">--</p>
        ) : (
          <ul className="m-0 list-none space-y-1 p-0">
            {done.map((c: any) => (
              <li key={c.id} className="text-xs text-text-muted">
                #{c.queueNumber} · {c.student?.user?.realName ?? '学生'} · {c.durationAct ?? '?'} 分
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        title="完成当前并叫下一号"
        open={confirmCallNext}
        onCancel={() => setConfirmCallNext(false)}
        onOk={() => callNextMutation.mutate(notesInput || undefined)}
        confirmLoading={callNextMutation.isPending}
      >
        <p className="m-0 text-sm text-text-muted">
          这将结束 #{inProgress?.queueNumber ?? '--'} 的沟通,开始下一个等待中的号。
        </p>
        <textarea
          className="mt-3 w-full rounded border border-border-subtle p-2 text-sm"
          rows={3}
          placeholder="可选:当前沟通备注"
          value={notesInput}
          onChange={(e) => setNotesInput(e.target.value)}
        />
      </Modal>
    </div>
  );
}

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '--';
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  return `${elapsed} 分`;
}
