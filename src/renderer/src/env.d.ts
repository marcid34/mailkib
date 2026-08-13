/// <reference types="vite/client" />
import type { MailkibApi } from '../../shared/api'

declare global {
  interface Window {
    mailkib: MailkibApi
  }
}

export {}
