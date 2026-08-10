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
	submitMessage?: string;
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
	showNextAction?: boolean;
	onNext?: () => void;
}

const SubmitModal: React.FC<SubmitModalProps> = ({
	isOpen,
	onOpenChange,
	onClose,
	submitResult,
	submitMessage,
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
	showNextAction = false,
	onNext,
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
			const activeElement = document.activeElement as HTMLElement | null;
			const isTypingTarget = Boolean(
				activeElement &&
				(activeElement.tagName === "INPUT" ||
					activeElement.tagName === "TEXTAREA" ||
					activeElement.isContentEditable)
			);
			const isSubmitShortcut =
				(event.ctrlKey || event.metaKey) && event.key === "Enter";
			const isApplyFromNoDataState =
				submitResult === "no_data" &&
				event.key === "Enter" &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				!event.shiftKey &&
				!isTypingTarget;

			if (
				(!isSubmitShortcut && !isApplyFromNoDataState) ||
				event.isComposing ||
				event.repeat
			) {
				return;
			}

			event.preventDefault();
			void handleConfirm();
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleConfirm, isOpen, submitResult]);

	return (
		<Modal onOpenChange={onOpenChange} isOpen={isOpen}>
			<ModalContent>
				{submitResult === "no_data" ? <ModalHeader>Введите данные</ModalHeader> : <ModalHeader />}
				<ModalBody>
					<div className="text-center text-3xl">
						{submitResult === "success" ? (
							<div className="flex flex-col items-center gap-4 py-2">
								<div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 text-green-500">
									<svg
										className="h-9 w-9"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								</div>
								<div className="text-base font-medium leading-6">
									{submitMessage || "Все тесты прошли успешно!"}
								</div>
							</div>
						) : submitResult === "error" ? (
							<div className="flex flex-col items-center gap-4 py-2">
								<div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-500">
									<svg
										className="h-9 w-9"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M6 6l12 12M18 6L6 18"
										/>
									</svg>
								</div>
								<div className="text-base font-medium leading-6">
									{submitMessage || "Неверное решение."}
								</div>
							</div>
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
				{submitResult === "no_data" && (
					<ModalFooter className="flex justify-center w-full">
						<Button
							size="lg"
							disabled={isRunning}
							onPress={handleConfirm}
							className="w-full"
							color="secondary"
						>
							<div className="flex gap-2 items-center">
								{isRunning && <Spinner />} Применить
							</div>
						</Button>
					</ModalFooter>
				)}
				{submitResult === "success" && showNextAction && onNext && (
					<ModalFooter className="flex justify-center w-full">
						<Button
							size="lg"
							onPress={onNext}
							className="w-full font-semibold"
							color="secondary"
						>
							Дальше
						</Button>
					</ModalFooter>
				)}
			</ModalContent>
		</Modal>
	);
};

export default SubmitModal;
