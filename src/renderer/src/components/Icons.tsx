import type { JSX, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconInbox = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Svg>
)

export const IconStar = (p: IconProps & { filled?: boolean }): JSX.Element => {
  const { filled, ...rest } = p
  return (
    <Svg {...rest} fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  )
}

export const IconSend = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m22 2-7 20-4-9-9-4 20-7z" />
    <path d="M22 2 11 13" />
  </Svg>
)

export const IconDraft = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </Svg>
)

export const IconArchive = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </Svg>
)

export const IconTrash = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </Svg>
)

export const IconSpam = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </Svg>
)

export const IconSearch = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)

export const IconReply = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m9 17-6-5 6-5" />
    <path d="M3 12h11a6 6 0 0 1 6 6v2" />
  </Svg>
)

export const IconReplyAll = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m7 17-5-5 5-5" />
    <path d="m13 17-5-5 5-5" />
    <path d="M8 12h9a4 4 0 0 1 4 4v2" />
  </Svg>
)

export const IconForward = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m15 17 6-5-6-5" />
    <path d="M21 12H10a6 6 0 0 0-6 6v2" />
  </Svg>
)

export const IconPaperclip = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 0 1 5.18 5.18l-9.2 9.2a1.83 1.83 0 0 1-2.59-2.6l8.49-8.48" />
  </Svg>
)

export const IconDownload = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </Svg>
)

export const IconExternal = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
  </Svg>
)

export const IconFile = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
)

export const IconNote = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M15 3v5h5" />
    <path d="M8.5 12.5h7M8.5 16h4.5" />
  </Svg>
)

export const IconLock = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </Svg>
)

export const IconHeart = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M20.3 5.7a5 5 0 0 0-7.1 0L12 6.9l-1.2-1.2a5 5 0 1 0-7.1 7.1l8.3 8.3 8.3-8.3a5 5 0 0 0 0-7.1z" />
  </Svg>
)

export const IconCalendar = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
)

export const IconGrid = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </Svg>
)

export const IconPin = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M9 3h6l-1 6 3.5 3.5H6.5L10 9z" />
    <path d="M12 12.5V21" />
  </Svg>
)

export const IconPanel = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M14.5 4.5v15" />
  </Svg>
)

export const IconX = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={2}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
)

export const IconMinus = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={2}>
    <path d="M5 12h14" />
  </Svg>
)

export const IconMaximize = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={1.6}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
  </Svg>
)

export const IconSettings = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
)

export const IconPlus = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconPencil = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </Svg>
)

export const IconArrowLeft = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={2}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
)

export const IconMailOpen = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M2 9.5 12 3l10 6.5V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5z" />
    <path d="m2 9.5 10 6.5 10-6.5" />
  </Svg>
)

export const IconRefresh = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Svg>
)

export const IconLogout = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
)

export const IconCommand = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z" />
  </Svg>
)

export const IconEye = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const IconKey = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.8 12.2 8.2-8.2 3 3-2 2-2-2-2 2 2 2-3 3" />
  </Svg>
)

export const IconChevronRight = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)

export const IconMove = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="m12 11 3 3-3 3" />
    <path d="M15 14H9" />
  </Svg>
)

export const IconMarkdown = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={1.7}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 15V9l2.5 3L11 9v6" />
    <path d="M15 9v6M15 15h3M18 12l-3 3" />
  </Svg>
)

export const IconCode = (p: IconProps): JSX.Element => (
  <Svg {...p} strokeWidth={2}>
    <path d="m8 6-6 6 6 6M16 6l6 6-6 6" />
  </Svg>
)

export const IconText = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h12M4 18h8" />
  </Svg>
)

export const IconContacts = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
)

export const IconAllMail = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2.5" y="7.5" width="19" height="13" rx="2" />
    <path d="m3 9 8.4 5.6a1 1 0 0 0 1.2 0L21 9" />
    <path d="M6 4.5h12" />
  </Svg>
)

export const IconEyeOff = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M10.7 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.9" />
    <path d="M6.3 6.4A17 17 0 0 0 2 12s3.6 7 10 7a9.4 9.4 0 0 0 4.3-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </Svg>
)

export const IconTag = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M20.6 13.4 12.4 21.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V4a2 2 0 0 1 2-2h9a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.8z" />
    <path d="M7 7h.01" />
  </Svg>
)

export const IconFolder = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
)

/** The MailKib envelope, matching the application icon. */
export const Mark = ({ size = 18 }: { size?: number }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
    <defs>
      <linearGradient id="mk-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7dcfff" />
        <stop offset="0.55" stopColor="#7aa2f7" />
        <stop offset="1" stopColor="#bb9af7" />
      </linearGradient>
    </defs>
    <g
      fill="none"
      stroke="url(#mk-mark)"
      strokeWidth={34}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="40" y="96" width="432" height="320" rx="52" />
      <path d="M70 140 L256 292 L442 140" />
    </g>
  </svg>
)

/** Google "G" — flat brand mark, drawn rather than fetched. */
export const LogoGoogle = ({ size = 52 }: { size?: number }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
    />
    <path
      fill="#34A853"
      d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
    />
    <path
      fill="#FBBC05"
      d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
    />
    <path
      fill="#EA4335"
      d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
    />
  </svg>
)

/** Microsoft's four-square mark. */
export const LogoMicrosoft = ({ size = 52 }: { size?: number }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="18.5" height="18.5" fill="#F25022" />
    <rect x="25.5" y="4" width="18.5" height="18.5" fill="#7FBA00" />
    <rect x="4" y="25.5" width="18.5" height="18.5" fill="#00A4EF" />
    <rect x="25.5" y="25.5" width="18.5" height="18.5" fill="#FFB900" />
  </svg>
)

export const IconCheck = (p: IconProps): JSX.Element => (
  <Svg strokeWidth={3} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
)

export const IconBell = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </Svg>
)

export const IconMail = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="4.5" width="20" height="15" rx="2.5" />
    <path d="m2.8 6.2 8.05 5.9a2 2 0 0 0 2.3 0l8.05-5.9" />
  </Svg>
)

export const IconTerminal = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="16" rx="1.5" />
    <path d="m6.5 9.5 3 2.5-3 2.5" />
    <path d="M12.5 15h5" />
  </Svg>
)
