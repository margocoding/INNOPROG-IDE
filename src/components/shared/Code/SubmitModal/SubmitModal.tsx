import React, { useCallback, useEffect } from "react";
import {
	Button,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	Spinner,
	Switch,
	Textarea,
} from "@heroui/react";

interface SubmitModalProps {
	isOpen: boolean;
	onOpenChange: () => void;
	onClose: () => void;
	submitResult: "success" | "error" | "no_data";
	isRunning: boolean;
	inputData: string;
	setInputData: (data: string) => void;
	outputData: string;
	setOutputData: (data: string) => void;
	isInputData: boolean;
	setIsInputData: (value: boolean) => void;
	isOutputData: boolean;
	setIsOutputData: (value: boolean) => void;
	onApply: () => Promise<void>;
}

const SubmitModal: React.FC<SubmitModalProps> = ({
	isOpen,
	onOpenChange,
	onClose,
	submitResult,
	isRunning,
	inputData,
	setInputData,
	outputData,
	setOutputData,
	isInputData,
	setIsInputData,
	isOutputData,
	setIsOutputData,
	onApply,
}) => {
	const handleConfirm = useCallback(async () => {
		if (isRunning) {
			return;
		}

		if (submitResult === "no_data") {
			await onApply();
		}

		onClose();
	}, [isRunning, onApply, onClose, submitResult]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			const isSubmitShortcut =
				(event.ctrlKey || event.metaKey) && event.key === "Enter";

			if (!isSubmitShortcut || event.isComposing || event.repeat) {
				return;
			}

			event.preventDefault();
			void handleConfirm();
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleConfirm, isOpen]);

	return (
		<Modal onOpenChange={onOpenChange} isOpen={isOpen}>
			<ModalContent>
				{submitResult === "no_data" && (
					<ModalHeader>Введите данные</ModalHeader>
				)}
				<ModalBody>
					<div className="text-center text-3xl">
						{submitResult === "success" ? (
							"✅Все тесты прошли успешно!"
						) : submitResult === "error" ? (
							"❌Неверное решение."
						) : (
							<div className="flex flex-col gap-2">
								<div className="text-[15px] flex items-center gap-2">
									<Switch
										size="sm"
										color="secondary"
										isSelected={isInputData}
										onValueChange={setIsInputData}
									/>{" "}
									Входные данные
								</div>
								{isInputData && (
									<Textarea
										value={inputData}
										label="Входные данные"
										onChange={(e) => setInputData(e.target.value)}
									/>
								)}
								<div className="text-[15px] flex items-center gap-2">
									<Switch
										size="sm"
										color="secondary"
										isSelected={isOutputData}
										onValueChange={setIsOutputData}
									/>
									Выходные данные
								</div>
								{isOutputData && (
									<Textarea
										value={outputData}
										label="Выходные данные"
										onChange={(e) => setOutputData(e.target.value)}
									/>
								)}{" "}
							</div>
						)}
					</div>
				</ModalBody>
				<ModalFooter className="flex justify-center w-full">
					<Button
						size="lg"
						disabled={isRunning}
						onPress={handleConfirm}
						className="w-full"
						color={submitResult === "no_data" ? "secondary" : "danger"}
					>
						{" "}
						{submitResult === "no_data" ? (
							<div className="flex gap-2 items-center">
								{isRunning && <Spinner />} Применить
							</div>
						) : (
							"Закрыть"
						)}
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};

export default SubmitModal;
