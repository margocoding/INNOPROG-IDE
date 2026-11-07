import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import React, { useCallback, useEffect } from "react";

interface IProps {
  onSendForm: (username?: string) => void;
  onOpen: () => void;
  onOpenChange: (val: boolean) => void;
  isOpen: boolean;
  currentUsername?: string;
  rememberName?: boolean;
}

const StartFormModal: React.FC<IProps> = ({
  onSendForm,
  onOpenChange,
  isOpen,
  currentUsername,
  rememberName = true,
}) => {
  const [username, setUsername] = React.useState<string>("");

  useEffect(() => {
    if (isOpen) setUsername(currentUsername ?? "");
  }, [currentUsername, isOpen]);

  const onSubmit = useCallback(() => {
    const currentName = username.trim();
    if (!currentName) return;

    if (rememberName) localStorage.setItem("innoprog-username", currentName);
    onSendForm(currentName);
    onOpenChange(false);
  }, [username, rememberName, onSendForm, onOpenChange]);

  return (
    <Modal onOpenChange={onOpenChange} isOpen={isOpen}>
      <ModalContent>
        <ModalHeader>Имя участника</ModalHeader>
        <ModalBody>
          <Input
            onKeyUp={(e) => {
              if (e.key === "Enter") {
                onSubmit();
              }
            }}
            aria-label="Имя участника"
            placeholder="Введите имя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onPress={onSubmit}>
            Сохранить
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default StartFormModal;
