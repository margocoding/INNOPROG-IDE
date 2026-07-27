const DEFAULT_ALLOWED_PARENT_ORIGINS = [
  "https://app.innoprog.ru",
  "https://api.innoprog.ru",
  "https://cabinet.innoprog.ru",
];

const getOrigin = (value: string | null | undefined): string => {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

const getAllowedOrigins = (): Set<string> => {
  const configured = (process.env.REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => getOrigin(value.trim()))
    .filter(Boolean);

  return new Set(
    [...DEFAULT_ALLOWED_PARENT_ORIGINS, ...configured]
      .map(getOrigin)
      .filter(Boolean),
  );
};

export const resolveParentOrigin = (): string => {
  const allowedOrigins = getAllowedOrigins();
  const queryOrigin = new URLSearchParams(window.location.search).get("parent_origin");
  const candidates = [
    queryOrigin,
    document.referrer,
    process.env.REACT_APP_PARENT_APP_ORIGIN,
  ];

  for (const candidate of candidates) {
    const origin = getOrigin(candidate);
    if (origin && origin !== window.location.origin && allowedOrigins.has(origin)) {
      return origin;
    }
  }
  return "";
};

export const postToParent = (payload: Record<string, unknown>): boolean => {
  if (window.parent === window || typeof window.parent?.postMessage !== "function") {
    return false;
  }
  const targetOrigin = resolveParentOrigin();
  if (!targetOrigin) return false;
  window.parent.postMessage(payload, targetOrigin);
  return true;
};
