import React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button } from "@windmill/react-ui";

/**
 * Generic yes/no dialog.
 * <ConfirmModal open title body confirmText onConfirm onClose loading danger />
 */
const ConfirmModal = ({
  open,
  title = "Are you sure?",
  body,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onClose,
  loading = false,
  danger = false,
}) => {
  return (
    <Modal isOpen={open} onClose={onClose}>
      <ModalHeader>{title}</ModalHeader>
      <ModalBody>{body}</ModalBody>
      <ModalFooter>
        <Button layout="outline" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          className={danger ? "bg-red-600 hover:bg-red-700" : ""}
        >
          {loading ? "Working..." : confirmText}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ConfirmModal;
