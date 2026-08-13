import type {
  DraftPayload,
  ListQuery,
  ListResult,
  MailFolder,
  ThreadView
} from '../../shared/types'

/** A message row plus its conversation, so providers can act at whichever level they support. */
export interface MessageRef {
  id: string
  threadId: string
}

export interface AttachmentData {
  filename: string
  mimeType: string
  /** base64 */
  data: string
}

export interface MailProvider {
  profile(): Promise<{ email: string; displayName?: string }>
  /** User-created labels / folders, flattened with a depth for indentation. */
  folders(): Promise<MailFolder[]>
  list(query: ListQuery): Promise<ListResult>
  thread(threadId: string): Promise<ThreadView>
  setRead(refs: MessageRef[], read: boolean): Promise<void>
  setStar(refs: MessageRef[], starred: boolean): Promise<void>
  archive(refs: MessageRef[]): Promise<void>
  moveToInbox(refs: MessageRef[]): Promise<void>
  trash(refs: MessageRef[]): Promise<void>
  /** Move out of the inbox and into a label/folder. */
  moveTo(refs: MessageRef[], folderId: string): Promise<void>
  /** Add a label without moving (Gmail). Providers without labels move instead. */
  applyLabel(refs: MessageRef[], folderId: string): Promise<void>
  removeLabel(refs: MessageRef[], folderId: string): Promise<void>
  createFolder(name: string, parentPath?: string): Promise<MailFolder>
  renameFolder(folderId: string, name: string, parentPath?: string): Promise<void>
  deleteFolder(folderId: string): Promise<void>
  send(draft: DraftPayload): Promise<void>
  attachment(messageId: string, attachmentId: string): Promise<AttachmentData>
  unreadCounts(): Promise<Partial<Record<string, number>>>
}
