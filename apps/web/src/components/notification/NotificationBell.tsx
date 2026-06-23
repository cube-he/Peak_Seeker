'use client';

import { useState } from 'react';
import { Badge, Dropdown, List, Button, Empty, Spin } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { notificationApi, type AppNotification } from '@/services/notification-api';

export function NotificationBell({ resolveHref }: { resolveHref: (n: AppNotification) => string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // 轮询未读（30s）+ 切回页面时刷新；后端 SSE 实时推送可作为后续增强
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: notificationApi.getUnread,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const markRead = useMutation({
    mutationFn: (ids: number[]) => notificationApi.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-unread'] }),
  });
  const markAll = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-unread'] }),
  });

  const onClickItem = (n: AppNotification) => {
    markRead.mutate([n.id]);
    setOpen(false);
    if (n.refType === 'plan' && n.refId) router.push(resolveHref(n));
  };

  const panel = (
    <div style={{ width: 340, maxHeight: 420, overflow: 'auto', background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <strong>通知</strong>
        {items.length > 0 ? <Button type="link" size="small" onClick={() => markAll.mutate()}>全部已读</Button> : null}
      </div>
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
      ) : items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无未读通知" style={{ padding: 24 }} />
      ) : (
        <List
          dataSource={items}
          renderItem={(n) => (
            <List.Item style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => onClickItem(n)}>
              <List.Item.Meta
                title={<span style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</span>}
                description={<span style={{ fontSize: 12, color: '#666' }}>{n.content}</span>}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} placement="bottomRight" popupRender={() => panel}>
      <button
        type="button"
        aria-label="通知"
        className="w-8 h-8 bg-surface-dim rounded-full flex items-center justify-center text-text-tertiary border-0 cursor-pointer transition-colors duration-200 hover:text-primary"
      >
        <Badge count={items.length} size="small" offset={[2, -2]}>
          <BellOutlined className="text-base" />
        </Badge>
      </button>
    </Dropdown>
  );
}
