import type { AccountMessage as AccountMessageValue } from '../../account-security'

export function AccountMessage({ message }: { message: AccountMessageValue }) {
  if (!message.text) return null

  return (
    <p
      role={message.type === 'error' ? 'alert' : 'status'}
      className={`mt-2 text-center text-xs font-bold ${
        message.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
      }`}
    >
      {message.text}
    </p>
  )
}
