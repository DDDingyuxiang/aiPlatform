/** 全局左侧面板：个人信息、考勤与成员相关文案 */
export default {
  profile: {
    employeeId: '工号',
    position: '职位',
    department: '部门',
    email: '邮箱',
    phone: '手机号',
  },
  attendance: {
    title: '本月考勤',
    normal: '正常',
    late: '迟到',
    absent: '缺勤',
    weekdays: {
      mon: '一',
      tue: '二',
      wed: '三',
      thu: '四',
      fri: '五',
      sat: '六',
      sun: '日',
    },
  },
  ai: {
    entryTitle: '向 AI 提问',
    entryDesc: '分析、写作与流程建议',
  },
  members: {
    myDept: '本部门',
    selectMode: '多选',
    cancel: '取消',
    selected: '已选 {count} 人',
    startGroup: '发起群聊',
    self: '我',
    selfHint: '这是你自己的成员信息，无法与自己发起会话。',
    chat: '交流',
    chatFailed: '发起会话失败，请重试',
    infoTitle: '成员信息',
    notFound: '成员不存在或已离职。',
  },
  chatList: {
    direct: '私聊',
    group: '群聊',
    empty: '暂无会话',
  },
}
