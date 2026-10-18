/**
 * 对话中的未来时间表达检测。
 *
 * 这里只做轻量门闩：命中后异步交给 AI 判断“是否真的存在需要执行的未来任务”。
 * 误命中只会多一次 AI 调用，不会直接创建任务。
 */
const FUTURE_TIME_PATTERN =
  /(今天|明天|后天|大后天|今晚|明晚|本周|这周|下周|下个?星期|下个?周|这个?星期|这个?周|下个月|本月|这个月|这月|当月|月底|月初|几月|周[一二三四五六日天]|星期[一二三四五六日天]|几[日号]|\d{1,2}\s*月|\d{1,2}\s*[日号]|\d{1,2}\s*点(?:半|\d{1,2}\s*分)?|[一二三四五六七八九十两]{1,3}\s*点|几点|\d{1,2}:\d{2}|上午|下午|晚上|早上|中午|稍后|待会|一会儿|之后|以后|tomorrow|next\s+week)/i

export function hasFutureTimeExpression(text: string): boolean {
  return FUTURE_TIME_PATTERN.test(text)
}
