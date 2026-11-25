import React, { useCallback, useEffect, useRef, useState } from "react";
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

import VerdictEmoji from "../VerdictEmoji";

import SharedBatchTextarea, { type BatchCaret } from "./SharedBatchTextarea";
import type { BatchField } from "../../../../hooks/useSharedRoomConsole";

interface SubmitModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
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
	batchCollaboration?: {
    showMarkers: boolean;
    edit: (field: BatchField, value: string, index: number) => void;
    moveCursor: (field: BatchField, index: number | null) => void;
    cursors: (BatchCaret & { field: BatchField })[];
  };
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
	batchCollaboration,
	onApply,
	showNextAction = false,
	onNext,
}) => {
	const applyingRef = useRef(false);
	const [applying, setApplying] = useState(false);
	const applyingData = submitResult === "no_data" && (applying || isRunning);

  const renderBatchField = (field: BatchField, label: string, value: string, onChange: (value: string) => void) =>
    batchCollaboration
      ? <SharedBatchTextarea key={field} label={label} value={value}
          onEdit={(data, index) => batchCollaboration.edit(field, data, index)}
          onCursor={index => batchCollaboration.moveCursor(field, index)}
          showMarkers={batchCollaboration.showMarkers}
          cursors={batchCollaboration.cursors.filter(cursor => cursor.field === field)} />
      : <Textarea value={value} label={label} onChange={event => onChange(event.target.value)} />;

	const handleConfirm = useCallback(async () => {
		if (isRunning || applyingRef.current) return;
		if (submitResult !== "no_data") {
			onClose();
			return;
		}

		applyingRef.current = true;
		setApplying(true);
		try {
			await onApply();
		} finally {
			applyingRef.current = false;
			setApplying(false);
			onClose();
		}
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
		<Modal
			onOpenChange={open => { if (!applyingRef.current) onOpenChange(open); }}
			isOpen={isOpen}
			isDismissable={!applyingData}
			isKeyboardDismissDisabled={applyingData}
			hideCloseButton={applyingData}
		>
			<ModalContent>
				<ModalHeader>
					{submitResult === "no_data" ? "Введите данные" : submitResult === "error" ? <>Решение не принято{isOpen && <VerdictEmoji />}</> : null}
				</ModalHeader>
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
									<strong className="block">Верно{isOpen && <VerdictEmoji correct />}</strong>
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
									{(submitMessage || "Не все проверки прошли").trim().replace(/[.\s]+$/, "")}
								</div>
							</div>
						) : (
							<div className="flex flex-col gap-2">
								<div className="text-[15px] flex items-center gap-2">
									<Switch
										size="sm"
										color="secondary"
										aria-label="Входные данные"
										isSelected={isInputData}
										onValueChange={setIsInputData}
									/>{" "}
									Входные данные
								</div>
								{isInputData && renderBatchField("input", "Входные данные", inputData, setInputData)}
								<div className="text-[15px] flex items-center gap-2">
									<Switch
										size="sm"
										color="secondary"
										aria-label="Выходные данные"
										isSelected={isOutputData}
										onValueChange={setIsOutputData}
									/>
									Выходные данные
								</div>
								{isOutputData && renderBatchField("output", "Выходные данные", outputData, setOutputData)}{" "}
							</div>
							)}
					</div>
				</ModalBody>
				{submitResult === "no_data" && (
					<ModalFooter className="flex justify-center w-full">
						<Button
							size="lg"
							disabled={applyingData}
							aria-busy={applyingData}
							onPress={handleConfirm}
							className="w-full"
							color="secondary"
						>
							<div className="flex gap-2 items-center">
								{applyingData && <Spinner size="sm" />} Запустить
							</div>
						</Button>
					</ModalFooter>
				)}
				{submitResult === "error" && (
					<ModalFooter className="flex justify-center w-full">
						<Button color="secondary" className="w-full" onPress={onClose}>
							Попробуйте ещё раз
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
