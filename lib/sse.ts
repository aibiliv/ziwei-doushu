/**
 * SSE 协议转换：把上游 OpenAI 兼容 SSE 转成前端 InsightPanel 协议
 *   上游 data: {"choices":[{"delta":{"content":"..."}}]}
 *   输出 data: {"delta":{"text":"..."}}\n\n
 */

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

export interface TransformCallbacks {
  onDelta?: (text: string) => void;
  onDone?: (fullText: string) => void;
}

export function buildTransformStream(
  upstreamBody: ReadableStream<Uint8Array>,
  callbacks?: TransformCallbacks,
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let fullText = '';

  return new ReadableStream({
    async start(controller) {
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const content: string | undefined = json.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                callbacks?.onDelta?.(content);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: content } })}

`));
              }
            } catch { /* 忽略无法解析的行 */ }
          }
        }
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        callbacks?.onDone?.(fullText);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}
