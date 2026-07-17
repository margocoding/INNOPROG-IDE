import { fireEvent, render } from "@testing-library/react";
import Resizer from "./Resizer";

describe("Resizer", () => {
  it("resizes within bounds and clears drag state", () => {
    const onResize = jest.fn();
    const { container } = render(
      <div className="flex">
        <Resizer onResize={onResize} minSize={20} maxSize={80} />
      </div>,
    );
    const parent = container.firstElementChild as HTMLElement;
    jest.spyOn(parent, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 1000,
    } as DOMRect);
    const handle = container.querySelector(".resizer") as HTMLElement;
    (handle as any).setPointerCapture = jest.fn();
    fireEvent.pointerDown(handle, { pointerId: 1 });
    document.dispatchEvent(new MouseEvent("pointermove", { clientX: 900, bubbles: true }));
    expect(onResize).toHaveBeenCalledWith(80);
    fireEvent.pointerUp(document);
    expect(document.body).not.toHaveClass("resizer-dragging");
  });
});
