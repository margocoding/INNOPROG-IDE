import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { io, Socket } from "socket.io-client";
import * as Y from "yjs";
import {
    clearPendingCodeUpdate,
    loadPendingCodeUpdate,
    savePendingCodeUpdate,
} from "../services/reliableCodeQueue";
import { RoomPermissions } from "../types/room";
import { Language } from "../types/task";
import { isRoomTokenExpired } from "../utils/roomToken";
import {
    clearRoomLaunchCode,
    clearRoomSessionToken,
    saveRoomSession,
} from "../utils/roomSession";

const REFERENCE_BLUE = "#518bff";
const MIN_CONTRAST_WITH_REFERENCE = 1.9;
const MIN_COLOR_DISTANCE = 95;
const REMOTE_SYNC_ORIGIN = "remote-websocket";
const FINAL_CONNECTION_ERROR_DELAY_MS = 120_000;
const FAST_CODE_EDIT_DELAY_MS = 75;
const HIDDEN_TAB_SNAPSHOT_TIMEOUT_MS = 1_500;

export type CodeSyncState =
    | "connecting"
    | "joined"
    | "synchronizing"
    | "synchronized"
    | "reconnecting"
    | "waiting-permission";

const hexToRgb = (hex: string): [number, number, number] => {
    const cleanHex = hex.replace("#", "");
    const fullHex =
        cleanHex.length === 3
            ? cleanHex
                  .split("")
                  .map((char) => char + char)
                  .join("")
            : cleanHex;

    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);

    return [r, g, b];
};

