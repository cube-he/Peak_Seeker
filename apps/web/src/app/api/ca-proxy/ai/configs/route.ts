import { NextResponse } from 'next/server';

// CourseAssistant 后端地址
const CA_BACKEND_URL = process.env.CA_BACKEND_URL || 'http://127.0.0.1:3000';
const CA_INTERNAL_KEY = process.env.CA_INTERNAL_KEY || 'course-assistant-internal-key';

/**
 * 通过内部 API 获取 CourseAssistant AI 配置列表
 */
export async function GET() {
  try {
    const response = await fetch(`${CA_BACKEND_URL}/api/internal/ai-configs`, {
      headers: {
        'X-Internal-Key': CA_INTERNAL_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error || '获取 AI 配置失败', configs: [] },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('CA proxy error:', error);
    return NextResponse.json(
      { error: '无法连接到 CourseAssistant 服务', configs: [] },
      { status: 503 }
    );
  }
}
