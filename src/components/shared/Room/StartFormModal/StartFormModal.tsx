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
}

const StartFormModal: React.FC<IProps> = ({
  onSendForm,
  onOpen,
  onOpenChange,
  isOpen,
  currentUsername,
}) => {
  const [username, setUsername] = React.useState<string>("");

  useEffect(() => {
    if (currentUsername) {
      setUsername(currentUsername);
    }
  }, [currentUsername]);

  const onSubmit = useCallback(() => {
    const currentName = username.trim();
    if (!currentName) return;

    localStorage.setItem("innoprog-username", username.trim());
    onSendForm(currentName);
    onOpenChange(false);
  }, [username, onSendForm, onOpenChange]);

  return (
    <Modal onOpenChange={onOpenChange} isOpen={isOpen}>
      <ModalContent>
        <ModalHeader>Стартовые данные</ModalHeader>
        <ModalBody>
          <Input
            onKeyUp={(e) => {
              if (e.key === "Enter") {
                onSubmit();
              }
            }}
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
