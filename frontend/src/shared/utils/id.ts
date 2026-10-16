/** 生成本地唯一 ID（仅用于前端上下文标识，如请求 ID、列表 key，非业务主键） */
export function genId(prefix = ''): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}-${uuid}` : uuid
}