const toLinear = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string): number => {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const contrastRatio = (firstHex: string, secondHex: string): number => {
    const firstLum = luminance(firstHex);
    const secondLum = luminance(secondHex);
    const lighter = Math.max(firstLum, secondLum);
    const darker = Math.min(firstLum, secondLum);
    return (lighter + 0.05) / (darker + 0.05);
};

const colorDistance = (firstHex: string, secondHex: string): number => {
    const [r1, g1, b1] = hexToRgb(firstHex);
    const [r2, g2, b2] = hexToRgb(secondHex);
    return Math.sqrt(
        Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
    );
};

const randomInt = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const isRoomGeneratedTelegramId = (telegramId?: string | null): boolean =>
    Boolean(telegramId && /^i\d+$/.test(telegramId));

const supportedRoomLanguages = new Set<Language>([
    Language.JS,
    Language.PY,
    Language.BASH,
    Language.CPP,
    Language.SQL,
    Language.DART,
    Language.JAVA,
    Language.HTML,
]);

const isSupportedRoomLanguage = (language: unknown): language is Language =>
    typeof language === "string" && supportedRoomLanguages.has(language as Language);

const getOrCreateClientInstanceId = (): string => {
    const key = "innoprog-ide-client-instance";
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const generated =
        typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const normalized = generated.replace(/[^A-Za-z0-9_-]/g, "");
    sessionStorage.setItem(key, normalized);
    return normalized;
};

const createSyncSessionId = (): string => {
    const generated =
        typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return generated.replace(/[^A-Za-z0-9_-]/g, "");
};

const hasYjsUpdateContent = (update: Uint8Array): boolean => {
    const decoded = Y.decodeUpdate(update);
    return decoded.structs.length > 0 || decoded.ds.clients.size > 0;
};

const hslToHex = (h: number, s: number, l: number): string => {
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const huePrime = h / 60;
    const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;

    if (huePrime >= 0 && huePrime < 1) {
        r = chroma;
        g = x;
    } else if (huePrime < 2) {
        r = x;
        g = chroma;
    } else if (huePrime < 3) {
        g = chroma;
        b = x;
    } else if (huePrime < 4) {
        g = x;
        b = chroma;
    } else if (huePrime < 5) {
        r = x;
        b = chroma;
    } else {
        r = chroma;
        b = x;
    }

    const m = lightness - chroma / 2;
    const toHex = (value: number) =>
        Math.round((value + m) * 255)
            .toString(16)
            .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

interface UseWebSocketProps {
    socketUrl: string;
    myTelegramId?: string | null;
    roomId: string | null;
    roomToken?: string | null;
    roomLaunchCode?: string | null;
    suggestedUsername?: string | null;
}

export interface RoomMember {
    telegramId: string;
    online: boolean;
    isYourself: boolean;
    userColor?: string;
    username?: string;
}

export interface CursorData {
    telegramId: string;
    isYourself: boolean;
    position: [number, number];
    userColor: string;
    username?: string;
}

export const useWebSocket = ({
    socketUrl,
    myTelegramId,
    roomId,
    roomToken,
    roomLaunchCode,
    suggestedUsername,
}: UseWebSocketProps) => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isJoinedRoom, setIsJoinedRoom] = useState<boolean>(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
    const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map());
    const [selections, setSelections] = useState<
        Map<
            string,
            {
                line?: number;
                column?: number;
                selectionStart?: { line: number; column: number };
                selectionEnd?: { line: number; column: number };
                selectedText?: string;
                userColor: string;
            }
        >
    >(new Map());
    const [codeEdits, setCodeEdits] = useState<unknown[]>([]);
    const [myUserColor, setMyUserColor] = useState<string>("#FF6B6B");
    const [roomPermissions, setRoomPermissions] = useState<RoomPermissions>({
        studentCursorEnabled: true,
        studentSelectionEnabled: true,
        studentEditCodeEnabled: true,
    });
    const [isTeacher, setIsTeacher] = useState<boolean | undefined>(undefined);
    const [completed, setCompleted] = useState<boolean>(false);
    const [language, setLanguage] = useState<Language | undefined>(undefined);
    const [joinedCode, setJoinedCode] = useState<string | undefined>(undefined);
    const [codeSyncState, setCodeSyncState] =
        useState<CodeSyncState>("connecting");
    const [hasPendingCodeChanges, setHasPendingCodeChanges] =
        useState<boolean>(false);
    const [showSyncSuccess, setShowSyncSuccess] = useState<boolean>(false);
    const [hasDurableStorageError, setHasDurableStorageError] =
        useState<boolean>(false);
    const [isPersistRetrying, setIsPersistRetrying] = useState<boolean>(false);
    const [isSessionReplaced, setIsSessionReplaced] = useState<boolean>(false);
    const [isCodeQueueRestored, setIsCodeQueueRestored] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const socketUrlRef = useRef<string>(socketUrl);
    const myTelegramIdRef = useRef<string>(myTelegramId || "");
    const assignedColorsRef = useRef<Map<string, string>>(new Map());
    const hasServerTelegramIdRef = useRef<boolean>(false);
    const hasAuthoritativeRoomTelegramIdRef = useRef<boolean>(false);
    const selfIdsRef = useRef<Set<string>>(new Set());
    const joinWithoutSavedIdTriedRef = useRef<boolean>(false);
    const roomTokenRefreshTriedRef = useRef<boolean>(false);
    const roomIdRef = useRef(roomId);
    const roomTokenRef = useRef<string>(roomToken || "");
    const roomLaunchCodeRef = useRef<string>(roomLaunchCode || "");
    const suggestedUsernameRef = useRef<string>(suggestedUsername?.trim() || "");
    const roomTokenRequestRef = useRef<Promise<boolean> | null>(null);
    const clientInstanceIdRef = useRef<string>(getOrCreateClientInstanceId());
    // A fresh epoch prevents a successful sequence from a previous page load
    // being mistaken for a retry. The stable ID above remains the durable queue key.
    const syncSessionIdRef = useRef<string>(createSyncSessionId());
    const isConnectedRef = useRef<boolean>(false);
    const shouldReconnectRef = useRef<boolean>(true);
    const isHiddenPausedRef = useRef<boolean>(false);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const connectionAttempts = useRef<number>(0);
    const isRemoteUpdate = useRef<boolean>(false);
    const ydocRef = useRef<Y.Doc | null>(null);
    const syncGenerationRef = useRef(0);
    const pendingUpdateRef = useRef<Uint8Array | null>(null);
    const inFlightUpdateRef = useRef<
        {
            sequence: number;
            update: Uint8Array;
            roomId: string;
            syncSessionId: string;
            generation: number;
        } | null
    >(null);
    const nextSequenceRef = useRef(1);
    const queueLoadedForRef = useRef<string>("");
    const syncRetryTimeoutRef = useRef<number | null>(null);
    const updateRetryTimeoutRef = useRef<number | null>(null);
    const durabilityRetryTimeoutRef = useRef<number | null>(null);
    const fastCodeEditTimeoutRef = useRef<number | null>(null);
    const pendingFastCodeEditRef = useRef<Uint8Array | null>(null);
    const fastCodeEditContextRef = useRef<{
        roomId: string;
        generation: number;
    } | null>(null);
    const syncSuccessTimeoutRef = useRef<number | null>(null);
    const connectionFailureTimeoutRef = useRef<number | null>(null);
    const hiddenSuspendTimeoutRef = useRef<number | null>(null);
    const canUploadCodeRef = useRef(false);
    const isTeacherRef = useRef(false);
    const completedRef = useRef(false);
    const sessionReplacedRef = useRef(false);
    const isMountedRef = useRef(true);
    const hasDurableStorageErrorRef = useRef(false);

    useEffect(() => () => {
        isMountedRef.current = false;
    }, []);

    const updateDurableStorageError = useCallback((value: boolean) => {
        if (hasDurableStorageErrorRef.current === value) return;
        hasDurableStorageErrorRef.current = value;
        if (isMountedRef.current) setHasDurableStorageError(value);
    }, []);

    const getRoomApiBase = useCallback((url: string): string => {
        const fallbackBase = "/api/room";
        try {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                return `${new URL(url).origin}/api/room`;
            }
            if (url.startsWith("ws://") || url.startsWith("wss://")) {
                const parsed = new URL(url);
                parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
                return `${parsed.origin}/api/room`;
            }
            return fallbackBase;
        } catch {
            return fallbackBase;
        }
    }, []);

    const ensureRoomToken = useCallback(async (forceRefresh = false): Promise<boolean> => {
        if (roomTokenRef.current && !forceRefresh) {
            return true;
        }

        if (roomTokenRequestRef.current && !forceRefresh) {
            return roomTokenRequestRef.current;
        }

        const currentRoomId = roomIdRef.current;
        if (!currentRoomId) {
            return false;
        }

        const savedGeneratedTelegramId =
            isRoomGeneratedTelegramId(myTelegramIdRef.current)
                ? myTelegramIdRef.current
                : localStorage.getItem(`innoprog-room-client-id:${currentRoomId}`);
        const requestedTelegramId = isRoomGeneratedTelegramId(savedGeneratedTelegramId)
            ? savedGeneratedTelegramId
            : undefined;

        const request = (async () => {
            const launchCode = roomLaunchCodeRef.current;
            const requestRoomToken = () => fetch(
                `${getRoomApiBase(socketUrlRef.current)}/${encodeURIComponent(currentRoomId)}/${launchCode ? "launch" : "token"}`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(launchCode
                        ? {
                            launchCode,
                            browserNonce: clientInstanceIdRef.current,
                        }
                        : requestedTelegramId ? { telegramId: requestedTelegramId } : {}),
                }
            );
            let response;
            try {
                response = await requestRoomToken();
            } catch (error) {
                if (!launchCode) {
                    throw error;
                }
                // The server may already have consumed the one-time code and
                // installed the protected room cookie before the response was
                // interrupted. A single retry lets the backend recover that
                // same teacher identity without issuing another credential.
                response = await requestRoomToken();
            }
            if (!response.ok) {
                throw new Error("Не удалось подготовить безопасный вход в комнату");
            }

            const payload = await response.json();
            if (!payload?.roomToken || !payload?.telegramId) {
                throw new Error("Сервер вернул некорректный токен комнаты");
            }

            if (roomIdRef.current !== currentRoomId) {
                return false;
            }

            roomTokenRef.current = String(payload.roomToken);
            roomLaunchCodeRef.current = "";
            clearRoomLaunchCode(currentRoomId);
            const generatedTelegramId = String(payload.telegramId);
            myTelegramIdRef.current = generatedTelegramId;
            hasAuthoritativeRoomTelegramIdRef.current = false;
            selfIdsRef.current.add(generatedTelegramId);
            localStorage.setItem(
                `innoprog-room-client-id:${currentRoomId}`,
                generatedTelegramId
            );
            saveRoomSession(currentRoomId, generatedTelegramId, roomTokenRef.current);
            setMyUserColor(REFERENCE_BLUE);
            return true;
        })();

        roomTokenRequestRef.current = request;

        try {
            return await request;
        } finally {
            if (roomTokenRequestRef.current === request) {
                roomTokenRequestRef.current = null;
            }
        }
    }, [getRoomApiBase]);

    const clearIntervals = useCallback(() => {
        if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
        }
        if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
        }
    }, []);

    const joinRoom = useCallback((telegramIdOverride?: string | null) => {
        if (!roomIdRef.current) {
            return;
        }

        if (socketRef.current?.connected) {
            const emitJoin = () => {
                const savedUsername = localStorage.getItem("innoprog-username")?.trim();
                const resolvedUsername = savedUsername || suggestedUsernameRef.current;
                const resolvedTelegramId =
                    telegramIdOverride === undefined
                        ? myTelegramIdRef.current
                        : telegramIdOverride;

                socketRef.current?.emit("join-room", {
                    telegramId: resolvedTelegramId || undefined,
                    roomId: roomIdRef.current,
                    roomToken: roomTokenRef.current || undefined,
                    username: resolvedUsername || undefined,
                    clientInstanceId: syncSessionIdRef.current,
                });
            };

            if (roomTokenRef.current && isRoomTokenExpired(roomTokenRef.current)) {
                roomTokenRefreshTriedRef.current = true;
                roomTokenRef.current = "";
                if (roomIdRef.current) clearRoomSessionToken(roomIdRef.current);
                hasAuthoritativeRoomTelegramIdRef.current = false;
                ensureRoomToken(true)
                    .then(emitJoin)
                    .catch((error) => {
                        setConnectionError(error?.message || "Не удалось открыть комнату");
                    });
                return;
            }

            if (roomTokenRef.current) {
                emitJoin();
                return;
            }

            const telegramId =
                telegramIdOverride === undefined
                    ? myTelegramIdRef.current
                    : telegramIdOverride;

            if (telegramId && !isRoomGeneratedTelegramId(telegramId)) {
                emitJoin();
                return;
            }

            ensureRoomToken()
                .then(emitJoin)
                .catch((error) => {
                    setConnectionError(error?.message || "Не удалось открыть комнату");
                });
        }
    }, [ensureRoomToken]);

    const getCurrentTelegramId = useCallback(
        () => myTelegramIdRef.current || myTelegramId || "",
        [myTelegramId]
    );

    const completeSession = useCallback(() => {
        if (completed) return;
        if (socketRef.current) {
            socketRef.current?.emit("close-session", {
                telegramId: myTelegramIdRef.current,
                roomId: roomIdRef.current,
            });
        }
    }, [completed]);

    const isSelfId = useCallback(
        (id?: string) => Boolean(id && selfIdsRef.current.has(id)),
        []
    );

    const getOrAssignUserColor = useCallback((telegramId?: string): string => {
        if (!telegramId) {
            return "#FF6B6B";
        }

        if (selfIdsRef.current.has(telegramId)) {
            assignedColorsRef.current.set(telegramId, REFERENCE_BLUE);
            return REFERENCE_BLUE;
        }

        const existing = assignedColorsRef.current.get(telegramId);
        if (existing) {
            return existing;
        }

        const usedColors = Array.from(assignedColorsRef.current.values());
        let selectedColor = "#FF6B6B";

        for (let attempt = 0; attempt < 220; attempt++) {
            const candidateColor = hslToHex(
                randomInt(0, 359),
                randomInt(62, 90),
                randomInt(42, 64)
            );

            if (
                contrastRatio(candidateColor, REFERENCE_BLUE) <
                MIN_CONTRAST_WITH_REFERENCE
            ) {
                continue;
            }

            const isTooCloseToExisting = usedColors.some(
                (usedColor) =>
                    colorDistance(candidateColor, usedColor) < MIN_COLOR_DISTANCE
            );

            if (!isTooCloseToExisting) {
                selectedColor = candidateColor;
                break;
            }
        }

        if (
            contrastRatio(selectedColor, REFERENCE_BLUE) <
            MIN_CONTRAST_WITH_REFERENCE
        ) {
            const fallbackColors = [
                "#ff6b6b",
                "#22c55e",
                "#f59e0b",
                "#e11d48",
                "#06b6d4",
                "#a855f7",
                "#84cc16",
                "#ef4444",
                "#14b8a6",
                "#f97316",
            ];

            const availableFallback = fallbackColors.find(
                (fallback) =>
                    contrastRatio(fallback, REFERENCE_BLUE) >=
                        MIN_CONTRAST_WITH_REFERENCE &&
                    !usedColors.some(
                        (usedColor) =>
                            colorDistance(fallback, usedColor) <
                            MIN_COLOR_DISTANCE * 0.7
                    )
            );

            if (availableFallback) {
                selectedColor = availableFallback;
            }
        }

        assignedColorsRef.current.set(telegramId, selectedColor);
        return selectedColor;
    }, []);

    const enqueueCodeEdit = useCallback((update: unknown) => {
        const appendUpdate = (payload: unknown) => {
            setCodeEdits((prev) => [...prev, payload]);
        };

        if (typeof Blob !== "undefined" && update instanceof Blob) {
            update
                .arrayBuffer()
                .then((buffer) => {
                    appendUpdate(new Uint8Array(buffer));
                })
                .catch((error) => {
                    console.error("Failed to decode blob code update:", error);
                });
            return;
        }

        appendUpdate(update);
    }, []);

    const queuePersistenceChainRef = useRef<Promise<boolean>>(Promise.resolve(true));

    const persistReliableQueue = useCallback(() => {
        const currentRoomId = roomIdRef.current;
        if (!currentRoomId) return Promise.resolve(true);

        const updates = [
            inFlightUpdateRef.current?.update,
            pendingUpdateRef.current,
        ].filter((value): value is Uint8Array => Boolean(value?.byteLength));
        const combined = updates.length > 0 ? Y.mergeUpdates(updates) : null;
        setHasPendingCodeChanges(Boolean(combined));

        queuePersistenceChainRef.current = queuePersistenceChainRef.current
            .catch(() => false)
            .then(async () => {
                if (combined) {
                    const persisted = await savePendingCodeUpdate(
                        currentRoomId,
                        clientInstanceIdRef.current,
                        combined,
                        nextSequenceRef.current,
                    );
                    updateDurableStorageError(!persisted);
                    return persisted;
                } else {
                    const cleared = await clearPendingCodeUpdate(
                        currentRoomId,
                        clientInstanceIdRef.current,
                    );
                    updateDurableStorageError(!cleared);
                    return cleared;
                }
            });
        return queuePersistenceChainRef.current;
    }, [updateDurableStorageError]);

    const emitWithAck = useCallback(
        <T,>(socket: Socket, event: string, payload: unknown): Promise<T> =>
            new Promise<T>((resolve, reject) => {
                socket.timeout(12_000).emit(
                    event,
                    payload,
                    (error: Error | null, response: T) => {
                        if (error) reject(error);
                        else resolve(response);
                    },
                );
            }),
        [],
    );

    const clearFastCodeEdit = useCallback(() => {
        if (fastCodeEditTimeoutRef.current !== null) {
            window.clearTimeout(fastCodeEditTimeoutRef.current);
            fastCodeEditTimeoutRef.current = null;
        }
        pendingFastCodeEditRef.current = null;
        fastCodeEditContextRef.current = null;
    }, []);

    const scheduleFastCodeEdit = useCallback(
        (
            update: Uint8Array,
            roomAtEdit: string,
            generationAtEdit: number,
        ) => {
            if (
                !socketRef.current?.connected ||
                roomIdRef.current !== roomAtEdit ||
                syncGenerationRef.current !== generationAtEdit ||
                !canUploadCodeRef.current ||
                completedRef.current ||
                sessionReplacedRef.current
            ) {
                return;
            }

            const activeContext = fastCodeEditContextRef.current;
            if (
                activeContext &&
                (activeContext.roomId !== roomAtEdit ||
                    activeContext.generation !== generationAtEdit)
            ) {
                clearFastCodeEdit();
            }

            pendingFastCodeEditRef.current = pendingFastCodeEditRef.current
                ? Y.mergeUpdates([pendingFastCodeEditRef.current, update])
                : update;
            if (fastCodeEditTimeoutRef.current !== null) return;
            fastCodeEditContextRef.current = {
                roomId: roomAtEdit,
                generation: generationAtEdit,
            };

            fastCodeEditTimeoutRef.current = window.setTimeout(() => {
                fastCodeEditTimeoutRef.current = null;
                const pendingUpdate = pendingFastCodeEditRef.current;
                pendingFastCodeEditRef.current = null;
                fastCodeEditContextRef.current = null;
                const socket = socketRef.current;
                const telegramId = getCurrentTelegramId();
                if (
                    !pendingUpdate ||
                    !socket?.connected ||
                    !telegramId ||
                    roomIdRef.current !== roomAtEdit ||
                    syncGenerationRef.current !== generationAtEdit ||
                    !canUploadCodeRef.current ||
                    completedRef.current ||
                    sessionReplacedRef.current
                ) {
                    return;
                }

                socket.emit("code-edit", {
                    roomId: roomAtEdit,
                    telegramId,
                    update: pendingUpdate,
                });
            }, FAST_CODE_EDIT_DELAY_MS);
        },
        [clearFastCodeEdit, getCurrentTelegramId],
    );

    const flushReliableQueueRef = useRef<() => void>(() => undefined);

    const synchronizeCode = useCallback(
        async (socket: Socket) => {
            const doc = ydocRef.current;
            const currentRoomId = roomIdRef.current;
            if (!doc || !currentRoomId || !socket.connected) return;

            const generation = ++syncGenerationRef.current;
            const syncSessionId = syncSessionIdRef.current;
            const queueClientInstanceId = clientInstanceIdRef.current;
            const canUploadCode = canUploadCodeRef.current;
            const isCurrentSynchronization = () =>
                generation === syncGenerationRef.current &&
                socketRef.current === socket &&
                roomIdRef.current === currentRoomId &&
                syncSessionIdRef.current === syncSessionId &&
                ydocRef.current === doc &&
                socket.connected;
            setCodeSyncState("synchronizing");

            try {
                const queueKey = `${currentRoomId}:${queueClientInstanceId}`;
                if (queueLoadedForRef.current !== queueKey) {
                    const stored = await loadPendingCodeUpdate(
                        currentRoomId,
                        queueClientInstanceId,
                    );
                    if (!isCurrentSynchronization()) return;
                    if (stored?.update.byteLength) {
                        Y.applyUpdate(doc, stored.update, REMOTE_SYNC_ORIGIN);
                        pendingUpdateRef.current = pendingUpdateRef.current
                            ? Y.mergeUpdates([pendingUpdateRef.current, stored.update])
                            : stored.update;
                        nextSequenceRef.current = Math.max(
                            nextSequenceRef.current,
                            stored.nextSequence,
                        );
                        setHasPendingCodeChanges(true);
                    }
                    queueLoadedForRef.current = queueKey;
                    setIsCodeQueueRestored(true);
                }

                const initResponse = await emitWithAck<{
                    ok: boolean;
                    error?: string;
                    serverUpdate: Uint8Array;
                    serverStateVector: Uint8Array;
                }>(socket, "code-sync:init", {
                    roomId: currentRoomId,
                    telegramId: getCurrentTelegramId(),
                    clientInstanceId: syncSessionId,
                    stateVector: Y.encodeStateVector(doc),
                });
                if (!initResponse?.ok) {
                    throw new Error(initResponse?.error || "Code sync init failed");
                }
                if (!isCurrentSynchronization()) return;

                Y.applyUpdate(
                    doc,
                    new Uint8Array(initResponse.serverUpdate),
                    REMOTE_SYNC_ORIGIN,
                );

                const serverStateVector = new Uint8Array(
                    initResponse.serverStateVector,
                );
                const clientDiff = Y.encodeStateAsUpdate(
                    doc,
                    serverStateVector,
                );

                const hasClientDiff = hasYjsUpdateContent(clientDiff);
                const pendingIncludedInDiff = pendingUpdateRef.current;
                const inFlightIncludedInDiff = inFlightUpdateRef.current;
                if (hasClientDiff && !canUploadCode) {
                    await persistReliableQueue();
                    if (!isCurrentSynchronization()) return;
                    setCodeSyncState("waiting-permission");
                    return;
                }
                if (hasClientDiff && canUploadCode) {
                    if (
                        (pendingUpdateRef.current || inFlightUpdateRef.current) &&
                        !(await persistReliableQueue())
                    ) {
                        throw new Error("Durable code queue is unavailable");
                    }
                    if (!isCurrentSynchronization()) return;
                    const sequence = nextSequenceRef.current++;
                    const syncResponse = await emitWithAck<{
                        ok: boolean;
                        persisted?: boolean;
                        sequence: number;
                        error?: string;
                    }>(socket, "code-sync:update", {
                        roomId: currentRoomId,
                        telegramId: getCurrentTelegramId(),
                        clientInstanceId: syncSessionId,
                        sequence,
                        update: clientDiff,
                    });
                    if (!syncResponse?.ok || !syncResponse.persisted) {
                        throw new Error(syncResponse?.error || "Code sync update failed");
                    }
                    if (!isCurrentSynchronization()) return;
                }

                if (!isCurrentSynchronization()) return;

                if (pendingUpdateRef.current === pendingIncludedInDiff) {
                    pendingUpdateRef.current = null;
                }
                if (inFlightUpdateRef.current === inFlightIncludedInDiff) {
                    inFlightUpdateRef.current = null;
                }

                await persistReliableQueue();
                if (!isCurrentSynchronization()) return;
                setCodeSyncState("synchronized");
                setShowSyncSuccess(true);
                if (syncSuccessTimeoutRef.current !== null) {
                    window.clearTimeout(syncSuccessTimeoutRef.current);
                }
                syncSuccessTimeoutRef.current = window.setTimeout(() => {
                    syncSuccessTimeoutRef.current = null;
                    setShowSyncSuccess(false);
                }, 2_400);
                setConnectionError(null);
                flushReliableQueueRef.current();
            } catch (error) {
                if (generation !== syncGenerationRef.current) return;
                setCodeSyncState(socket.connected ? "reconnecting" : "connecting");
                if (syncRetryTimeoutRef.current !== null) {
                    window.clearTimeout(syncRetryTimeoutRef.current);
                }
                syncRetryTimeoutRef.current = window.setTimeout(() => {
                    syncRetryTimeoutRef.current = null;
                    if (socketRef.current === socket && socket.connected) {
                        void synchronizeCode(socket);
                    }
                }, 1_500);
            }
        },
        [emitWithAck, getCurrentTelegramId, persistReliableQueue],
    );

    const sendInFlightUpdate = useCallback(async () => {
        const socket = socketRef.current;
        const packet = inFlightUpdateRef.current;
        if (
            !socket?.connected ||
            !packet ||
            roomIdRef.current !== packet.roomId ||
            syncSessionIdRef.current !== packet.syncSessionId ||
            syncGenerationRef.current !== packet.generation ||
            codeSyncState !== "synchronized" ||
            !canUploadCodeRef.current
        ) {
            if (packet && !canUploadCodeRef.current) {
                setCodeSyncState("waiting-permission");
            }
            return;
        }

        try {
            const response = await emitWithAck<{
                ok: boolean;
                persisted?: boolean;
                sequence: number;
            }>(socket, "code-sync:update", {
                roomId: packet.roomId,
                telegramId: getCurrentTelegramId(),
                clientInstanceId: packet.syncSessionId,
                sequence: packet.sequence,
                update: packet.update,
            });
            if (
                !response?.ok ||
                !response.persisted ||
                response.sequence !== packet.sequence
            ) {
                throw new Error("Code update was not persisted");
            }
            if (
                inFlightUpdateRef.current !== packet ||
                socketRef.current !== socket ||
                roomIdRef.current !== packet.roomId ||
                syncSessionIdRef.current !== packet.syncSessionId ||
                syncGenerationRef.current !== packet.generation
            ) {
                return;
            }
            if (updateRetryTimeoutRef.current !== null) {
                window.clearTimeout(updateRetryTimeoutRef.current);
                updateRetryTimeoutRef.current = null;
            }
            setIsPersistRetrying(false);
            inFlightUpdateRef.current = null;
            await persistReliableQueue();
            flushReliableQueueRef.current();
        } catch {
            setIsPersistRetrying(true);
            if (!canUploadCodeRef.current) {
                if (updateRetryTimeoutRef.current !== null) {
                    window.clearTimeout(updateRetryTimeoutRef.current);
                    updateRetryTimeoutRef.current = null;
                }
                setCodeSyncState("waiting-permission");
                return;
            }
            if (
                inFlightUpdateRef.current === packet &&
                socketRef.current === socket &&
                roomIdRef.current === packet.roomId &&
                syncSessionIdRef.current === packet.syncSessionId &&
                syncGenerationRef.current === packet.generation &&
                socketRef.current?.connected &&
                updateRetryTimeoutRef.current === null
            ) {
                updateRetryTimeoutRef.current = window.setTimeout(() => {
                    updateRetryTimeoutRef.current = null;
                    void sendInFlightUpdate();
                }, 1_500);
            }
        }
    }, [codeSyncState, emitWithAck, getCurrentTelegramId, persistReliableQueue]);

    const persistAndSendInFlightUpdate = useCallback(async () => {
        const packet = inFlightUpdateRef.current;
        if (!packet) return;

        const persisted = await persistReliableQueue();
        if (inFlightUpdateRef.current !== packet) return;

        if (persisted) {
            if (durabilityRetryTimeoutRef.current !== null) {
                window.clearTimeout(durabilityRetryTimeoutRef.current);
                durabilityRetryTimeoutRef.current = null;
            }
            if (canUploadCodeRef.current) void sendInFlightUpdate();
            else setCodeSyncState("waiting-permission");
            return;
        }

        if (durabilityRetryTimeoutRef.current === null) {
            durabilityRetryTimeoutRef.current = window.setTimeout(() => {
                durabilityRetryTimeoutRef.current = null;
                void persistAndSendInFlightUpdate();
            }, 1_500);
        }
    }, [persistReliableQueue, sendInFlightUpdate]);

    const flushReliableQueue = useCallback(() => {
        const currentRoomId = roomIdRef.current;
        if (
            codeSyncState !== "synchronized" ||
            !socketRef.current?.connected ||
            !currentRoomId ||
            inFlightUpdateRef.current ||
            !pendingUpdateRef.current ||
            !canUploadCodeRef.current
        ) {
            return;
        }

        inFlightUpdateRef.current = {
            sequence: nextSequenceRef.current++,
            update: pendingUpdateRef.current,
            roomId: currentRoomId,
            syncSessionId: syncSessionIdRef.current,
            generation: syncGenerationRef.current,
        };
        pendingUpdateRef.current = null;
        void persistAndSendInFlightUpdate();
    }, [codeSyncState, persistAndSendInFlightUpdate]);

    flushReliableQueueRef.current = flushReliableQueue;

    const bindYDoc = useCallback(
        (doc: Y.Doc | null) => {
            ydocRef.current = doc;
            const socket = socketRef.current;
            if (doc && socket?.connected && isConnectedRef.current) {
                void synchronizeCode(socket);
            }
        },
        [synchronizeCode],
    );

    useEffect(() => {
        if (codeSyncState === "synchronized") {
            flushReliableQueueRef.current();
        }
    }, [codeSyncState]);

    const suspendHiddenSocket = useCallback((socket: Socket) => {
        isHiddenPausedRef.current = true;
        if (connectionFailureTimeoutRef.current !== null) {
            window.clearTimeout(connectionFailureTimeoutRef.current);
            connectionFailureTimeoutRef.current = null;
        }
        setConnectionError(null);
        clearFastCodeEdit();

        const persistThenSuspend = async () => {
            let persisted = false;
            try {
                persisted = await persistReliableQueue();
            } catch (error) {
                console.error("Failed to persist code before hidden-tab suspension:", error);
            }
            // Losing the last local edit is worse than keeping a hidden socket
            // alive. A later visibility change or unmount will retry storage.
            if (!persisted || !document.hidden || socketRef.current !== socket) {
                return;
            }

            let finished = false;
            let lifecycleAttempt = 0;
            const clearLifecycleTimeout = () => {
                if (hiddenSuspendTimeoutRef.current !== null) {
                    window.clearTimeout(hiddenSuspendTimeoutRef.current);
                    hiddenSuspendTimeoutRef.current = null;
                }
            };
            const disconnect = () => {
                if (finished) return;
                finished = true;
                clearLifecycleTimeout();
                if (document.hidden && socketRef.current === socket) {
                    socket.disconnect();
                }
            };

            if (!socket.connected || !roomIdRef.current || !myTelegramIdRef.current) {
                disconnect();
                return;
            }

            const persistServerSnapshot = () => {
                if (finished || !document.hidden || socketRef.current !== socket) return;
                const attempt = ++lifecycleAttempt;
                clearLifecycleTimeout();
                hiddenSuspendTimeoutRef.current = window.setTimeout(() => {
                    if (attempt !== lifecycleAttempt || finished) return;
                    if (lifecycleAttempt < 2) persistServerSnapshot();
                    else disconnect();
                }, HIDDEN_TAB_SNAPSHOT_TIMEOUT_MS);

                socket.timeout(HIDDEN_TAB_SNAPSHOT_TIMEOUT_MS).emit(
                    "client-lifecycle",
                    {
                        state: "hidden",
                        roomId: roomIdRef.current,
                        telegramId: myTelegramIdRef.current,
                        clientInstanceId: syncSessionIdRef.current,
                    },
                    (error?: unknown, response?: { ok?: boolean; persisted?: boolean }) => {
                        if (attempt !== lifecycleAttempt || finished) return;
                        clearLifecycleTimeout();
                        if (!error && response?.ok === true && response.persisted === true) {
                            disconnect();
                        } else if (lifecycleAttempt < 2) {
                            persistServerSnapshot();
                        } else {
                            // Local IndexedDB is already durable. After two
                            // explicit server failures, suspend and replay it
                            // on the next visible reconnect.
                            disconnect();
                        }
                    },
                );
            };
            persistServerSnapshot();
        };
        void persistThenSuspend();
    }, [clearFastCodeEdit, persistReliableQueue]);

    const connectWebSocket = useCallback(() => {
        const currentRoomId = roomIdRef.current;
        const currentSocketUrl = socketUrlRef.current;

        if (!currentRoomId) {
            setIsConnected(false);
            setIsJoinedRoom(false);
            return;
        }

        if (
            !shouldReconnectRef.current ||
            isHiddenPausedRef.current ||
            document.hidden
        ) return;
        if (!roomTokenRef.current) {
            return;
        }
        if (
            socketRef.current &&
            (socketRef.current.connected || socketRef.current.active)
        ) {
            return;
        }
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
        }

        let wsUrl;
        if (currentSocketUrl.startsWith("https://")) {
            wsUrl = currentSocketUrl.replace("https://", "wss://");
        } else if (currentSocketUrl.startsWith("http://")) {
            wsUrl = currentSocketUrl.replace("http://", "ws://");
        } else {
            wsUrl = `ws://${currentSocketUrl}`;
        }

        const socket = io(wsUrl, {
            transports: ["websocket"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 15000,
            randomizationFactor: 0.35,
            timeout: 10000,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            if (document.hidden || isHiddenPausedRef.current) {
                suspendHiddenSocket(socket);
                return;
            }
            if (connectionFailureTimeoutRef.current !== null) {
                window.clearTimeout(connectionFailureTimeoutRef.current);
                connectionFailureTimeoutRef.current = null;
            }
            setIsConnected(true);
            setConnectionError(null);
            isConnectedRef.current = true;
            connectionAttempts.current = 0;
            setCodeSyncState("connecting");
            joinRoom();
        });

        socket.on("room-session-replaced", () => {
            if (socketRef.current !== socket) {
                return;
            }

            shouldReconnectRef.current = false;
            sessionReplacedRef.current = true;
            canUploadCodeRef.current = false;
            clearFastCodeEdit();
            setIsSessionReplaced(true);
            setConnectionError("Комната открыта в другом окне");
        });

        socket.on("disconnect", (reason) => {
            if (socketRef.current !== socket) {
                return;
            }

            setIsConnected(false);
            setIsJoinedRoom(false);
            isConnectedRef.current = false;
            clearFastCodeEdit();
            syncGenerationRef.current += 1;
            setShowSyncSuccess(false);
            setCodeSyncState("reconnecting");
            clearIntervals();
            if (
                shouldReconnectRef.current &&
                !isHiddenPausedRef.current &&
                reason !== "io client disconnect" &&
                reason !== "io server disconnect"
            ) {
                setConnectionError(null);
                if (connectionFailureTimeoutRef.current === null) {
                    connectionFailureTimeoutRef.current = window.setTimeout(() => {
                        connectionFailureTimeoutRef.current = null;
                        if (!socket.connected && shouldReconnectRef.current) {
                            setConnectionError("Не удается восстановить связь с сервером");
                        }
                    }, FINAL_CONNECTION_ERROR_DELAY_MS);
                }
            }
            if (
                shouldReconnectRef.current &&
                !isHiddenPausedRef.current &&
                reason === "io server disconnect"
            ) {
                window.setTimeout(() => {
                    if (
                        socketRef.current === socket &&
                        shouldReconnectRef.current &&
                        socket.disconnected
                    ) {
                        socket.connect();
                    }
                }, 1_000);
            }
        });

        socket.on("connect_error", (error) => {
            setIsConnected(false);
            isConnectedRef.current = false;
            connectionAttempts.current += 1;
            setCodeSyncState("reconnecting");
            if (isHiddenPausedRef.current || document.hidden) {
                return;
            }
            if (connectionFailureTimeoutRef.current === null) {
                connectionFailureTimeoutRef.current = window.setTimeout(() => {
                    connectionFailureTimeoutRef.current = null;
                    if (!socket.connected && shouldReconnectRef.current) {
                        setConnectionError("Не удается восстановить связь с сервером");
                    }
                }, FINAL_CONNECTION_ERROR_DELAY_MS);
            }
        });

        socket.on("joined", (eventData) => {
            joinWithoutSavedIdTriedRef.current = false;
            setCodeEdits([]);
            setIsJoinedRoom(true);
            setCodeSyncState("joined");
            setConnectionError(null);
            sessionReplacedRef.current = false;
            setIsSessionReplaced(false);
            setIsCodeQueueRestored(false);
            setCompleted(eventData.completed);
            setIsTeacher(eventData.isTeacher);
            isTeacherRef.current = Boolean(eventData.isTeacher);
            completedRef.current = Boolean(eventData.completed);
            canUploadCodeRef.current = Boolean(
                eventData.isTeacher ||
                (!eventData.completed &&
                    eventData.roomPermissions?.studentEditCodeEnabled !== false),
            );
            setLanguage(eventData.language);
            const initialRoomCode =
                typeof eventData.joinedCode === "string"
                    ? eventData.joinedCode
                    : typeof eventData.lastCode === "string"
                    ? eventData.lastCode
                    : undefined;
            setJoinedCode(initialRoomCode);
            if (
                !localStorage.getItem("innoprog-username")?.trim() &&
                typeof eventData.username === "string" &&
                eventData.username.trim()
            ) {
                localStorage.setItem("innoprog-username", eventData.username.trim());
            }
            if (eventData.telegramId) {
                const joinedTelegramId = String(eventData.telegramId);
                selfIdsRef.current.add(joinedTelegramId);
                hasServerTelegramIdRef.current = true;
                myTelegramIdRef.current = joinedTelegramId;

                if (isRoomGeneratedTelegramId(joinedTelegramId)) {
                    localStorage.setItem(
                        `innoprog-room-client-id:${roomIdRef.current}`,
                        joinedTelegramId
                    );
                } else {
                    if (roomIdRef.current) {
                        localStorage.removeItem(
                            `innoprog-room-client-id:${roomIdRef.current}`
                        );
                    }
                    localStorage.setItem("telegramId", joinedTelegramId);
                }
            }

            setMyUserColor(getOrAssignUserColor(myTelegramIdRef.current));

            if (eventData.roomPermissions) {
                setRoomPermissions(eventData.roomPermissions);
            }

            if (ydocRef.current) {
                void synchronizeCode(socket);
            }

            const cursorsEnabled =
                eventData.roomPermissions?.studentCursorEnabled !== false;

            if (eventData.currentCursors && cursorsEnabled) {
                setCursors(
                    new Map(
                        eventData.currentCursors
                            .filter((cursor: CursorData) => !isSelfId(cursor.telegramId))
                            .map((cursor: CursorData) => [
                                cursor.telegramId,
                                {
                                    ...cursor,
                                    userColor: getOrAssignUserColor(cursor.telegramId),
                                },
                            ])
                    )
                );
            } else if (!cursorsEnabled) {
                setCursors(new Map());
            }

            if (eventData.currentSelections) {
                const selectionsMap = new Map();
                eventData.currentSelections.forEach((selection: any) => {
                    if (selection.telegramId && !isSelfId(selection.telegramId)) {
                        selectionsMap.set(selection.telegramId, {
                            line: selection.line,
                            column: selection.column,
                            selectionStart: selection.selectionStart,
                            selectionEnd: selection.selectionEnd,
                            selectedText: selection.selectedText,
                            userColor: getOrAssignUserColor(selection.telegramId),
                            username: selection.username,
                        });
                    }
                });
                setSelections(selectionsMap);
            }
        });
        socket.on("members-updated", (eventData) => {
            const members = eventData.members || [];
            const currentTelegramId = myTelegramIdRef.current;
            const membersWithSelfFlag = members.map((member: RoomMember) => ({
                ...member,
                isYourself: member.telegramId === currentTelegramId,
                userColor: getOrAssignUserColor(member.telegramId),
            }));
            const me = membersWithSelfFlag.find((member: RoomMember) => member.isYourself);
            if (
                me &&
                me.username &&
                !localStorage.getItem("innoprog-username")?.trim()
            ) {
                localStorage.setItem("innoprog-username", me.username);
            }
            setRoomMembers(membersWithSelfFlag);
        });

        socket.on("member-left", (eventData) => {
            if (!eventData.keepCursor) {
                setCursors((prev) => {
                    const newCursors = new Map(prev);
                    newCursors.delete(eventData.telegramId);
                    return newCursors;
                });
            } else {
                setCursors((prev) => {
                    const newCursors = new Map(prev);
                    const existingCursor = newCursors.get(eventData.telegramId);
                    if (existingCursor) {
                        newCursors.set(eventData.telegramId, {
                            ...existingCursor,
                            isOffline: true,
                        } as any);
                    }
                    return newCursors;
                });
            }

            setSelections((prev) => {
                const newSelections = new Map(prev);
                newSelections.delete(eventData.telegramId);
                return newSelections;
            });
        });

        socket.on("cursor-action", (eventData) => {
            if (eventData.telegramId && !isSelfId(eventData.telegramId)) {
                setCursors((prev) => {
                    const newCursors = new Map(prev);
                    newCursors.set(eventData.telegramId, {
                        telegramId: eventData.telegramId,
                        position: eventData.position,
                        userColor: getOrAssignUserColor(eventData.telegramId),
                        isYourself: false,
                        username: eventData.username,
                    });
                    return newCursors;
                });
            }
        });

        socket.on("selection-state", (eventData) => {
            const newSelections = new Map();
            eventData.selections.forEach((selection: any) => {
                if (selection.telegramId && !isSelfId(selection.telegramId)) {
                    newSelections.set(selection.telegramId, {
                        line: selection.line,
                        column: selection.column,
                        selectionStart: selection.selectionStart,
                        selectionEnd: selection.selectionEnd,
                        selectedText: selection.selectedText,
                        userColor: getOrAssignUserColor(selection.telegramId),
                        username: selection.username,
                    });
                }
            });

            setSelections(newSelections);
        });

        socket.on("complete-session", (eventData) => {
            toast(eventData.message);

            setTimeout(() => {
                const url = new URL(window.location.href);
                url.search = "";
                window.location.href = url.origin + url.pathname;
            }, 2000);
        });

        socket.on("code-edit-action", (eventData) => {
            if (eventData?.telegramId && isSelfId(eventData.telegramId)) {
                return;
            }

            enqueueCodeEdit(eventData.update);
        });

        socket.on("room-edited", (eventData) => {
            const hasPermissionsUpdate =
                eventData.studentCursorEnabled !== undefined ||
                eventData.studentSelectionEnabled !== undefined ||
                eventData.studentEditCodeEnabled !== undefined;

            if (hasPermissionsUpdate) {
                if (eventData.studentEditCodeEnabled !== undefined) {
                    canUploadCodeRef.current = Boolean(
                        isTeacherRef.current ||
                        (!completedRef.current && eventData.studentEditCodeEnabled),
                    );
                    if (!canUploadCodeRef.current) {
                        clearFastCodeEdit();
                        if (updateRetryTimeoutRef.current !== null) {
                            window.clearTimeout(updateRetryTimeoutRef.current);
                            updateRetryTimeoutRef.current = null;
                        }
                        if (
                            pendingUpdateRef.current ||
                            inFlightUpdateRef.current
                        ) {
                            setIsPersistRetrying(false);
                            setCodeSyncState("waiting-permission");
                        }
                    }
                    if (
                        canUploadCodeRef.current &&
                        socket.connected &&
                        ydocRef.current
                    ) {
                        void synchronizeCode(socket);
                    }
                }
                if (eventData.studentCursorEnabled === false) {
                    setCursors(new Map());
                }
                if (eventData.studentSelectionEnabled === false) {
                    setSelections(new Map());
                }

                setRoomPermissions((prev) => ({
                    studentCursorEnabled:
                        eventData.studentCursorEnabled ?? prev.studentCursorEnabled,
                    studentSelectionEnabled:
                        eventData.studentSelectionEnabled ?? prev.studentSelectionEnabled,
                    studentEditCodeEnabled:
                        eventData.studentEditCodeEnabled ?? prev.studentEditCodeEnabled,
                }));
            }

            if (eventData.language) {
                setLanguage(eventData.language);
            }
        });

        socket.on("room-state-loaded", (eventData) => {
            if (typeof eventData.lastCode === "string") {
                setJoinedCode(eventData.lastCode);
            }

            window.dispatchEvent(
                new CustomEvent("roomStateLoaded", {
                    detail: {
                        lastCode: eventData.lastCode,
                        participantCount: eventData.participantCount,
                    },
                })
            );
        });

        socket.on("clear-user-selections", (eventData) => {
            if (eventData.telegramId && !isSelfId(eventData.telegramId)) {
                setSelections((prev) => {
                    const newSelections = new Map(prev);
                    newSelections.delete(eventData.telegramId);
                    return newSelections;
                });
            }
        });

        socket.on("join-room:error", (eventData) => {
            if (roomIdRef.current && roomTokenRef.current && !roomTokenRefreshTriedRef.current) {
                roomTokenRefreshTriedRef.current = true;
                roomTokenRef.current = "";
                clearRoomSessionToken(roomIdRef.current);
                hasAuthoritativeRoomTelegramIdRef.current = false;
                setConnectionError(null);
                ensureRoomToken(true)
                    .then(() => joinRoom(myTelegramIdRef.current))
                    .catch((error) => {
                        setConnectionError(error?.message || eventData.message);
                    });
                return;
            }

            if (hasAuthoritativeRoomTelegramIdRef.current) {
                setConnectionError(eventData.message);
                return;
            }

            if (!joinWithoutSavedIdTriedRef.current) {
                const staleRoomId = roomIdRef.current;
                if (staleRoomId) {
                    localStorage.removeItem(`innoprog-room-client-id:${staleRoomId}`);
                }

                if (isRoomGeneratedTelegramId(myTelegramIdRef.current)) {
                    selfIdsRef.current.delete(myTelegramIdRef.current);
                    myTelegramIdRef.current =
                        myTelegramId && !isRoomGeneratedTelegramId(myTelegramId)
                            ? myTelegramId
                            : "";
                }

                hasServerTelegramIdRef.current = false;
                joinWithoutSavedIdTriedRef.current = true;
                setConnectionError(null);
                joinRoom(null);
                return;
            }

            setConnectionError(eventData.message);
        });
    }, [
        joinRoom,
        clearIntervals,
        isSelfId,
        enqueueCodeEdit,
        getOrAssignUserColor,
        myTelegramId,
        ensureRoomToken,
        synchronizeCode,
        clearFastCodeEdit,
        suspendHiddenSocket,
    ]);

    useEffect(() => {
        socketUrlRef.current = socketUrl;
        suggestedUsernameRef.current = suggestedUsername?.trim() || "";
        const wasRoomId = roomIdRef.current;
        const roomChanged = wasRoomId !== roomId;
        const hasAuthoritativeRoomTelegramId = Boolean(
            roomId && myTelegramId && !isRoomGeneratedTelegramId(myTelegramId)
        );
        hasAuthoritativeRoomTelegramIdRef.current = hasAuthoritativeRoomTelegramId;

        if (hasAuthoritativeRoomTelegramId && roomId) {
            localStorage.removeItem(`innoprog-room-client-id:${roomId}`);
        }

        if (roomChanged) {
            syncGenerationRef.current += 1;
            clearFastCodeEdit();
            if (syncRetryTimeoutRef.current !== null) {
                window.clearTimeout(syncRetryTimeoutRef.current);
                syncRetryTimeoutRef.current = null;
            }
            if (updateRetryTimeoutRef.current !== null) {
                window.clearTimeout(updateRetryTimeoutRef.current);
                updateRetryTimeoutRef.current = null;
            }
            if (durabilityRetryTimeoutRef.current !== null) {
                window.clearTimeout(durabilityRetryTimeoutRef.current);
                durabilityRetryTimeoutRef.current = null;
            }
            void persistReliableQueue();
            hasServerTelegramIdRef.current = false;
            roomTokenRefreshTriedRef.current = false;
            roomTokenRequestRef.current = null;
            selfIdsRef.current.clear();
            myTelegramIdRef.current = myTelegramId || "";
        }

        if (myTelegramId) {
            selfIdsRef.current.add(myTelegramId);
            if (!hasServerTelegramIdRef.current || hasAuthoritativeRoomTelegramId) {
                myTelegramIdRef.current = myTelegramId;
            }
            setMyUserColor(getOrAssignUserColor(myTelegramIdRef.current));
        }
        roomIdRef.current = roomId;
        if (roomChanged) {
            roomTokenRef.current = roomToken || "";
            roomLaunchCodeRef.current = roomLaunchCode || "";
        } else {
            if (roomToken) {
                roomTokenRef.current = roomToken;
            }
            if (roomLaunchCode) {
                roomLaunchCodeRef.current = roomLaunchCode;
            }
        }

        if (roomChanged) {
            joinWithoutSavedIdTriedRef.current = false;
            setJoinedCode(undefined);
            setCodeEdits([]);
            setCodeSyncState("connecting");
            setShowSyncSuccess(false);
            setHasDurableStorageError(false);
            hasDurableStorageErrorRef.current = false;
            setIsPersistRetrying(false);
            setIsSessionReplaced(false);
            queueLoadedForRef.current = "";
            pendingUpdateRef.current = null;
            inFlightUpdateRef.current = null;
            nextSequenceRef.current = 1;
            syncSessionIdRef.current = createSyncSessionId();
            canUploadCodeRef.current = false;
            isTeacherRef.current = false;
            completedRef.current = false;
            sessionReplacedRef.current = false;
            assignedColorsRef.current.clear();
            if (!roomId) {
                shouldReconnectRef.current = false;
                setIsConnected(false);
                setIsJoinedRoom(false);
                setConnectionError(null);
                setMyUserColor("#FF6B6B");
                if (pingIntervalRef.current) {
                    clearInterval(pingIntervalRef.current);
                    pingIntervalRef.current = null;
                }
                if (heartbeatTimeoutRef.current) {
                    clearTimeout(heartbeatTimeoutRef.current);
                    heartbeatTimeoutRef.current = null;
                }
                if (socketRef.current) {
                    socketRef.current.close();
                    socketRef.current = null;
                }
                return;
            }

            if (roomId) {
                shouldReconnectRef.current = true;
                setConnectionError(null);
                connectionAttempts.current = 0;

                if (
                    wasRoomId &&
                    isConnectedRef.current &&
                    socketRef.current?.connected
                ) {
                    joinRoom(myTelegramIdRef.current);
                    return;
                }

                if (socketRef.current) {
                    socketRef.current.close();
                    socketRef.current = null;
                }
                return;
            }
        }

        if (
            !roomChanged &&
            hasAuthoritativeRoomTelegramId &&
            socketRef.current?.connected
        ) {
            hasServerTelegramIdRef.current = false;
            joinWithoutSavedIdTriedRef.current = false;
            setConnectionError(null);
            joinRoom(myTelegramId);
        }
    }, [
        socketUrl,
        myTelegramId,
        roomId,
        roomToken,
        roomLaunchCode,
        suggestedUsername,
        getOrAssignUserColor,
        joinRoom,
        clearFastCodeEdit,
        persistReliableQueue,
    ]);

    useEffect(() => {
        shouldReconnectRef.current = true;
        let cancelled = false;
        if (roomId && !document.hidden) {
            setConnectionError(null);
            connectionAttempts.current = 0;
            if (roomTokenRef.current) {
                connectWebSocket();
            } else {
                ensureRoomToken()
                    .then((ready) => {
                        if (!cancelled && ready) {
                            connectWebSocket();
                        }
                    })
                    .catch((error) => {
                        if (!cancelled) {
                            setConnectionError(error?.message || "Не удалось открыть комнату");
                        }
                    });
            }
        } else if (roomId) {
            isHiddenPausedRef.current = true;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (pendingUpdateRef.current || inFlightUpdateRef.current) {
                event.preventDefault();
                event.returnValue = "";
            }
            shouldReconnectRef.current = false;
            clearFastCodeEdit();
            clearIntervals();
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
        };

        const syncOnActiveTab = () => {
            if (!roomIdRef.current || !shouldReconnectRef.current) {
                return;
            }

            if (socketRef.current?.connected) {
                setConnectionError(null);
                connectionAttempts.current = 0;
                if (!isConnectedRef.current) {
                    joinRoom();
                }
                return;
            }

            if (socketRef.current?.active) {
                return;
            }

            if (socketRef.current?.disconnected) {
                setConnectionError(null);
                connectionAttempts.current = 0;
                socketRef.current.connect();
                return;
            }

            ensureRoomToken()
                .then((ready) => {
                    if (ready) connectWebSocket();
                })
                .catch(() => undefined);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                const socket = socketRef.current;
                if (socket) suspendHiddenSocket(socket);
                else isHiddenPausedRef.current = true;
                return;
            }

            if (hiddenSuspendTimeoutRef.current !== null) {
                window.clearTimeout(hiddenSuspendTimeoutRef.current);
                hiddenSuspendTimeoutRef.current = null;
            }
            isHiddenPausedRef.current = false;
            syncOnActiveTab();
        };

        const handleWindowFocus = () => {
            if (document.hidden) return;
            syncOnActiveTab();
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleWindowFocus);

        return () => {
            cancelled = true;
            shouldReconnectRef.current = false;

            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
            if (syncRetryTimeoutRef.current !== null) {
                window.clearTimeout(syncRetryTimeoutRef.current);
                syncRetryTimeoutRef.current = null;
            }
            if (syncSuccessTimeoutRef.current !== null) {
                window.clearTimeout(syncSuccessTimeoutRef.current);
                syncSuccessTimeoutRef.current = null;
            }
            if (updateRetryTimeoutRef.current !== null) {
                window.clearTimeout(updateRetryTimeoutRef.current);
                updateRetryTimeoutRef.current = null;
            }
            if (durabilityRetryTimeoutRef.current !== null) {
                window.clearTimeout(durabilityRetryTimeoutRef.current);
                durabilityRetryTimeoutRef.current = null;
            }
            if (connectionFailureTimeoutRef.current !== null) {
                window.clearTimeout(connectionFailureTimeoutRef.current);
                connectionFailureTimeoutRef.current = null;
            }
            if (hiddenSuspendTimeoutRef.current !== null) {
                window.clearTimeout(hiddenSuspendTimeoutRef.current);
                hiddenSuspendTimeoutRef.current = null;
            }
            clearFastCodeEdit();
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [
        roomId,
        connectWebSocket,
        clearIntervals,
        clearFastCodeEdit,
        ensureRoomToken,
        joinRoom,
        suspendHiddenSocket,
    ]);

    const sendCursorPosition = useCallback(
        (position: [number, number]) => {
            if (socketRef.current?.connected && roomIdRef.current && !completed && roomPermissions.studentCursorEnabled) {
                const telegramId = getCurrentTelegramId();
                if (!telegramId) return;

                socketRef.current.emit("cursor", {
                    telegramId,
                    roomId: roomIdRef.current,
                    position,
                    logs: [],
                });
            }
        },
        [completed, roomPermissions.studentCursorEnabled, getCurrentTelegramId]
    );

    const sendSelection = useCallback(
        (selectionData: {
            line?: number;
            column?: number;
            selectionStart?: { line: number; column: number };
            selectionEnd?: { line: number; column: number };
            selectedText?: string;
            clearSelection?: boolean;
        }) => {
            if (socketRef.current?.connected && roomIdRef.current && ((!completed && roomPermissions.studentSelectionEnabled) || isTeacher)) {
                const telegramId = getCurrentTelegramId();
                if (!telegramId) return;

                socketRef.current.emit("selection", {
                    telegramId,
                    roomId: roomIdRef.current,
                    ...selectionData,
                });
            }
        },
        [completed, roomPermissions.studentSelectionEnabled, isTeacher, getCurrentTelegramId]
    );

    const queueCodeEdit = useCallback(
        (update: Uint8Array) => {
            if (
                !roomIdRef.current ||
                sessionReplacedRef.current ||
                completed ||
                (!roomPermissions.studentEditCodeEnabled && !isTeacher)
            ) return;

            const roomAtEdit = roomIdRef.current;
            const generationAtEdit = syncGenerationRef.current;

            pendingUpdateRef.current = pendingUpdateRef.current
                ? Y.mergeUpdates([pendingUpdateRef.current, update])
                : update;
            setHasPendingCodeChanges(true);
            void persistReliableQueue().then((persisted) => {
                if (persisted) {
                    scheduleFastCodeEdit(update, roomAtEdit, generationAtEdit);
                    flushReliableQueueRef.current();
                }
            });
        },
        [
            completed,
            roomPermissions.studentEditCodeEnabled,
            isTeacher,
            persistReliableQueue,
            scheduleFastCodeEdit,
        ]
    );


    const sendEditMember = useCallback(
        (username?: string, telegramId?: string) => {
            if (completed) return;
            if (socketRef.current?.connected && roomIdRef.current) {
                const currentTelegramId = getCurrentTelegramId();
                if (!currentTelegramId) return;

                socketRef.current.emit("edit-member", {
                    changeTelegramId: telegramId || currentTelegramId,
                    telegramId: currentTelegramId,
                    roomId: roomIdRef.current,
                    username,
                });
            }
        },
        [completed, getCurrentTelegramId]
    );

    const sendChangeLanguage = useCallback((language: Language) => {
        if (
            isSupportedRoomLanguage(language) &&
            socketRef.current?.connected &&
            roomIdRef.current &&
            !completed
        ) {
            const telegramId = getCurrentTelegramId();
            if (!telegramId) return;

            socketRef.current.emit('edit-room', {
                telegramId,
                roomId: roomIdRef.current,
                language
            })
        }
    }, [completed, getCurrentTelegramId]);

    const sendRoomPermissions = useCallback(
        (permissions: RoomPermissions) => {
            if (socketRef.current?.connected && roomIdRef.current && !completed) {
                const telegramId = getCurrentTelegramId();
                if (!telegramId) return;

                socketRef.current.emit("edit-room", {
                    telegramId,
                    roomId: roomIdRef.current,
                    ...permissions
                });
            }
        },
        [completed, getCurrentTelegramId]
    );

    return {
        socket: socketRef.current,
        isConnected,
        isJoinedRoom,
        roomMembers,
        cursors,
        selections,
        myUserColor,
        roomPermissions,
        isTeacher,
        sendCursorPosition,
        sendSelection,
        updatesFromProps: codeEdits,
        telegramId: myTelegramIdRef.current,
        onSendUpdate: queueCodeEdit,
        sendEditMember,
        sendRoomPermissions,
        connectionError,
        completeSession,
        completed,
        sendChangeLanguage,
        language,
        joinedCode,
        isRemoteUpdate,
        codeSyncState,
        hasPendingCodeChanges,
        showSyncSuccess,
        hasDurableStorageError,
        isPersistRetrying,
        isSessionReplaced,
        isCodeQueueRestored,
        bindYDoc,
    };
};
