export const getRoomTokenExpiration = (token?: string | null): number | undefined => {
  if (!token) {
    return undefined;
  }

  try {
    const [, encodedPayload] = token.split(".");
    if (!encodedPayload) {
      return undefined;
    }

    const normalizedPayload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      "="
    );
    const payload = JSON.parse(window.atob(paddedPayload));

    return typeof payload?.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
};

export const isRoomTokenExpired = (
  token?: string | null,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean => {
  const exp = getRoomTokenExpiration(token);
  return typeof exp === "number" && exp <= nowSeconds;
};
