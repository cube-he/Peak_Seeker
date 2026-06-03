'use client';

import { Form, InputNumber } from 'antd';

/**
 * 分数输入卡片 — 学生端 / 老师端共享 (老师代学生录入时体验一致).
 * - 圆角 border + label + "满分 N" 角标 + InputNumber
 * - antd Form.Item wrapper, 业务字段名通过 name 传入
 */
export interface ScoreInputProps {
  name: string;
  label: string;
  max: number;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange?: (value: number | null) => void;
}

export function ScoreInput({
  name,
  label,
  max,
  required,
  disabled,
  placeholder,
  onChange,
}: ScoreInputProps) {
  return (
    <div
      style={{
        border: '1px solid',
        borderColor: disabled ? '#eee' : '#e5e7eb',
        background: disabled ? '#fafafa' : '#fff',
        opacity: disabled ? 0.7 : 1,
        borderRadius: 12,
        padding: '12px 14px',
        transition: 'border-color 0.15s',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 500, color: '#333' }}>{label}</span>
        <span style={{ fontSize: 11, color: '#999' }}>满分 {max}</span>
      </div>
      <Form.Item
        name={name}
        rules={required ? [{ required: true, message: '必填' }] : undefined}
        style={{ marginBottom: 0 }}
      >
        <InputNumber
          min={0}
          max={max}
          style={{ width: '100%' }}
          disabled={disabled}
          placeholder={placeholder}
          onChange={onChange}
        />
      </Form.Item>
    </div>
  );
}
