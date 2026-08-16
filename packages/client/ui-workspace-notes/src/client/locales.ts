/** `notes` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'tab.notes': '笔记',
  'state.unavailable': '选择工作区后即可使用笔记',
  'state.loading': '正在加载笔记…',
  'state.empty': '还没有笔记',
  'state.emptyHint': '点击“新建笔记”或从对话消息保存一条笔记。',
  'state.error': '笔记加载失败',
  'state.retry': '重试',
  'state.stale': '连接已重置，列表可能过期',
  'action.create': '新建笔记',
  'action.edit': '编辑',
  'action.save': '保存',
  'action.cancel': '取消',
  'action.delete': '删除',
  'action.deleteConfirm': '确认删除这条笔记？',
  'action.visibilityOn': 'Agent 可见，点击设为私有',
  'action.visibilityOff': 'Agent 不可见，点击设为可见',
  'action.refresh': '刷新',
  'editor.placeholder': '输入笔记内容（支持 Markdown）…',
  'editor.agentVisible': 'Agent 可见',
  'editor.createTitle': '新笔记',
  'editor.editTitle': '编辑笔记',
  'source.manual': '手动',
  'source.message': '来自消息',
  'source.agent': 'Agent',
  'error.conflict': '这条笔记已在别处改动，已显示最新内容，请基于最新内容重试',
  'error.transport': '网络请求失败，请重试',
  'error.contentBlank': '笔记内容不能为空白',
  'error.contentTooLarge': '笔记内容超过大小限制',
  'error.unknownWorkspace': '该工作区已注销',
  'error.unknownNote': '这条笔记已不存在',
  'error.generic': '笔记操作失败',
  'msg.save': '保存为笔记',
  'msg.saved': '已保存为笔记',
  'msg.noWorkspace': '当前会话不属于任何工作区，无法保存笔记',
  'msg.failed': '保存笔记失败',
} satisfies Record<string, string>

/** The notes namespace key union. */
export type WorkspaceNotesUiKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The workspace notes tab and message action copy. */
    notes: WorkspaceNotesUiKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'tab.notes': 'Notes',
  'state.unavailable': 'Select a workspace to use notes',
  'state.loading': 'Loading notes…',
  'state.empty': 'No notes yet',
  'state.emptyHint': 'Use "New note", or save one from a conversation message.',
  'state.error': 'Could not load notes',
  'state.retry': 'Retry',
  'state.stale': 'Connection reset; this list may be stale',
  'action.create': 'New note',
  'action.edit': 'Edit',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.delete': 'Delete',
  'action.deleteConfirm': 'Delete this note?',
  'action.visibilityOn': 'Agent-visible; click to make private',
  'action.visibilityOff': 'Agent-invisible; click to make visible',
  'action.refresh': 'Refresh',
  'editor.placeholder': 'Write the note (Markdown supported)…',
  'editor.agentVisible': 'Agent-visible',
  'editor.createTitle': 'New note',
  'editor.editTitle': 'Edit note',
  'source.manual': 'Manual',
  'source.message': 'From message',
  'source.agent': 'Agent',
  'error.conflict': 'This note changed elsewhere; the latest content is shown — retry from it',
  'error.transport': 'Network request failed; retry',
  'error.contentBlank': 'Note content cannot be blank',
  'error.contentTooLarge': 'Note content exceeds the size limit',
  'error.unknownWorkspace': 'This workspace is no longer registered',
  'error.unknownNote': 'This note no longer exists',
  'error.generic': 'Note operation failed',
  'msg.save': 'Save as note',
  'msg.saved': 'Saved as note',
  'msg.noWorkspace': 'This session belongs to no workspace; cannot save a note',
  'msg.failed': 'Could not save the note',
} satisfies Record<WorkspaceNotesUiKey, string>
