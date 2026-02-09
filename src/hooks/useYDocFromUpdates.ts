import * as Y from 'yjs';
import React from 'react';

interface UseYDocOptions {
    updates?: unknown;
    isRemoteUpdate?: React.MutableRefObject<boolean>;
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

    if (Array.isArray(value)) {
        if (value.length === 0 || typeof value[0] !== 'number') {
            return null;
        }
        return new Uint8Array(value as number[]);
    }

    if (typeof value === 'object') {
        const maybeBuffer = value as { data?: unknown };

        if (Array.isArray(maybeBuffer.data) && maybeBuffer.data.every((item) => typeof item === 'number')) {
            return new Uint8Array(maybeBuffer.data as number[]);
        }

        const numericKeys = Object.keys(value)
            .filter((key) => /^\d+$/.test(key))
            .sort((a, b) => Number(a) - Number(b));

        if (numericKeys.length > 0) {
            return new Uint8Array(
                numericKeys.map((key) => {
                    const raw = (value as Record<string, unknown>)[key];
                    return typeof raw === 'number' ? raw : 0;
                })
            );
        }
    }

    return null;
};

const normalizeUpdates = (updates: unknown): Uint8Array[] => {
    if (!updates) {
        return [];
    }

    if (Array.isArray(updates)) {
        if (updates.length === 0) {
            return [];
        }

        if (typeof updates[0] === 'number') {
            const singleUpdate = toUint8Array(updates);
            return singleUpdate ? [singleUpdate] : [];
        }

        return updates
            .map((item) => toUint8Array(item))
            .filter((item): item is Uint8Array => item !== null);
    }

    const singleUpdate = toUint8Array(updates);
    return singleUpdate ? [singleUpdate] : [];
};

const useYDocFromUpdates = ({ updates, isRemoteUpdate }: UseYDocOptions) => {
    const [ydoc] = React.useState(() => new Y.Doc());


    React.useEffect(() => {
        const normalizedUpdates = normalizeUpdates(updates);
        if (normalizedUpdates.length === 0) return;

        try {
            if (isRemoteUpdate) {
                isRemoteUpdate.current = true;
            }

            for (const update of normalizedUpdates) {
                Y.applyUpdate(ydoc, update, 'remote');
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
