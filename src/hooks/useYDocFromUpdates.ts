import * as Y from 'yjs';
import React from 'react';

export const REMOTE_WEBSOCKET_ORIGIN = "remote-websocket";

interface UseYDocOptions {
    updates?: unknown;
    isRemoteUpdate?: React.MutableRefObject<boolean>;
};

const isNumberArray = (value: unknown): value is number[] => {
    return Array.isArray(value) && (value.length === 0 || typeof value[0] === "number");
};

const toUint8Array = (value: unknown): Uint8Array | null => {
    if (!value) return null;

    if (value instanceof Uint8Array) {
        return value;
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }

    if (ArrayBuffer.isView(value)) {
        const view = value as ArrayBufferView;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }

    if (isNumberArray(value)) {
        if (value.length === 0) return null;
        return new Uint8Array(value);
    }

    if (typeof value === "object" && value !== null) {
        const maybeBufferLike = value as { type?: unknown; data?: unknown };
        if (
            (maybeBufferLike.type === "Buffer" || maybeBufferLike.type === undefined) &&
            isNumberArray(maybeBufferLike.data)
        ) {
            if (maybeBufferLike.data.length === 0) return null;
            return new Uint8Array(maybeBufferLike.data);
        }
    }

    return null;
};

const useYDocFromUpdates = ({ updates, isRemoteUpdate }: UseYDocOptions) => {
    const [ydoc] = React.useState(() => new Y.Doc());
    const processedQueueLengthRef = React.useRef<number>(0);


    React.useEffect(() => {
        if (updates === undefined || updates === null) {
            processedQueueLengthRef.current = 0;
            return;
        }

        try {
            if (isRemoteUpdate) {
                isRemoteUpdate.current = true;
            }

            let updateCandidates: unknown[] = [];

            if (Array.isArray(updates)) {
                const isSingleBinaryArray = isNumberArray(updates);
                if (isSingleBinaryArray) {
                    updateCandidates = updates.length > 0 ? [updates] : [];
                    processedQueueLengthRef.current = 0;
                } else {
                    if (updates.length < processedQueueLengthRef.current) {
                        processedQueueLengthRef.current = 0;
                    }

                    updateCandidates = updates.slice(processedQueueLengthRef.current);
                    processedQueueLengthRef.current = updates.length;
                }
            } else {
                updateCandidates = [updates];
                processedQueueLengthRef.current = 0;
            }

            for (const candidate of updateCandidates) {
                const normalizedUpdate = toUint8Array(candidate);
                if (!normalizedUpdate || normalizedUpdate.length === 0) continue;

                Y.applyUpdate(ydoc, normalizedUpdate, REMOTE_WEBSOCKET_ORIGIN);
            }
        } catch (e) {
            console.error('Failed to apply updates:', e);
        } finally {
            if (isRemoteUpdate) {
                isRemoteUpdate.current = false;
            }
        }
    }, [updates, ydoc, isRemoteUpdate]);

    React.useEffect(() => {
        return () => {
            ydoc.destroy();
        };
    }, [ydoc]);

    return ydoc;
};

export default useYDocFromUpdates;
