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
        if (value.length === 0) return null;
        if (typeof value[0] !== "number") return null;

        return new Uint8Array(value as number[]);
    }

    return null;
};

const useYDocFromUpdates = ({ updates, isRemoteUpdate }: UseYDocOptions) => {
    const [ydoc] = React.useState(() => new Y.Doc());


    React.useEffect(() => {
        if (!updates) return;

        try {
            if (isRemoteUpdate) {
                isRemoteUpdate.current = true;
            }

            const updateCandidates: unknown[] = Array.isArray(updates)
                ? updates.length > 0 && typeof updates[0] === "number"
                    ? [updates]
                    : updates
                : [updates];

            for (const candidate of updateCandidates) {
                const normalizedUpdate = toUint8Array(candidate);
                if (!normalizedUpdate || normalizedUpdate.length === 0) continue;

                Y.applyUpdate(ydoc, normalizedUpdate);
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
