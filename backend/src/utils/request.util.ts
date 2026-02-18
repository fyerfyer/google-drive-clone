// 处理 Express5 的 string | string[] 参数类型
export function extractParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}
