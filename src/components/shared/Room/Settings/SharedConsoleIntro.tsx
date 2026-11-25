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
        <ModalHeader className="flex items-center gap-3 pb-2 pr-12">
          <SettingsIcon name="console" />
          <div className="flex flex-col gap-1">
            <span aria-hidden="true" className="text-xs font-medium text-ide-text-secondary">
              Новое в IDE
            </span>
            <span className="text-lg">Общая консоль</span>
          </div>
        </ModalHeader>
        <ModalBody className="gap-2 text-sm leading-6 text-ide-text-secondary">
          <p>Участники комнаты видят общий запуск, ввод и вывод программы</p>
          <p>Консоль включена по умолчанию, её можно выключить в настройках комнаты</p>
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
