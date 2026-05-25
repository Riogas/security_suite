/**
 * @deprecated This legacy Modal component is no longer in use.
 * All modals in this project use <ModalShell> from `@/components/ui/modal-shell`.
 * This file is kept for historical reference only and should not be imported in new code.
 *
 * Migration: replace <Modal onClose={fn}>{children}</Modal>
 * with <ModalShell open={open} onOpenChange={setOpen} title="...">{children}</ModalShell>
 */
import React from "react";

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
}

/** @deprecated Use ModalShell instead. */
export const Modal: React.FC<ModalProps> = ({ children, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 text-white rounded-lg shadow-lg p-4 relative">
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
          onClick={onClose}
        >
          &times;
        </button>
        {children}
      </div>
    </div>
  );
};
