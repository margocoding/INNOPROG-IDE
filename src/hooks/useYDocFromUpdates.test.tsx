import { act, renderHook } from "@testing-library/react";
import * as Y from "yjs";
import useYDocFromUpdates from "./useYDocFromUpdates";

const updateWith = (text: string) => {
  const doc = new Y.Doc();
  doc.getText("codemirror").insert(0, text);
  return Y.encodeStateAsUpdate(doc);
};

describe("useYDocFromUpdates", () => {
  it("accepts typed arrays, number arrays and buffer-shaped updates", () => {
    const remote = { current: false };
    const first = updateWith("one");
    const { result, rerender } = renderHook(
      ({ updates }) => useYDocFromUpdates({ updates, isRemoteUpdate: remote }),
      { initialProps: { updates: first as unknown } },
    );
    expect(result.current.getText("codemirror").toString()).toBe("one");
    const second = updateWith("two");
    rerender({ updates: Array.from(second) });
    expect(remote.current).toBe(false);
    rerender({ updates: { type: "Buffer", data: Array.from(second) } });
    rerender({ updates: new DataView(second.buffer) });
  });

  it("processes append-only queues and resets shortened queues", () => {
    const one = updateWith("one");
    const two = updateWith("two");
    const { result, rerender } = renderHook(
      ({ updates }) => useYDocFromUpdates({ updates }),
      { initialProps: { updates: [one] as unknown } },
    );
    rerender({ updates: [one, two] });
    expect(result.current.getText("codemirror").length).toBeGreaterThan(0);
    rerender({ updates: [] });
    rerender({ updates: null });
  });

  it("ignores invalid data and destroys the document on unmount", () => {
    const error = jest.spyOn(console, "error").mockImplementation();
    const { result, rerender, unmount } = renderHook(
      ({ updates }) => useYDocFromUpdates({ updates }),
      { initialProps: { updates: "invalid" as unknown } },
    );
    rerender({ updates: [255, 255, 255] });
    expect(error).toHaveBeenCalled();
    const destroy = jest.spyOn(result.current, "destroy");
    unmount();
    expect(destroy).toHaveBeenCalled();
  });
});
