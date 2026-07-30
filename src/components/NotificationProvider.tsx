'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type NotificationSeverity = 'success' | 'error' | 'info' | 'warning'

type NotificationContextType = {
  showAlert: (message: string, severity?: NotificationSeverity, title?: string) => Promise<void>
  showConfirm: (message: string, title?: string) => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    message: string
    title: string
    resolve: ((value: boolean) => void) | null
  }>({
    isOpen: false,
    message: '',
    title: '',
    resolve: null
  })

  const showAlert = (
    message: string, 
    severity: NotificationSeverity = 'info', 
    title?: string
  ): Promise<void> => {
    return new Promise((resolve) => {
      const defaultTitle = 
        severity === 'success' ? 'Başarılı' : 
        severity === 'error' ? 'Hata' : 
        severity === 'warning' ? 'Uyarı' : 'Bilgi';
      
      const toastTitle = title || defaultTitle;
      
      if (severity === 'success') {
        toast.success(toastTitle, { description: message });
      } else if (severity === 'error') {
        toast.error(toastTitle, { description: message });
      } else if (severity === 'warning') {
        toast.warning(toastTitle, { description: message });
      } else {
        toast.info(toastTitle, { description: message });
      }
      
      resolve()
    })
  }

  const showConfirm = (
    message: string, 
    title: string = 'Onay Gerekli'
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        message,
        title,
        resolve
      })
    })
  }

  const handleClose = (value: boolean) => {
    if (confirmState.resolve) {
      confirmState.resolve(value)
    }
    setConfirmState(prev => ({ ...prev, isOpen: false, resolve: null }))
  }

  return (
    <NotificationContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      
      <AlertDialog open={confirmState.isOpen} onOpenChange={(open) => !open && handleClose(false)}>
        <AlertDialogContent className="bg-stone-900 border-stone-800 text-stone-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-500">{confirmState.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              {confirmState.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => handleClose(false)}
              className="bg-stone-800 text-stone-200 border-stone-700 hover:bg-stone-700 hover:text-stone-100"
            >
              İptal
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleClose(true)}
              className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold"
            >
              Onayla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}
