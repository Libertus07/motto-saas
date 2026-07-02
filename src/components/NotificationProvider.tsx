'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

export type NotificationSeverity = 'success' | 'error' | 'info' | 'warning'

type NotificationContextType = {
  showAlert: (message: string, severity?: NotificationSeverity, title?: string) => Promise<void>
  showConfirm: (message: string, title?: string) => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    message: string
    title: string
    type: 'alert' | 'confirm'
    severity: NotificationSeverity
    resolve: ((value: any) => void) | null
  }>({
    isOpen: false,
    message: '',
    title: '',
    type: 'alert',
    severity: 'info',
    resolve: null
  })

  const showAlert = (
    message: string, 
    severity: NotificationSeverity = 'info', 
    title?: string
  ): Promise<void> => {
    const defaultTitle = 
      severity === 'success' ? 'Başarılı ✨' : 
      severity === 'error' ? 'Hata ❌' : 
      severity === 'warning' ? 'Uyarı ⚠️' : 'Bilgi 💡';
      
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        message,
        title: title || defaultTitle,
        type: 'alert',
        severity,
        resolve
      })
    })
  }

  const showConfirm = (
    message: string, 
    title: string = 'Onay Gerekli ❓'
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        message,
        title,
        type: 'confirm',
        severity: 'warning',
        resolve
      })
    })
  }

  const handleClose = (value: boolean) => {
    if (modalState.resolve) {
      modalState.resolve(value)
    }
    setModalState(prev => ({ ...prev, isOpen: false, resolve: null }))
  }

  return (
    <NotificationContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all"
            onClick={() => modalState.type === 'alert' && handleClose(true)}
          />
          
          {/* Modal Card */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-md p-6 relative z-10 shadow-2xl scale-up-animation overflow-hidden text-white select-text">
            {/* Top Indicator Border */}
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${
              modalState.severity === 'success' ? 'bg-emerald-500' :
              modalState.severity === 'error' ? 'bg-red-500' :
              modalState.severity === 'warning' ? 'bg-amber-500' : 'bg-purple-500'
            }`} />

            {/* Header / Title */}
            <div className="flex items-center gap-3.5 mb-4 mt-2">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold ${
                modalState.severity === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                modalState.severity === 'error' ? 'bg-red-500/10 text-red-400' :
                modalState.severity === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-purple-500/10 text-purple-400'
              }`}>
                {modalState.severity === 'success' && '✓'}
                {modalState.severity === 'error' && '✕'}
                {modalState.severity === 'warning' && '⚠️'}
                {modalState.severity === 'info' && 'i'}
              </div>
              <h3 className="font-bold text-lg leading-tight tracking-wide">{modalState.title}</h3>
            </div>

            {/* Message Body */}
            <div className="text-stone-300 text-sm leading-relaxed mb-6 whitespace-pre-wrap">
              {modalState.message}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              {modalState.type === 'confirm' && (
                <button
                  onClick={() => handleClose(false)}
                  className="bg-stone-800/80 hover:bg-stone-800 text-stone-300 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border border-stone-700 active:scale-95"
                >
                  İptal
                </button>
              )}
              <button
                onClick={() => handleClose(true)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all text-white shadow-lg active:scale-95 ${
                  modalState.severity === 'success' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/20' :
                  modalState.severity === 'error' ? 'bg-red-600 hover:bg-red-500 shadow-red-950/20' :
                  modalState.severity === 'warning' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/20' :
                  'bg-purple-600 hover:bg-purple-500 shadow-purple-950/20'
                }`}
              >
                {modalState.type === 'confirm' ? 'Onayla' : 'Tamam'}
              </button>
            </div>
          </div>
        </div>
      )}
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
