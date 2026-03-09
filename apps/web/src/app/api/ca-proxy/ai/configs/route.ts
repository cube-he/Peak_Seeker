import { NextRequest, NextResponse } from 'next/server';

// CourseAssistant 后端地址
const CA_BACKEND_URL = process.env.CA_BACKEND_URL || 'http://127.0.0.1:3000';

/**
 * 代理请求到 CourseAssistant 后端获取 AI 配置列表
 */
export async function GET(request: NextRequest) {
  try {
    // 转发 cookie 以保持会话
    const cookie = request.headers.get('cookie') || '';

    const response = await fetch(`${CA_BACKEND_URL}/api/ai/configs`, {
      headers: {
        'Cookie': cookie,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: '获取 AI 配置失败', configs: [] },
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
