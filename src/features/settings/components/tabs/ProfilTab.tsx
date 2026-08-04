import { useState } from 'react'
import { AccountEmailSection } from '../profile/AccountEmailSection'
import { AccountPasswordSection } from '../profile/AccountPasswordSection'

export function ProfilTab() {
  const [currentEmail, setCurrentEmail] = useState('')

  return (
    <div className="space-y-6">
      <AccountEmailSection onEmailLoaded={setCurrentEmail} />
      <AccountPasswordSection currentEmail={currentEmail} />
    </div>
  )
}
