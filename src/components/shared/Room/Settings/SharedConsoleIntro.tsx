import React from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import SettingsIcon from "./SettingsIcon";

interface Props {
  open: boolean;
  onDismiss: () => void;
}

export default function SharedConsoleIntro({ open, onDismiss }: Props) {
  if (!open) return null;
  return (
    <Modal isOpen={open} onOpenChange={next => { if (!next) onDismiss(); }}
      placement="center" size="sm"
      classNames={{
        base: "mx-4 rounded-2xl border border-ide-border bg-ide-secondary text-ide-text-primary",
        closeButton: "text-ide-text-secondary hover:text-ide-text-primary",
      }}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-3 pb-2 text-lg">
          <SettingsIcon name="console" />
          Общая консоль
        </ModalHeader>
        <ModalBody className="gap-2 text-sm leading-6 text-ide-text-secondary">
          <p>Участники комнаты видят один запуск программы, её ввод и вывод.</p>
          <p>Общая консоль включена по умолчанию. Выключить её можно в настройках комнаты.</p>
        </ModalBody>
        <ModalFooter>
          <Button autoFocus onPress={onDismiss} className="bg-[#9c78ff] font-semibold text-white">
            Понятно
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
